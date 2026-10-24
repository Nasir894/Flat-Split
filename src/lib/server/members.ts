import "server-only";
import { z } from "zod";
import { asSystem, query, setHouse, withTx } from "./db";
import { audit, userName } from "./audit";
import { HttpError } from "./http";
import { assertNotLimited, clientKey, guardHouseCode, recordFailure } from "./pin";

/** Thrown when a name exists in more than one house: the sign-in screen then asks for the house code. */
export const NEED_HOUSE_CODE = 409;

/**
 * Finds a joined member by name (case-insensitive) for sign-in or PIN recovery, and points this
 * request at their house. Names are unique within a house, so when several houses have the same
 * name the house code tells them apart. Unknown names count as failed attempts per client.
 */
export async function memberIdByName(req: Request, name: string, houseCode?: string): Promise<string> {
  const key = `name:${clientKey(req)}`;
  await assertNotLimited(key, 10);
  const houseId = houseCode?.trim() ? await guardHouseCode(req, houseCode) : null;
  const matches = await asSystem(() =>
    query<{ id: string; status: string; house_id: string }>(
      "select id, status, house_id from users where lower(name) = lower($1) and ($2::uuid is null or house_id = $2::uuid)",
      [name.trim(), houseId],
    ),
  );
  if (!matches.length) {
    await recordFailure(key);
    throw new HttpError(401, "No member with that name. Check the spelling, or ask to join.");
  }
  if (matches.length > 1) throw new HttpError(NEED_HOUSE_CODE, "More than one house has someone with that name. Enter your house code too.");
  const [u] = matches;
  if (u.status !== "active") throw new HttpError(403, "Your join request is still waiting for a flatmate's approval.");
  setHouse(u.house_id);
  return u.id;
}

const joinDecision = z.object({
  decision: z.enum(["approve", "decline"]),
  // Home sharers live in the flat (admins); guests only join tours.
  role: z.enum(["member", "guest"]).default("member"),
  tourIds: z.array(z.uuid()).default([]),
});

/** Any joined member can approve or decline a pending join request. Who did it is stored and logged. */
export async function decideJoin(actorId: string, id: string, input: unknown) {
  const { decision, role, tourIds } = joinDecision.parse(input);
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
}
