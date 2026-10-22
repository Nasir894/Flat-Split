import { query } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";

type Ctx = RouteContext<"/api/chat/[id]">;

// Delete your own message: its text is hidden for everyone ("message deleted").
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const userId = await requireUser();
  const id = Number((await ctx.params).id);
  const rows = await query(
    "update chat_messages set deleted_at = now() where id = $1 and user_id = $2 and deleted_at is null returning id",
    [id, userId],
  );
  if (!rows.length) throw new HttpError(404, "Message not found");
  return { ok: true };
});
