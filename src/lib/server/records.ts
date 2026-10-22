import "server-only";
import { z } from "zod";
import { formatTaka, splitEqual } from "@/lib/money";
import { query, withTx, type Query, type Row } from "./db";
import { HttpError } from "./http";
import { audit, userName } from "./audit";
import type { Role } from "./auth";

export type Actor = { id: string; role: Role };

// ---------- input schemas ----------

const amount = z.number().int("Invalid amount").positive("Amount must be more than 0").max(100_000_000_00);
const when = z.iso.datetime({ offset: true }).optional();

export const expenseInput = z.object({
  payerId: z.uuid(),
  amount,
  categoryId: z.uuid().nullable(),
  description: z.string().trim().max(200).default(""),
  spentAt: when,
  consumerIds: z.array(z.uuid()).min(1, "Pick at least one person who consumed it"),
  /** Set to put the expense on an active tour instead of the home fund. */
  tourId: z.uuid().nullish(),
});

export const transferInput = z
  .object({
    fromUserId: z.uuid(),
    toUserId: z.uuid(),
    amount,
    note: z.string().trim().max(200).default(""),
    sentAt: when,
    tourId: z.uuid().nullish(),
  })
  .refine((t) => t.fromUserId !== t.toUserId, "Sender and receiver must be different");

export const RICE_TRACKER_ID = "00000000-0000-4000-8000-000000000001";

export const riceInput = z.object({
  trackerId: z.uuid().default(RICE_TRACKER_ID),
  userId: z.uuid(),
  givenAt: when,
  note: z.string().trim().max(200).default(""),
});

export const versionInput = z.object({ version: z.number().int().positive() });

// ---------- reads ----------

export const EXPENSE_COLS = `
  e.id, e.payer_id as "payerId", e.amount::int as amount, e.category_id as "categoryId",
  e.description, e.spent_at as "spentAt", e.created_by as "createdBy", e.created_at as "createdAt",
  e.updated_by as "updatedBy", e.updated_at as "updatedAt", e.deleted_by as "deletedBy",
  e.deleted_at as "deletedAt", e.version, e.tour_id as "tourId",
  coalesce((select json_agg(json_build_object('userId', s.user_id, 'amount', s.amount::int) order by s.user_id)
            from expense_shares s where s.expense_id = e.id), '[]'::json) as shares`;

export const TRANSFER_COLS = `
  t.id, t.from_user_id as "fromUserId", t.to_user_id as "toUserId", t.amount::int as amount, t.note,
  t.sent_at as "sentAt", t.created_by as "createdBy", t.created_at as "createdAt",
  t.updated_by as "updatedBy", t.updated_at as "updatedAt", t.deleted_by as "deletedBy",
  t.deleted_at as "deletedAt", t.version, t.status, t.responded_by as "respondedBy", t.responded_at as "respondedAt",
  t.tour_id as "tourId", t.settlement`;

export const RICE_COLS = `
  r.id, r.user_id as "userId", r.given_at as "givenAt", r.note, r.created_by as "createdBy",
  r.created_at as "createdAt", r.updated_by as "updatedBy", r.updated_at as "updatedAt",
  r.deleted_by as "deletedBy", r.deleted_at as "deletedAt", r.version, r.tracker_id as "trackerId"`;

const TABLES = {
  expense: { table: "expenses", alias: "e", cols: EXPENSE_COLS },
  transfer: { table: "transfers", alias: "t", cols: TRANSFER_COLS },
  rice: { table: "rice_entries", alias: "r", cols: RICE_COLS },
} as const;
export type RecordKind = keyof typeof TABLES;

const SLUGS: Record<string, RecordKind> = { expenses: "expense", transfers: "transfer", rice: "rice" };

/** Maps a URL segment (expenses | transfers | rice) to a record kind. */
export function kindOf(slug: string): RecordKind {
  const k = SLUGS[slug];
  if (!k) throw new HttpError(404, "Not found");
  return k;
}

async function snapshot(q: Query, kind: RecordKind, id: string, lock = false) {
  const { table, alias, cols } = TABLES[kind];
  const [row] = await q(`select ${cols} from ${table} ${alias} where ${alias}.id = $1 ${lock ? "for update" : ""}`, [id]);
  if (!row) throw new HttpError(404, "Not found");
  return row;
}

function assertVersion(row: Row, version: number) {
  if (row.version !== version) {
    throw new HttpError(409, "Someone else changed this just now. Refresh and try again.");
  }
}

