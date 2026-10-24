import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { currentHouse, inHouse, query } from "./db";
import { HttpError } from "./http";
import { notifyOthers } from "./push";

/** Chat message columns, including its reactions as [{ emoji, userId }]. Use with alias `m`. */
export const MESSAGE_COLS = `m.id::int as id, m.user_id as "userId",
  case when m.deleted_at is null then m.body else '' end as body,
  m.created_at as "createdAt", (m.deleted_at is not null) as deleted,
  coalesce((select json_agg(json_build_object('emoji', r.emoji, 'userId', r.user_id) order by r.created_at)
            from chat_reactions r where r.message_id = m.id), '[]'::json) as reactions`;

// Text and emoji only: no attachments, no HTML (rendered as plain text), control characters stripped.
const body = z.object({
  body: z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(1, "Type a message").max(1000, "Message is too long (max 1000 characters)")),
});

/** Posts a chat message as `userId` (from the chat screen or a notification's Reply button). */
export async function postChatMessage(userId: string, input: unknown) {
  const d = body.parse(input);
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
  // Sent after the response, so pinned to this house explicitly.
  const houseId = currentHouse();
  if (houseId) {
    after(() =>
      inHouse(houseId, () =>
        notifyOthers(userId, {
          title: `💬 ${u?.name ?? "Someone"}`,
          body: d.body.length > 140 ? d.body.slice(0, 137) + "…" : d.body,
          url: "/chat",
          tag: "chat",
          kind: "chat",
          entity: "chat",
          action: { category: "chat", id: String(inserted.id) },
        }),
      ).catch((err) => console.error("chat notify failed", err)),
    );
  }
  return msg;
}
