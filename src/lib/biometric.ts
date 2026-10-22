// Fingerprint / face sign-in in the browser (WebAuthn passkeys). The helper library is only
// downloaded when one of these is actually used, so it doesn't slow down normal page loads.
import { api } from "./api";

const FLAG = "fs_bio"; // this device has fingerprint/face turned on

export function biometricEnabledHere(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

function setEnabledHere(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, "1");
    else localStorage.removeItem(FLAG);
  } catch {}
}

/** True when this phone/computer has a built-in fingerprint, face or screen-lock check. */
export async function biometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function friendly(err: unknown): Error {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return new Error("Cancelled. You can use your PIN instead.");
  if (name === "InvalidStateError") return new Error("Fingerprint/face is already set up on this device.");
  return err instanceof Error ? err : new Error("Fingerprint/face didn't work. Use your PIN.");
}

/** Turns on fingerprint/face for the signed-in member on this device. */
export async function enrollBiometric() {
  const { startRegistration } = await import("@simplewebauthn/browser");
  const optionsJSON = await api<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/passkeys/register");
  let response;
  try {
    response = await startRegistration({ optionsJSON });
  } catch (err) {
    throw friendly(err);
  }
  const result = await api<{ id: string; device: string }>("/api/passkeys/register", { body: response });
  setEnabledHere(true);
  return result;
}

/** Signs in ("login") or opens the app lock ("unlock") with fingerprint/face. Returns who it was. */
export async function verifyBiometric(purpose: "login" | "unlock") {
  const { startAuthentication } = await import("@simplewebauthn/browser");
  const optionsJSON = await api<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(
    `/api/passkeys/auth?purpose=${purpose}`,
  );
  let response;
  try {
    response = await startAuthentication({ optionsJSON });
  } catch (err) {
    throw friendly(err);
  }
  const who = await api<{ id: string; name: string }>(`/api/passkeys/auth?purpose=${purpose}`, { body: response });
  setEnabledHere(true);
  return who;
}

export function forgetBiometricHere() {
  setEnabledHere(false);
}
