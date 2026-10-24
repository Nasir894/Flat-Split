import { asSystem, inHouse, query } from "@/lib/server/db";
import { route, HttpError } from "@/lib/server/http";
import { sendDigestIfDue } from "@/lib/server/telegram";

// Hit every 10 minutes by GitHub Actions (.github/workflows/telegram-digest.yml) and once a day by
// Vercel Cron as a backup, both with `Authorization: Bearer $CRON_SECRET`. Each house gets its digest
// at most once a day, at its own time.
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  const houses = await asSystem(() => query<{ id: string }>("select id from houses order by created_at"));
  const results = await Promise.all(
    houses.map((h) =>
      inHouse(h.id, sendDigestIfDue).catch((err: Error) => ({ sent: 0, error: err.message })), // one house failing doesn't stop the rest
    ),
  );
  return { houses: houses.length, sent: results.reduce((n, r) => n + r.sent, 0) };
});
