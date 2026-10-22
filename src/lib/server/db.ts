import "server-only";
import { neon, Pool, type NeonQueryFunction } from "@neondatabase/serverless";
import { env } from "./env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Query = (<R extends Row = Row>(text: string, params?: unknown[]) => Promise<R[]>) & {
  /** Inside withTx: run `fn` only if the transaction commits. Elsewhere: run immediately. */
  onCommit?: (fn: () => void) => void;
};

let http: NeonQueryFunction<false, false> | undefined;

/** One-shot query over HTTP (fastest path for reads). The client is created on first use. */
export const query: Query = (text, params = []) => {
  http ??= neon(env("DATABASE_URL"));
  return http.query(text, params) as never;
};

/**
 * Runs `fn` inside a real Postgres transaction (BEGIN/COMMIT, rolled back on any error),
 * so a record change and its audit entry are written together or not at all.
 */
export async function withTx<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: env("DATABASE_URL") });
  const client = await pool.connect();
  const hooks: (() => void)[] = [];
  const q: Query = async (text, params = []) => (await client.query(text, params)).rows;
  q.onCommit = (hook) => hooks.push(hook);
  try {
    await client.query("begin");
    const result = await fn(q);
    await client.query("commit");
    hooks.forEach((hook) => hook());
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
