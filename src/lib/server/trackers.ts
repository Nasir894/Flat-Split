import "server-only";
import { z } from "zod";
import { withTx, type Query } from "./db";
import { HttpError } from "./http";
import { audit, userName } from "./audit";

export const trackerInput = z.object({
  name: z.string().trim().min(1, "Give it a name").max(30),
  emoji: z.string().trim().min(1).max(8).default("🔁"),
  // null / omitted = everyone in the house takes part
  memberIds: z.array(z.uuid()).min(2, "Pick at least two people").nullish(),
});

const COLS = `id, name, emoji, member_ids as "memberIds", is_default as "isDefault", deleted_at as "deletedAt"`;

async function checkMembers(q: Query, ids: string[] | null | undefined) {
  if (!ids) return null;
  const unique = [...new Set(ids)];
  const [{ n }] = await q<{ n: number }>(
    "select count(*)::int as n from users where id = any($1::uuid[]) and status = 'active'",
    [unique],
  );
  if (n !== unique.length) throw new HttpError(400, "Unknown member selected");
  return unique;
}

export async function createTracker(actorId: string, body: unknown) {
  const d = trackerInput.parse(body);
  return withTx(async (q) => {
    const [dupe] = await q("select 1 from trackers where lower(name) = lower($1) and deleted_at is null", [d.name]);
    if (dupe) throw new HttpError(409, "A tracker with that name already exists");
    const members = await checkMembers(q, d.memberIds);
    const [t] = await q(
      `insert into trackers (name, emoji, member_ids, created_by) values ($1, $2, $3, $4) returning ${COLS}`,
      [d.name, d.emoji, members, actorId],
    );
    const actorName = await userName(q, actorId);
    await audit(q, {
      entity: "tracker",
      entityId: t.id,
      action: "create",
      actorId,
      actorName,
      title: `${t.emoji} ${actorName} started a new turn tracker: ${t.name}`,
      summary: `${t.emoji} New turn tracker "${t.name}"`,
      after: t,
    });
    return t;
  });
}

export async function updateTracker(actorId: string, id: string, body: unknown) {
  const d = trackerInput.parse(body);
  return withTx(async (q) => {
    const [before] = await q(`select ${COLS} from trackers where id = $1 and deleted_at is null for update`, [id]);
    if (!before) throw new HttpError(404, "Not found");
    const members = before.isDefault ? null : await checkMembers(q, d.memberIds);
    const [after] = await q(
      `update trackers set name = $2, emoji = $3, member_ids = $4 where id = $1 returning ${COLS}`,
      [id, d.name, d.emoji, members],
    );
    const actorName = await userName(q, actorId);
    await audit(q, {
      entity: "tracker",
      entityId: id,
      action: "update",
      actorId,
      actorName,
      summary: `${after.emoji} Turn tracker "${after.name}" changed`,
      before,
      after,
    });
    return after;
  });
}

/** Soft delete; its history stays in the activity log. The built-in Rice tracker can't be removed. */
export async function deleteTracker(actorId: string, id: string) {
  return withTx(async (q) => {
    const [before] = await q(`select ${COLS} from trackers where id = $1 and deleted_at is null for update`, [id]);
    if (!before) throw new HttpError(404, "Not found");
    if (before.isDefault) throw new HttpError(400, "The Rice tracker can't be removed");
    await q("update trackers set deleted_at = now(), deleted_by = $2 where id = $1", [id, actorId]);
    const actorName = await userName(q, actorId);
    await audit(q, {
      entity: "tracker",
      entityId: id,
      action: "delete",
      actorId,
      actorName,
      summary: `${before.emoji} Turn tracker "${before.name}" removed`,
      before,
    });
    return { ok: true };
  });
}