async function names(q: Query, ids: string[]) {
  const rows = await q<{ id: string; name: string }>("select id, name from users where id = any($1::uuid[])", [ids]);
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

async function categoryLabel(q: Query, id: string | null) {
  if (!id) return "";
  const [c] = await q<{ name: string; emoji: string }>("select name, emoji from categories where id = $1", [id]);
  return c ? `${c.emoji} ${c.name}` : "";
}

/** The tracker must exist, and the person must be one of its participants. */
async function assertTracker(q: Query, trackerId: string, userId: string) {
  const [t] = await q<{ member_ids: string[] | null }>(
    "select member_ids from trackers where id = $1 and deleted_at is null",
    [trackerId],
  );
  if (!t) throw new HttpError(400, "That tracker no longer exists");
  if (t.member_ids && !t.member_ids.includes(userId)) throw new HttpError(400, "That person isn't part of this tracker");
}

/** Home records may only involve home sharers. */
async function assertHomeMembers(q: Query, ids: string[]) {
  const unique = [...new Set(ids)];
  const [{ n }] = await q<{ n: number }>(
    "select count(*)::int as n from users where id = any($1::uuid[]) and status = 'active' and role = 'member'",
    [unique],
  );
  if (n !== unique.length) throw new HttpError(400, "Unknown member selected");
}

function requireHomeSharer(actor: Actor) {
  if (actor.role !== "member") throw new HttpError(403, "Guests can only use their tours");
}

type TourCtx = { id: string; name: string; emoji: string; status: string; participants: string[] };

/**
 * Loads a tour and checks the actor may use it: guests only their own tours; writes only while
 * the tour is active (planned tours aren't started yet, closed tours are locked).
 */
export async function tourAccess(q: Query, tourId: string, actor: Actor, write: boolean): Promise<TourCtx> {
  const [t] = await q<{ id: string; name: string; emoji: string; status: string }>(
    "select id, name, emoji, status from tours where id = $1 and deleted_at is null",
    [tourId],
  );
  if (!t) throw new HttpError(404, "Tour not found");
  const parts = await q<{ user_id: string }>("select user_id from tour_participants where tour_id = $1", [tourId]);
  const participants = parts.map((p) => p.user_id);
  if (actor.role === "guest" && !participants.includes(actor.id)) throw new HttpError(403, "You're not on this tour");
  if (write && t.status === "planned") throw new HttpError(400, "This tour hasn't started yet. Start it first.");
  if (write && t.status === "closed") throw new HttpError(400, "This tour is closed");
  return { ...t, participants };
}

function assertParticipants(tour: TourCtx, ids: string[]) {
  if (ids.some((id) => !tour.participants.includes(id))) throw new HttpError(400, `Everyone involved must be on ${tour.name}`);
}

/** Which record a guest may touch: only ones they created, on their tours. */
function guestMayChange(actor: Actor, row: Row) {
  if (actor.role === "guest" && row.createdBy !== actor.id) throw new HttpError(403, "Guests can only change their own entries");
}

// ---------- summaries for the activity feed & notifications ----------

async function describe(q: Query, kind: RecordKind, row: Record<string, unknown>) {
  let tourTag = "";
  if (row.tourId) {
    const [t] = await q<{ name: string; emoji: string }>("select name, emoji from tours where id = $1", [row.tourId]);
    if (t) tourTag = ` · ${t.emoji} ${t.name}`;
  }
  if (kind === "expense") {
    const n = await names(q, [row.payerId as string]);
    const cat = await categoryLabel(q, row.categoryId as string | null);
    const what = [row.description, cat && `(${cat})`].filter(Boolean).join(" ");
    return `${formatTaka(row.amount as number)} paid by ${n[row.payerId as string]}${what ? ` · ${what}` : ""}${tourTag}`;
  }
  if (kind === "transfer") {
    const n = await names(q, [row.fromUserId as string, row.toUserId as string]);
    const status =
      row.status === "pending" ? ` · waiting for ${n[row.toUserId as string]} to confirm` : row.status === "declined" ? " · declined" : "";
    return `${n[row.fromUserId as string]} → ${n[row.toUserId as string]} ${formatTaka(row.amount as number)}${
      row.note ? ` · ${row.note}` : ""
    }${tourTag}${status}`;
  }
  const n = await names(q, [row.userId as string]);
  const [t] = await q<{ name: string; emoji: string }>("select name, emoji from trackers where id = $1", [row.trackerId]);
  return `${t?.emoji ?? "🔁"} ${t?.name ?? "Turn"} done by ${n[row.userId as string]}`;
}

// ---------- writes ----------

export async function createRecord(kind: RecordKind, actor: Actor, body: unknown) {
  return withTx(async (q) => {
    let id: string;
    let tour: TourCtx | null = null;
    if (kind === "expense") {
      const d = expenseInput.parse(body);
      if (d.tourId) {
        tour = await tourAccess(q, d.tourId, actor, true);
        assertParticipants(tour, [d.payerId, ...d.consumerIds]);
      } else {
        requireHomeSharer(actor);
        await assertHomeMembers(q, [d.payerId, ...d.consumerIds]);
      }
      [{ id }] = await q<{ id: string }>(
        `insert into expenses (payer_id, amount, category_id, description, spent_at, created_by, tour_id)
         values ($1, $2, $3, $4, date_trunc('milliseconds', coalesce($5::timestamptz, now())), $6, $7) returning id`,
        [d.payerId, d.amount, d.categoryId, d.description, d.spentAt ?? null, actor.id, d.tourId ?? null],
      );
      await writeShares(q, id, d.amount, d.consumerIds);
    } else if (kind === "transfer") {
      const d = transferInput.parse(body);
      if (d.tourId) {
        tour = await tourAccess(q, d.tourId, actor, true);
        assertParticipants(tour, [d.fromUserId, d.toUserId]);
      } else {
        requireHomeSharer(actor);
        await assertHomeMembers(q, [d.fromUserId, d.toUserId]);
      }
      [{ id }] = await q<{ id: string }>(
        // The receiver must confirm money they got — unless they are the one recording it.
        `insert into transfers (from_user_id, to_user_id, amount, note, sent_at, created_by, status, responded_by, responded_at, tour_id)
         values ($1, $2, $3, $4, date_trunc('milliseconds', coalesce($5::timestamptz, now())), $6,
                 case when $6::uuid = $2::uuid then 'approved' else 'pending' end,
                 case when $6::uuid = $2::uuid then $6::uuid end, case when $6::uuid = $2::uuid then now() end, $7)
         returning id`,
        [d.fromUserId, d.toUserId, d.amount, d.note, d.sentAt ?? null, actor.id, d.tourId ?? null],
      );
    } else {
      requireHomeSharer(actor);
      const d = riceInput.parse(body);
      await assertHomeMembers(q, [d.userId]);
      await assertTracker(q, d.trackerId, d.userId);
      [{ id }] = await q<{ id: string }>(
        `insert into rice_entries (user_id, given_at, note, created_by, tracker_id)
         values ($1, date_trunc('milliseconds', coalesce($2::timestamptz, now())), $3, $4, $5) returning id`,
        [d.userId, d.givenAt ?? null, d.note, actor.id, d.trackerId],
      );
    }
    const row = await snapshot(q, kind, id);
    let title: string | undefined;
    if (kind === "transfer" && row.status === "pending") {
      const n = await names(q, [row.fromUserId, row.toUserId]);
      title = `💸 ${n[row.fromUserId]} paid ${n[row.toUserId]} ${formatTaka(row.amount)}: ${n[row.toUserId]}, please confirm`;
    } else if (kind === "rice") {
      const n = await names(q, [row.userId]);
      const [t] = await q<{ name: string; emoji: string }>("select name, emoji from trackers where id = $1", [row.trackerId]);
      title = `${t?.emoji ?? "🔁"} ${n[row.userId]} did their turn: ${t?.name ?? "Turn"}`;
    } else if (kind === "expense" && tour) {
      title = `${tour.emoji} ${await userName(q, actor.id)} added a ${tour.name} expense`;
    }
    await audit(q, {
      entity: kind,
      entityId: id,
      action: "create",
      actorId: actor.id,
      actorName: await userName(q, actor.id),
      title,
      summary: await describe(q, kind, row),
      after: row,
      audience: tour?.participants,
    });
    return row;
  });
}

export async function updateRecord(kind: RecordKind, actor: Actor, id: string, body: unknown) {
  const { version } = versionInput.parse(body);
  return withTx(async (q) => {
    const before = await snapshot(q, kind, id, true);
    assertVersion(before, version);
    if (before.deletedAt) throw new HttpError(400, "Restore this record before editing it");
    if (before.settlement) throw new HttpError(400, "Tour settlements can only be approved or declined");
    // A record stays where it is (home or its tour); it can't be moved by editing.
    const tour = before.tourId ? await tourAccess(q, before.tourId, actor, true) : null;
    if (!tour) requireHomeSharer(actor);
    guestMayChange(actor, before);

    if (kind === "expense") {
      const d = expenseInput.parse(body);
      if (tour) assertParticipants(tour, [d.payerId, ...d.consumerIds]);
      else await assertHomeMembers(q, [d.payerId, ...d.consumerIds]);
      await q(
        `update expenses set payer_id = $2, amount = $3, category_id = $4, description = $5,
           spent_at = date_trunc('milliseconds', coalesce($6::timestamptz, spent_at)), updated_by = $7, updated_at = now(), version = version + 1
         where id = $1`,
        [id, d.payerId, d.amount, d.categoryId, d.description, d.spentAt ?? null, actor.id],
      );
      await q("delete from expense_shares where expense_id = $1", [id]);
      await writeShares(q, id, d.amount, d.consumerIds);
    } else if (kind === "transfer") {
      const d = transferInput.parse(body);
      if (tour) assertParticipants(tour, [d.fromUserId, d.toUserId]);
      else await assertHomeMembers(q, [d.fromUserId, d.toUserId]);
      await q(
        // Any change has to be confirmed again by the receiver (unless the receiver made it).
        `update transfers set from_user_id = $2, to_user_id = $3, amount = $4, note = $5,
           sent_at = date_trunc('milliseconds', coalesce($6::timestamptz, sent_at)), updated_by = $7, updated_at = now(),
           version = version + 1,
           status = case when $7::uuid = $3::uuid then 'approved' else 'pending' end,
           responded_by = case when $7::uuid = $3::uuid then $7::uuid end, responded_at = case when $7::uuid = $3::uuid then now() end
         where id = $1`,
        [id, d.fromUserId, d.toUserId, d.amount, d.note, d.sentAt ?? null, actor.id],
      );
    } else {
      const d = riceInput.parse({ ...(body as object), trackerId: (body as { trackerId?: string }).trackerId ?? before.trackerId });
      await assertHomeMembers(q, [d.userId]);
      await assertTracker(q, d.trackerId, d.userId);
      await q(
        `update rice_entries set user_id = $2, given_at = date_trunc('milliseconds', coalesce($3::timestamptz, given_at)), note = $4,
           updated_by = $5, updated_at = now(), version = version + 1, tracker_id = $6
         where id = $1`,
        [id, d.userId, d.givenAt ?? null, d.note, actor.id, d.trackerId],
      );
    }
    const after = await snapshot(q, kind, id);
    await audit(q, {
      entity: kind,
      entityId: id,
      action: "update",
      actorId: actor.id,
      actorName: await userName(q, actor.id),
      summary: await describe(q, kind, after),
      before,
      after,
      audience: tour?.participants,
    });
    return after;
  });
}

/** Soft delete (deleted = true) or restore (deleted = false). Rows are never erased. */
export async function setDeleted(kind: RecordKind, actor: Actor, id: string, body: unknown, deleted: boolean) {
  const { version } = versionInput.parse(body);
  const { table } = TABLES[kind];
  return withTx(async (q) => {
    const before = await snapshot(q, kind, id, true);
    assertVersion(before, version);
    if (Boolean(before.deletedAt) === deleted) throw new HttpError(400, deleted ? "Already deleted" : "Not deleted");
    if (before.settlement) throw new HttpError(400, "Tour settlements can only be approved or declined");
    const tour = before.tourId ? await tourAccess(q, before.tourId, actor, true) : null;
    if (!tour) requireHomeSharer(actor);
    guestMayChange(actor, before);
    await q(
      deleted
        ? `update ${table} set deleted_at = now(), deleted_by = $2, version = version + 1 where id = $1`
        : `update ${table} set deleted_at = null, deleted_by = null, updated_by = $2, updated_at = now(),
             version = version + 1 where id = $1`,
      [id, actor.id],
    );
    const after = await snapshot(q, kind, id);
    await audit(q, {
      entity: kind,
      entityId: id,
      action: deleted ? "delete" : "restore",
      actorId: actor.id,
      actorName: await userName(q, actor.id),
      summary: await describe(q, kind, after),
      before,
      after,
      audience: tour?.participants,
    });
    return after;
  });
}

async function writeShares(q: Query, expenseId: string, total: number, consumerIds: string[]) {
  const shares = splitEqual(total, consumerIds);
  await q(
    `insert into expense_shares (expense_id, user_id, amount)
     select $1, x.user_id, x.amount from unnest($2::uuid[], $3::bigint[]) as x(user_id, amount)`,
    [expenseId, shares.map((s) => s.userId), shares.map((s) => s.amount)],
  );
}

// ---------- lists ----------

const LIST_ORDER = { expense: "spent_at", transfer: "sent_at", rice: "given_at" } as const;

/**
 * Keyset-paginated list (newest first), deleted rows included so they can be shown greyed out.
 * ?tour=<id> lists one tour's records (guests: only their tours). Without it: the home fund only
 * (tour expenses stay on their tour; tour settlements with guests do count at home).
 */
export async function listRecords(kind: RecordKind, url: URL, actor: Actor) {
  const { table, alias, cols } = TABLES[kind];
  const col = `${alias}.${LIST_ORDER[kind]}`;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 100);
  const cursor = url.searchParams.get("cursor"); // "<iso>|<id>"
  const category = url.searchParams.get("category");
  const tourId = url.searchParams.get("tour");
  const where: string[] = [];
  const params: unknown[] = [];
  if (cursor) {
    const [at, id] = cursor.split("|");
    params.push(at, id);
    where.push(`(${col}, ${alias}.id) < ($1::timestamptz, $2::uuid)`);
  }
  if (tourId && kind !== "rice") {
    await tourAccess(query, tourId, actor, false);
    params.push(tourId);
    where.push(`${alias}.tour_id = $${params.length}::uuid`);
  } else {
    requireHomeSharer(actor);
    if (kind === "expense") where.push("e.tour_id is null");
    if (kind === "transfer") where.push("(t.tour_id is null or t.settlement)");
  }
  const tracker = url.searchParams.get("tracker");
  if (kind === "rice" && tracker) {
    params.push(tracker);
    where.push(`r.tracker_id = $${params.length}::uuid`);
  }
  if (kind === "expense" && category) {
    params.push(category);
    where.push(`e.category_id = $${params.length}`);
  }
  params.push(limit + 1);
  const rows = await query(
    `select ${cols} from ${table} ${alias} ${where.length ? "where " + where.join(" and ") : ""}
     order by ${col} desc, ${alias}.id desc limit $${params.length}`,
    params,
  );
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const key = LIST_ORDER[kind] === "spent_at" ? "spentAt" : LIST_ORDER[kind] === "sent_at" ? "sentAt" : "givenAt";
  return {
    items,
    nextCursor: rows.length > limit && last ? `${new Date(last[key]).toISOString()}|${last.id}` : null,
  };
}

