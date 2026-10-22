import { z } from "zod";
import { query } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";

const sub = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export const POST = route(async (req) => {
  const userId = await requireUser();
  const s = sub.parse(await req.json());
  await query(
    `insert into push_subscriptions (endpoint, user_id, p256dh, auth) values ($1, $2, $3, $4)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [s.endpoint, userId, s.keys.p256dh, s.keys.auth],
  );
  return { ok: true };
});

export const DELETE = route(async (req) => {
  const userId = await requireUser();
  const { endpoint } = z.object({ endpoint: z.string() }).parse(await req.json());
  await query("delete from push_subscriptions where endpoint = $1 and user_id = $2", [endpoint, userId]);
  return { ok: true };
});
