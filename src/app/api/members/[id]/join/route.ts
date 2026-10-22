import { z } from "zod";
import { withTx } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { audit, userName } from "@/lib/server/audit";

type Ctx = RouteContext<"/api/members/[id]/join">;

const body = z.object({ decision: z.enum(["approve", "decline"]) });

// Any joined member can approve or decline a pending join request. Who did it is stored and logged.
export const POST = route<Ctx>(async (req, ctx) => {
  const actorId = await requireUser();
  const { id } = await ctx.params;
  const { decision } = body.parse(await req.json());

  return withTx(async (q) => {
    const [u] = await q<{ name: string }>("select name from users where id = $1 and status = 'pending' for update", [id]);
    if (!u) throw new HttpError(404, "This request was already handled");
    const actorName = await userName(q, actorId);

    if (decision === "approve") {
      await q("update users set status = 'active', approved_by = $2, approved_at = now() where id = $1", [id, actorId]);
      await audit(q, {
        entity: "user",
        entityId: id,
        action: "update",
        actorId,
        actorName,
        title: `${u.name} joined the house`,
        summary: `👋 ${actorName} added ${u.name} to the house`,
        after: { name: u.name, approvedBy: actorId },
      });
    } else {
      // A declined request never became a member, so the row is removed; the log keeps the record.
      await q("delete from users where id = $1 and status = 'pending'", [id]);
      await audit(q, {
        entity: "user",
        entityId: id,
        action: "delete",
        actorId,
        actorName,
        title: "Join request declined",
        summary: `${actorName} declined ${u.name}'s request to join`,
      });
    }
    return { ok: true };
  });
});
