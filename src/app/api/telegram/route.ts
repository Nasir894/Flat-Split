import { route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { dashboardDigest, sendTelegram } from "@/lib/server/telegram";

// "Send now" from Settings: the same digest the daily cron sends.
export const POST = route(async () => {
  await requireMember();
  const sent = await sendTelegram(await dashboardDigest());
  return { ok: true, sent };
});
