import { route, HttpError } from "@/lib/server/http";
import { sendDigestIfDue } from "@/lib/server/telegram";

// Hit every few minutes by an outside scheduler (and once a day by Vercel Cron as a backup), with
// `Authorization: Bearer $CRON_SECRET`. Sends at most once a day, at the time chosen in Settings.
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  return sendDigestIfDue();
});
