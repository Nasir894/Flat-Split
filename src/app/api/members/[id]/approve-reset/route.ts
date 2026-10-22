import { withTx } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { audit, userName } from "@/lib/server/audit";

type Ctx = RouteContext<"/api/members/[id]/approve-reset">;

// A flatmate vouches for someone who lost both PIN and recovery code. Valid for 24 hours,
// logged permanently and pushed to everyone so a sneaky reset can't go unnoticed.
export const POST = route<Ctx>(async (_req, ctx) => {
  const actorId = await requireUser();
  const { id } = await ctx.params;
  if (id === actorId) throw new HttpError(400, "Another flatmate has to approve your reset");
  return withTx(async (q) => {
    const [u] = await q<{ name: string }>(
      `update users set reset_approved_by = $2, reset_expires_at = now() + interval '24 hours'
       where id = $1 and status = 'active' returning name`,
      [id, actorId],
    );
    if (!u) throw new HttpError(404, "Unknown member");
    const actorName = await userName(q, actorId);
    await audit(q, {
      entity: "user",
      entityId: id,
      action: "update",
      actorId,
      actorName,
      summary: `🔑 ${actorName} approved a PIN reset for ${u.name} (valid 24h)`,
    });
    return { ok: true };
  });
});
