"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Switch } from "@/components/ui/switch";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Turns phone/desktop notifications on or off for this device. */
export function PushToggle() {
  // Rendered only on the client (inside AppLock), so feature detection can run during render.
  const [supported] = useState(
    () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
  );
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (supported) currentSubscription().then((s) => setOn(Boolean(s)));
  }, [supported]);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (next) {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") throw new Error("Notifications are blocked. Allow them in your browser settings.");
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        });
        await api("/api/push", { body: sub.toJSON() });
        toast.success("Notifications on for this device");
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } });
          await sub.unsubscribe();
        }
      }
      setOn(next);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (supported === false) {
    return (
      <p className="text-xs text-muted-foreground">
        Not supported in this browser. On iPhone, first add Flat Split to your Home Screen (iOS 16.4+), then open it from
        there.
      </p>
    );
  }
  return <Switch checked={on} disabled={busy} onCheckedChange={toggle} aria-label="Notifications" />;
}
