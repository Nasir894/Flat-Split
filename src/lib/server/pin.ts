import "server-only";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { asSystem, query, setHouse, type Query } from "./db";
import { HttpError } from "./http";
import { LOCK_MINUTES, MAX_ATTEMPTS, hashPin, verifyPin } from "./auth";

export const pinSchema = z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits");

/** Verifies a member's PIN with lockout after repeated failures. Throws on failure. */
export async function checkPin(userId: string, pin: string) {
  const [u] = await query<{ pin_hash: string | null; failed_attempts: number; locked_until: Date | null; status: string }>(
    "select pin_hash, failed_attempts, locked_until, status from users where id = $1",
    [userId],
  );
  if (!u) throw new HttpError(401, "Unknown member");
  if (u.status !== "active") throw new HttpError(403, "Your join request is still waiting for a flatmate's approval.");
  if (!u.pin_hash) throw new HttpError(400, "This account needs a new PIN. Tap “Forgot PIN?” to set one.");
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000);
    throw new HttpError(429, `Too many wrong PINs. Try again in ${mins} min.`);
  }
  if (await verifyPin(pin, u.pin_hash)) {
    if (u.failed_attempts) await query("update users set failed_attempts = 0, locked_until = null where id = $1", [userId]);
    return;
  }
  const [r] = await query<{ failed_attempts: number }>(
    `update users set
       failed_attempts = case when failed_attempts + 1 >= $2 then 0 else failed_attempts + 1 end,
       locked_until = case when failed_attempts + 1 >= $2 then now() + make_interval(mins => $3) else null end
     where id = $1 returning failed_attempts`,
    [userId, MAX_ATTEMPTS, LOCK_MINUTES],
  );
  if (r.failed_attempts === 0) throw new HttpError(429, `Too many wrong PINs. Locked for ${LOCK_MINUTES} min.`);
  throw new HttpError(401, `Wrong PIN. ${MAX_ATTEMPTS - r.failed_attempts} tries left.`);
}

export const houseCodeSchema = z
  .string()
  .trim()
  .min(6, "House code must be at least 6 characters")
  .max(40, "House code is too long");

/** The house whose code this is (searches every house), or null. */
export async function houseByCode(code: string): Promise<string | null> {
  const [h] = await asSystem(() => query<{ id: string }>("select id from houses where lower(code) = lower($1)", [code.trim()]));
  return h?.id ?? null;
}

/**
 * Checks a house-code guess, with a DB-backed limiter (10 wrong guesses per 15 min per client).
 * On success, this request now works in that house. With `houseId`, the code must be that house's.
 */
export async function guardHouseCode(req: Request, code: string, houseId?: string): Promise<string> {
  const key = clientKey(req);
  await assertNotLimited(key, 10);
  const found = code.trim() ? await houseByCode(code) : null;
  if (!found || (houseId && found !== houseId)) {
    await recordFailure(key);
    throw new HttpError(401, "Wrong house code");
  }
  setHouse(found);
  return found;
}

export const clientKey = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

/** Throws 429 once `key` has `max` failures in the last 15 minutes. */
export async function assertNotLimited(key: string, max: number) {
  const [{ n }] = await query<{ n: number }>(
    "select count(*)::int as n from auth_failures where key = $1 and at > now() - interval '15 minutes'",
    [key],
  );
  if (n >= max) throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
}

export async function recordFailure(key: string) {
  await query("insert into auth_failures (key) values ($1)", [key]);
  await query("delete from auth_failures where at < now() - interval '1 day'");
}

// Recovery codes: 8 chars from an unambiguous alphabet (no 0/O, 1/I/L), shown as XXXX-XXXX.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newRecoveryCode() {
  const chars = Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Issues a fresh recovery code for the user (invalidating the old one) and returns it in plain text once. */
export async function rotateRecoveryCode(q: Query, userId: string) {
  const code = newRecoveryCode();
  await q("update users set recovery_hash = $2 where id = $1", [userId, await hashPin(normalizeRecoveryCode(code))]);
  return code;
}
