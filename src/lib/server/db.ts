import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { neon, Pool, type NeonQueryFunction } from "@neondatabase/serverless";
import { env } from "./env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Query = (<R extends Row = Row>(text: string, params?: unknown[]) => Promise<R[]>) & {
  /** Inside withTx: run `fn` only if the transaction commits. Elsewhere: run immediately. */
  onCommit?: (fn: () => void) => void;
};

// ---------- which house a query belongs to ----------
// Every request runs in a scope that knows its house. Queries then run as the `flat_app` role with
// app.house_id set, and row-level security (db/schema.sql) limits them to that house. With no house
// known yet they see nothing. `asSystem` is only for sign-in lookups that must search every house.
type Scope = { houseId?: string; system?: boolean };
const scope = new AsyncLocalStorage<Scope>();

/** Starts a request scope (done by `route()`); the house is filled in once the caller is known. */
export const runScoped = <T>(fn: () => Promise<T>) => scope.run({}, fn);

/** Sets the current request's house (after sign-in, or once a house code has been checked). */
export function setHouse(houseId: string) {
  const s = scope.getStore();
  if (!s) throw new Error("setHouse called outside a request scope");
  s.houseId = houseId;
}

export const currentHouse = () => scope.getStore()?.houseId ?? null;

/** Runs `fn` for one house (e.g. the daily Telegram job, which goes house by house). */
export const inHouse = <T>(houseId: string, fn: () => Promise<T>) => scope.run({ houseId }, fn);

/** Runs `fn` across all houses. Only for finding which house someone belongs to. */
export const asSystem = <T>(fn: () => Promise<T>) => scope.run({ system: true }, fn);

const ROLE = "set local role flat_app";
const HOUSE = "select set_config('app.house_id', $1, true)";

let http: NeonQueryFunction<false, false> | undefined;

/** One-shot query over HTTP (fastest path for reads). The client is created on first use. */
export const query: Query = async (text, params = []) => {
  http ??= neon(env("DATABASE_URL"));
  const s = scope.getStore();
  if (s?.system) return http.query(text, params) as never;
  const steps = [http.query(ROLE), ...(s?.houseId ? [http.query(HOUSE, [s.houseId])] : []), http.query(text, params)];
  const results = await http.transaction(steps);
  return results[results.length - 1] as never;
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
    const s = scope.getStore();
    if (!s?.system) {
      await client.query(ROLE);
      if (s?.houseId) await client.query(HOUSE, [s.houseId]);
    }
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
