"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PinPad } from "./pin-pad";
import { MemberAvatar } from "./member-avatar";
import { BiometricButton } from "./biometric-button";
import { biometricEnabledHere } from "@/lib/biometric";
import type { User } from "@/lib/types";

const KEY = "fs_unlocked_at";
const RELOCK_AFTER_MS = 2 * 60 * 1000; // lock again after 2 min in the background

export function markUnlocked() {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {}
}

function isUnlocked() {
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** Covers the app with a PIN pad when it's opened fresh or returns from the background. */
export function AppLock({ me, children }: { me?: User; children: React.ReactNode }) {
  const [locked, setLocked] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // sessionStorage only exists in the browser, so the initial lock state is read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocked(!isUnlocked());
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER_MS) {
        try {
          sessionStorage.removeItem(KEY);
        } catch {}
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const unlock = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/unlock", { body: { pin } });
      markUnlocked();
      setLocked(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (locked === null) return null;
  if (!locked) return <>{children}</>;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background px-4">
      {me && <MemberAvatar name={me.name} color={me.color} className="size-14 text-lg" />}
      <p className="font-medium">{me ? `Hi ${me.name}, enter your PIN` : "Enter your PIN"}</p>
      {/* Rendered only after mount (locked !== null), so reading localStorage here is safe. */}
      {biometricEnabledHere() && (
        <div className="w-full max-w-xs">
          <BiometricButton
            purpose="unlock"
            autoStart
            onError={setError}
            onSuccess={() => {
              markUnlocked();
              setLocked(false);
            }}
          />
        </div>
      )}
      <PinPad onComplete={unlock} busy={busy} error={error} />
    </div>
  );
}
