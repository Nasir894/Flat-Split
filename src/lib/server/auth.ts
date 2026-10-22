import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { HttpError } from "./http";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
const COOKIE = "fs_session";
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days; the on-device PIN lock guards reopening

export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

// A 4-digit PIN has little entropy, so the hash is peppered with a server-only secret:
// a leaked database alone is not enough to brute-force PINs offline.
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pin + process.env.SESSION_SECRET, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [, salt, hash] = stored.split("$");
  const actual = await scrypt(pin + process.env.SESSION_SECRET, Buffer.from(salt, "base64"), 32);
  return timingSafeEqual(actual, Buffer.from(hash, "base64"));
}

export async function startSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function sessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (payload.typ === "pending") return null; // a pending token is never a real session
    return payload.sub ?? null;
  } catch {
    return null;
  }
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
    .sign(secret);
  (await cookies()).set(PENDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function pendingUserId(): Promise<string | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return payload.typ === "pending" ? (payload.sub ?? null) : null;
  } catch {
    return null;
  }
}

export async function endPendingSession() {
  (await cookies()).delete(PENDING_COOKIE);
}

export async function requireUser(): Promise<string> {
  const id = await sessionUserId();
  if (!id) throw new HttpError(401, "Please sign in");
  return id;
}
