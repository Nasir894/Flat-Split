import { after } from "next/server";
import { z } from "zod";
import { query } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { notifyUsers } from "@/lib/server/push";
import { REACTIONS } from "@/lib/chat";

type Ctx = RouteContext<"/api/chat/[id]/react">;

const body = z.object({ emoji: z.enum(REACTIONS, { error: "Pick one of the reactions" }) });

// One reaction per member per message: same emoji again removes it, a different one replaces it.
export const POST = route<Ctx>(async (req, ctx) => {
  const userId = await requireMember();
  const id = Number((await ctx.params).id);
  const { emoji } = body.parse(await req.json());

  const [msg] = await query<{ user_id: string; body: string; deleted: boolean }>(
    "select user_id, body, deleted_at is not null as deleted from chat_messages where id = $1",
    [id],
  );
  if (!msg || msg.deleted) throw new HttpError(404, "Message not found");

  const [existing] = await query<{ emoji: string }>("select emoji from chat_reactions where message_id = $1 and user_id = $2", [
    id,
    userId,
  ]);
  const removing = existing?.emoji === emoji;
  if (removing) {
    await query("delete from chat_reactions where message_id = $1 and user_id = $2", [id, userId]);
  } else {
    await query(
      `insert into chat_reactions (message_id, user_id, emoji) values ($1, $2, $3)
       on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now()`,
      [id, userId, emoji],
    );
  }
  // Lets other phones pick up the change on their next poll.
  await query("update chat_messages set updated_at = now() where id = $1", [id]);

  if (!removing && msg.user_id !== userId) {
    const [u] = await query<{ name: string }>("select name from users where id = $1", [userId]);
    after(() =>
      notifyUsers([msg.user_id], {
        title: `${emoji} ${u?.name ?? "Someone"} reacted to your message`,
        body: msg.body.length > 120 ? msg.body.slice(0, 117) + "…" : msg.body,
        url: "/chat",
        tag: `react-${id}`,
        kind: "chat",
        entity: "chat",
      }).catch(() => {}),
    );
  }
  return { ok: true, removed: removing };
});
