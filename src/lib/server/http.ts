import "server-only";
import { ZodError } from "zod";
import { runScoped } from "./db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Wraps a route handler: a per-request house scope (see db.ts), same-origin check for writes,
 * JSON responses, uniform errors.
 */
export function route<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return (req: Request, ctx: C): Promise<Response> => runScoped(() => handle(fn, req, ctx));
}

async function handle<C>(fn: (req: Request, ctx: C) => Promise<unknown>, req: Request, ctx: C): Promise<Response> {
  try {
    if (MUTATING.has(req.method)) {
      const origin = req.headers.get("origin");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      if (origin && host && new URL(origin).host !== host) throw new HttpError(403, "Cross-site request blocked");
    }
    const result = await fn(req, ctx);
    return result instanceof Response ? result : Response.json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
    if (err instanceof ZodError) {
      return Response.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
