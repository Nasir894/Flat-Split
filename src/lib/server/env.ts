import "server-only";
import { HttpError } from "./http";

/** Reads a required environment variable, failing with a message that says exactly what to fix. */
export function env(name: "DATABASE_URL" | "SESSION_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new HttpError(500, `Server setup problem: ${name} is missing. Add it in Vercel → Settings → Environment Variables, then redeploy.`);
  }
  return value;
}
