"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import { biometricAvailable, verifyBiometric } from "@/lib/biometric";
import { Button } from "@/components/ui/button";

/**
 * "Use fingerprint / face" button. Renders nothing on devices without a built-in check.
 * `autoStart` opens the system prompt right away (some browsers, e.g. iPhone Safari, still need a tap).
 */
export function BiometricButton({
  purpose,
  onSuccess,
  onError,
  autoStart = false,
}: {
  purpose: "login" | "unlock";
  onSuccess: (who: { id: string; name: string }) => void | Promise<void>;
  onError?: (message: string) => void;
  autoStart?: boolean;
}) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (quiet = false) => {
    setBusy(true);
    try {
      await onSuccess(await verifyBiometric(purpose));
    } catch (e) {
      if (!quiet) onError?.((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    biometricAvailable().then((ok) => {
      if (cancelled) return;
      setAvailable(ok);
      // A blocked auto-prompt (no tap yet) fails silently; the button is still there.
      if (ok && autoStart) run(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!available) return null;
  return (
    <Button type="button" variant="outline" size="lg" className="w-full" disabled={busy} onClick={() => run()}>
      {busy ? <Loader2 className="animate-spin" /> : <Fingerprint className="size-5 text-primary" />}
      Use fingerprint / face
    </Button>
  );
}
