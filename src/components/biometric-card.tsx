"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { biometricAvailable, biometricEnabledHere, enrollBiometric, forgetBiometricHere, passkeysSupported } from "@/lib/biometric";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Passkey = { id: string; device: string; createdAt: string; lastUsedAt: string | null };

/** Settings: turn fingerprint / face sign-in on for this device, and see/remove other devices. */
export function BiometricCard() {
  const qc = useQueryClient();
  const [available, setAvailable] = useState<boolean | null>(null);
  // This card renders only on the client (inside AppLock), so localStorage can be read during render.
  const [onHere, setOnHere] = useState(() => biometricEnabledHere());
  const [busy, setBusy] = useState<string | null>(null);
  const { data: keys = [] } = useQuery({ queryKey: ["passkeys"], queryFn: () => api<Passkey[]>("/api/passkeys") });

  useEffect(() => {
    // Built-in sensor, or any passkey method (Windows Hello, phone via QR, security key).
    biometricAvailable().then((b) => setAvailable(b || passkeysSupported()));
  }, []);

  const enable = async () => {
    setBusy("enable");
    try {
      const r = await enrollBiometric();
      setOnHere(true);
      toast.success(`Fingerprint / face sign-in is on for ${r.device}`);
      await qc.invalidateQueries({ queryKey: ["passkeys"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (k: Passkey) => {
    setBusy(k.id);
    try {
      await api("/api/passkeys", { method: "DELETE", body: { id: k.id } });
      // We can't tell which stored key belongs to this phone, so removing the last one turns it off here.
      if (keys.length <= 1) {
        forgetBiometricHere();
        setOnHere(false);
      }
      toast.success(`Removed ${k.device}`);
      await qc.invalidateQueries({ queryKey: ["passkeys"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="rise">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Fingerprint className="size-4" /> Fingerprint / face sign-in
        </CardTitle>
        <CardDescription>
          Sign in and unlock with your phone&apos;s fingerprint or face instead of typing your PIN. Your PIN still works
          as a backup. Your fingerprint or face never leaves your phone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {available === false ? (
          <p className="text-sm text-muted-foreground">
            This browser can&apos;t do it here. Use Chrome, Edge or Safari on the app&apos;s https address (not a preview
            link). On Windows, set up Windows Hello first: Settings → Accounts → Sign-in options.
          </p>
        ) : onHere ? (
          <p className="rounded-lg bg-positive/10 p-2 text-sm text-positive">On for this device ✓</p>
        ) : (
          <Button className="w-full" onClick={enable} disabled={busy === "enable" || available === null}>
            {busy === "enable" ? <Loader2 className="animate-spin" /> : <Fingerprint />} Turn on for this device
          </Button>
        )}

        {keys.length > 0 && (
          <ul className="divide-y text-sm">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-2 py-2">
                <Fingerprint className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{k.device || "Device"}</span>
                  <span className="text-xs text-muted-foreground">
                    {k.lastUsedAt
                      ? `last used ${formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })}`
                      : `added ${formatDistanceToNow(new Date(k.createdAt), { addSuffix: true })}`}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Remove ${k.device}`}
                  disabled={busy === k.id}
                  onClick={() => remove(k)}
                >
                  {busy === k.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
