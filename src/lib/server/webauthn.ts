import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { HttpError } from "./http";

// Fingerprint / face sign-in uses WebAuthn passkeys: the phone keeps a private key unlocked by its
// biometrics, and the server only stores the matching public key. Biometric data never leaves the device.

export const RP_NAME = "Flat Split";
const CHALLENGE_COOKIE = "fs_wa";

/** The site identity a passkey is bound to: this deployment's hostname and exact origin. */
export function relyingParty(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) throw new HttpError(400, "Missing host");
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { rpID: host.split(":")[0], origin: `${proto}://${host}` };
}

type Purpose = "register" | "login" | "unlock";
const key = () => new TextEncoder().encode(env("SESSION_SECRET"));

/** Remembers the one-time challenge for 5 minutes in a signed, httpOnly cookie. */
export async function saveChallenge(challenge: string, purpose: Purpose) {
  const token = await new SignJWT({ challenge, purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(key());
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/passkeys",
    maxAge: 300,
  });
}

/** Returns the pending challenge for `purpose` and clears it, so each challenge works only once. */
export async function takeChallenge(purpose: Purpose): Promise<string> {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete({ name: CHALLENGE_COOKIE, path: "/api/passkeys" });
  if (!token) throw new HttpError(400, "That took too long. Please try again.");
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.purpose !== purpose || typeof payload.challenge !== "string") throw new Error();
    return payload.challenge;
  } catch {
    throw new HttpError(400, "That took too long. Please try again.");
  }
}

/** A short device label from the User-Agent, so people can tell their phones apart in Settings. */
export function deviceLabel(req: Request) {
  const ua = req.headers.get("user-agent") ?? "";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Device";
  const browser = /EdgA?\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "";
  return browser ? `${os} · ${browser}` : os;
}

export const toB64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
export const fromB64url = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));
