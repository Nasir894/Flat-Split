import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { HttpError } from "./http";
import { env } from "./env";
import { asSystem, query, setHouse } from "./db";

export type Role = "member" | "guest";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
// Read lazily so a missing SESSION_SECRET fails loudly instead of signing with "undefined".
const key = () => new TextEncoder().encode(env("SESSION_SECRET"));
const COOKIE = "fs_session";
const SIGNED_IN_HINT = "fs_in";
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days; the on-device PIN lock guards reopening

export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

// A 4-digit PIN has little entropy, so the hash is peppered with a server-only secret:
// a leaked database alone is not enough to brute-force PINs offline.
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pin + env("SESSION_SECRET"), salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [, salt, hash] = stored.split("$");
  const actual = await scrypt(pin + env("SESSION_SECRET"), Buffer.from(salt, "base64"), 32);
  return timingSafeEqual(actual, Buffer.from(hash, "base64"));
}

/** The house a member belongs to (searches every house, so only for sign-in and old sessions). */
export async function houseOfUser(userId: string): Promise<string | null> {
  const [u] = await asSystem(() => query<{ house_id: string }>("select house_id from users where id = $1", [userId]));
  return u?.house_id ?? null;
}

export async function startSession(userId: string) {
  // Role and house travel in the session so every request can be checked without a database lookup.
  const [u] = await asSystem(() => query<{ role: Role; house_id: string }>("select role, house_id from users where id = $1", [userId]));
  if (!u) throw new HttpError(401, "Unknown member");
  setHouse(u.house_id);
  const token = await new SignJWT({ role: u.role, hid: u.house_id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  // Non-secret hint readable by the page, so it can skip straight to sign-in when there is
  // no session instead of waiting for a server round trip. Grants no access by itself.
  (await cookies()).set(SIGNED_IN_HINT, "1", { sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

/** Re-sets the sign-in hint for sessions created before the hint existed. */
export async function setSignedInHint() {
  (await cookies()).set(SIGNED_IN_HINT, "1", { sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(SIGNED_IN_HINT);
}

/** The signed-in person, if any. Also points this request's database queries at their house. */
export async function sessionUser(): Promise<{ id: string; role: Role; houseId: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let payload;
  try {
    ({ payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] }));
  } catch {
    return null;
  }
  if (payload.typ || !payload.sub) return null; // pending / widget tokens are never a real session
  // Sessions from before houses existed carry no house: look it up.
  const houseId = typeof payload.hid === "string" ? payload.hid : await houseOfUser(payload.sub);
  if (!houseId) return null;
  setHouse(houseId);
  // Sessions from before roles existed belong to home sharers.
  return { id: payload.sub, role: payload.role === "guest" ? "guest" : "member", houseId };
}

export async function sessionUserId(): Promise<string | null> {
  return (await sessionUser())?.id ?? null;
}

/** Signed in as anyone (home sharer or tour guest). */
export async function requireSession() {
  const u = await sessionUser();
  if (!u) throw new HttpError(401, "Please sign in");
  return u;
}

// Home-screen widget key: given to the companion phone app once its owner is signed in. It can only
// read that person's balance (GET /api/widget), never sign in or change anything.
const WIDGET_DAYS = 400;

export async function issueWidgetToken(userId: string, houseId: string) {
  return new SignJWT({ typ: "widget", hid: houseId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${WIDGET_DAYS}d`)
    .sign(key());
}

/** The member a widget key belongs to; also points this request at their house. */
export async function widgetUser(req: Request): Promise<string> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Missing widget key");
  let payload;
  try {
    ({ payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] }));
  } catch {
    throw new HttpError(401, "Widget key expired. Open the Flat Split app once to renew it.");
  }
  if (payload.typ !== "widget" || !payload.sub || typeof payload.hid !== "string") throw new HttpError(401, "Not a widget key");
  setHouse(payload.hid);
  return payload.sub;
}

/** Home sharers only: guests can only use the tour section. */
export async function requireMember(): Promise<string> {
  const u = await requireSession();
  if (u.role !== "member") throw new HttpError(403, "Only home sharers can do this");
  return u.id;
}

// A member waiting for approval gets a separate "pending" cookie. It grants no access to
// house data; it only lets that device ask whether the request was approved yet.
const PENDING_COOKIE = "fs_pending";

export async function startPendingSession(userId: string) {
  const token = await new SignJWT({ typ: "pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key());
  (await cookies()).set(PENDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** This device's own join request, if any. Also points this request's queries at that house. */
export async function pendingUserId(): Promise<string | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  let payload;
  try {
    ({ payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] }));
  } catch {
    return null;
  }
  if (payload.typ !== "pending" || !payload.sub) return null;
  const houseId = await houseOfUser(payload.sub);
  if (houseId) setHouse(houseId);
  return payload.sub;
}

export async function endPendingSession() {
  (await cookies()).delete(PENDING_COOKIE);
}

export async function requireUser(): Promise<string> {
  const id = await sessionUserId();
  if (!id) throw new HttpError(401, "Please sign in");
  return id;
}