export const respondInput = z.object({ decision: z.enum(["approve", "decline"]), version: z.number().int().positive() });

/** The receiver confirms (or rejects) money someone says they paid them. Only then does it count. */
export async function respondTransfer(actor: Actor, id: string, body: unknown) {
  const { decision, version } = respondInput.parse(body);
  return withTx(async (q) => {
    const before = await snapshot(q, "transfer", id, true);
    assertVersion(before, version);
    if (before.deletedAt) throw new HttpError(400, "This transfer was deleted");
    if (before.toUserId !== actor.id) throw new HttpError(403, "Only the person who received the money can confirm it");
    if (before.status !== "pending") throw new HttpError(400, "This transfer was already answered");
    // Guests can answer payments on their tours (including settlements after a tour closes).
    const tour = before.tourId ? await tourAccess(q, before.tourId, actor, false) : null;
    if (!tour) requireHomeSharer(actor);
    await q(
      `update transfers set status = $2, responded_by = $3, responded_at = now(), version = version + 1 where id = $1`,
      [id, decision === "approve" ? "approved" : "declined", actor.id],
    );
    const after = await snapshot(q, "transfer", id);
    const actorName = await userName(q, actor.id);
    const n = await names(q, [after.fromUserId]);
    await audit(q, {
      entity: "transfer",
      entityId: id,
      action: "update",
      actorId: actor.id,
      actorName,
      title:
        decision === "approve"
          ? `✅ ${actorName} confirmed ${n[after.fromUserId]}'s payment`
          : `❌ ${actorName} declined ${n[after.fromUserId]}'s payment`,
      summary: await describe(q, "transfer", after),
      before,
      after,
      audience: tour?.participants,
    });
    return after;
  });
}
