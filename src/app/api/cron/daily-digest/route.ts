import { route, HttpError } from "@/lib/server/http";
import { dashboardDigest, sendTelegram } from "@/lib/server/telegram";

// Called once a day by Vercel Cron (see vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  const sent = await sendTelegram(await dashboardDigest());
  return { ok: true, sent };
});
