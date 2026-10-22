import { query } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { endSession, sessionUserId } from "@/lib/server/auth";

export const POST = route(async (req) => {
  const userId = await sessionUserId();
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  // Stop notifications to this device once its member signs out.
  if (userId && endpoint) await query("delete from push_subscriptions where endpoint = $1", [endpoint]);
  await endSession();
  return { ok: true };
});
