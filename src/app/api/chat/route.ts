import { after } from "next/server";
import { z } from "zod";
import { query } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { notifyOthers } from "@/lib/server/push";
import { MESSAGE_COLS } from "@/lib/server/chat";


/**
 * Messages, oldest → newest.
 *  - no params: latest 50
 *  - ?before=<id>: older page
 *  - ?after=<id>&since=<iso>: polling — new messages, messages whose reactions/deletion changed
 *    since the last poll, and who is typing right now.
 */
export const GET = route(async (req) => {
  const me = await requireUser();
  const url = new URL(req.url);
  const afterId = Number(url.searchParams.get("after")) || null;
  const beforeId = Number(url.searchParams.get("before")) || null;
  const since = url.searchParams.get("since");

  if (afterId) {
    const sinceIso = since && !Number.isNaN(Date.parse(since)) ? since : new Date(Date.now() - 10_000).toISOString();
    const [items, changed, typing, [{ now }]] = await Promise.all([
      query(`select ${MESSAGE_COLS} from chat_messages m where m.id > $1 order by m.id limit 200`, [afterId]),
      query(`select ${MESSAGE_COLS} from chat_messages m where m.id <= $1 and m.updated_at > $2 order by m.id`, [afterId, sinceIso]),
      query<{ userId: string }>(
        `select user_id as "userId" from chat_typing where at > now() - interval '6 seconds' and user_id <> $1`,
        [me],
      ),
      query<{ now: string }>("select now() as now"),
    ]);
    return { items, changed, typing: typing.map((t) => t.userId), now };
  }

  const rows = await query(
    `select ${MESSAGE_COLS} from chat_messages m where ($1::int is null or m.id < $1) order by m.id desc limit 51`,
    [beforeId],
  );
  const [{ now }] = await query<{ now: string }>("select now() as now");
  return { items: rows.slice(0, 50).reverse(), hasMore: rows.length > 50, now };
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
  const [inserted] = await query<{ id: number }>("insert into chat_messages (user_id, body) values ($1, $2) returning id::int as id", [
    userId,
    d.body,
  ]);
  // Sending a message ends "typing…".
  await query("delete from chat_typing where user_id = $1", [userId]);
  const [msg] = await query(`select ${MESSAGE_COLS} from chat_messages m where m.id = $1`, [inserted.id]);
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
