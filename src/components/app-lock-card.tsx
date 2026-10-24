"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { nativeApp, postToApp, type NativeApp } from "@/lib/native-app";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { BiometricCard } from "./biometric-card";

/**
 * In the Android app: turn the phone's fingerprint/face lock on or off. In a browser: the usual
 * passkey (fingerprint/face sign-in) card, since passkeys don't work inside the app.
 */
export function DeviceLockCard() {
  const [app, setApp] = useState<NativeApp | null | undefined>(undefined);
  // The app's flag only exists in the browser, so it's read after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setApp(nativeApp()), []);
  if (app === undefined) return null;
  if (!app) return <BiometricCard />;

  const toggle = (on: boolean) => {
    setApp({ ...app, lockEnabled: on });
    // The app saves it and reloads this page, so the right lock (fingerprint or PIN) takes over.
    postToApp({ type: "setLock", on });
  };

  return (
    <Card className="rise">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Fingerprint className="size-4" /> App lock
        </CardTitle>
        <CardDescription>
          {app.lockAvailable
            ? "Open Flat Split with your fingerprint or face (or the phone's PIN). Off: your Flat Split PIN is asked instead."
            : "Set up a screen lock (fingerprint, face, PIN or pattern) in your phone's settings to use it here."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <span className="text-sm">Unlock with fingerprint / face</span>
        <Switch checked={app.lockEnabled} disabled={!app.lockAvailable} onCheckedChange={toggle} />
      </CardContent>
    </Card>
  );
}
