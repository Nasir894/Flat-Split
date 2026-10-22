import { z } from "zod";
import { withTx } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { audit, userName } from "@/lib/server/audit";

type Ctx = RouteContext<"/api/members/[id]/join">;

const body = z.object({
  decision: z.enum(["approve", "decline"]),
  // Home sharers live in the flat (admins); guests only join tours.
  role: z.enum(["member", "guest"]).default("member"),
  tourIds: z.array(z.uuid()).default([]),
});

// Any joined member can approve or decline a pending join request. Who did it is stored and logged.
export const POST = route<Ctx>(async (req, ctx) => {
  const actorId = await requireMember();
  const { id } = await ctx.params;
  const { decision, role, tourIds } = body.parse(await req.json());

  return withTx(async (q) => {
    const [u] = await q<{ name: string }>("select name from users where id = $1 and status = 'pending' for update", [id]);
    if (!u) throw new HttpError(404, "This request was already handled");
    const actorName = await userName(q, actorId);

    if (decision === "approve") {
      await q("update users set status = 'active', role = $3, approved_by = $2, approved_at = now() where id = $1", [
        id,
        actorId,
        role,
      ]);
      if (role === "guest" && tourIds.length) {
        await q(
          `insert into tour_participants (tour_id, user_id)
           select t.id, $1 from tours t where t.id = any($2::uuid[]) and t.status <> 'closed' and t.deleted_at is null
           on conflict do nothing`,
          [id, tourIds],
        );
      }
      await audit(q, {
        entity: "user",
        entityId: id,
        action: "update",
        actorId,
        actorName,
        title: role === "guest" ? `🧳 ${u.name} joined as a tour guest` : `🏠 ${u.name} joined the house`,
        summary: role === "guest" ? `🧳 ${actorName} added ${u.name} as a tour guest` : `👋 ${actorName} added ${u.name} to the house`,
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
        title: "🚫 Join request declined",
        summary: `${actorName} declined ${u.name}'s request to join`,
      });
    }
    return { ok: true };
  });
});
