import { z } from "zod";
import { route } from "@/lib/server/http";
import { requireSession } from "@/lib/server/auth";
import { registerDevice, unregisterDevice } from "@/lib/server/devices";

// The Android app registers itself after sign-in (called from inside its web view, so the session
// cookie proves who it is) and gets a device key for notification buttons.
export const POST = route(async (req) => {
  const me = await requireSession();
  const d = z
    .object({ pushToken: z.string().max(300).nullish(), oldKey: z.string().max(100).optional() })
    .parse(await req.json());
  return { deviceKey: await registerDevice(me.id, d.pushToken ?? null, d.oldKey) };
});

// Signed out on the phone: forget it (no more notifications or buttons).
export const DELETE = route(async (req) => {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (key) await unregisterDevice(key);
  return { ok: true };
});
