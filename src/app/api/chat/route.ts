import { after } from "next/server";
import { z } from "zod";
import { query } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { notifyOthers } from "@/lib/server/push";

const COLS = `id::int as id, user_id as "userId", case when deleted_at is null then body else '' end as body,
              created_at as "createdAt", (deleted_at is not null) as deleted`;

// Messages, oldest → newest. ?after=<id> returns only newer ones (polling); ?before=<id> pages back.
export const GET = route(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const afterId = Number(url.searchParams.get("after")) || null;
  const beforeId = Number(url.searchParams.get("before")) || null;
  if (afterId) {
    return { items: await query(`select ${COLS} from chat_messages where id > $1 order by id limit 200`, [afterId]), hasMore: false };
  }
  const rows = await query(
    `select ${COLS} from chat_messages where ($1::int is null or id < $1) order by id desc limit 51`,
    [beforeId],
  );
  return { items: rows.slice(0, 50).reverse(), hasMore: rows.length > 50 };
});

// Text and emoji only: no attachments, no HTML (rendered as plain text), control characters stripped.
const body = z.object({
  body: z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(1, "Type a message").max(1000, "Message is too long (max 1000 characters)")),
});

export const POST = route(async (req) => {
  const userId = await requireUser();
  const d = body.parse(await req.json());
  const [{ n }] = await query<{ n: number }>(
    "select count(*)::int as n from chat_messages where user_id = $1 and created_at > now() - interval '1 minute'",
    [userId],
  );
  if (n >= 20) throw new HttpError(429, "Slow down a little 🙂");
  const [msg] = await query(`insert into chat_messages (user_id, body) values ($1, $2) returning ${COLS}`, [userId, d.body]);
  const [u] = await query<{ name: string }>("select name from users where id = $1", [userId]);
  after(() =>
    notifyOthers(userId, {
      title: `💬 ${u?.name ?? "Someone"}`,
      body: d.body.length > 140 ? d.body.slice(0, 137) + "…" : d.body,
      url: "/chat",
      tag: "chat",
      kind: "chat",
      entity: "chat",
    }).catch((err) => console.error("chat notify failed", err)),
  );
  return msg;
});
