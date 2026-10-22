import "server-only";
import { z } from "zod";
import { formatTaka } from "@/lib/money";
import { settleWithGuests } from "@/lib/tour-settle";
import { query, withTx, type Query } from "./db";
import { HttpError } from "./http";
import { audit, userName } from "./audit";
import { homeBalances, tourNets } from "./balances";
import { tourAccess, type Actor } from "./records";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").nullish();

export const tourInput = z
  .object({
    name: z.string().trim().min(1, "Give the tour a name").max(60),
    emoji: z.string().trim().min(1).max(8).default("🧳"),
    startDate: day,
    endDate: day,
    notes: z.string().trim().max(1000).default(""),
    participantIds: z.array(z.uuid()).min(1, "Add at least one person"),
    planItems: z
      .array(
        z.object({
          label: z.string().trim().min(1, "Each plan line needs a name").max(80),
          categoryId: z.uuid().nullish(),
          amount: z.number().int().nonnegative().max(100_000_000_00),
        }),
      )
      .max(100)
      .default([]),
  })
  .refine((t) => !t.startDate || !t.endDate || t.startDate <= t.endDate, "The end date is before the start date");

const TOUR_COLS = `t.id, t.name, t.emoji, t.status, to_char(t.start_date, 'YYYY-MM-DD') as "startDate",
  to_char(t.end_date, 'YYYY-MM-DD') as "endDate", t.notes, t.created_by as "createdBy", t.created_at as "createdAt",
  t.started_at as "startedAt", t.started_by as "startedBy", t.closed_at as "closedAt", t.closed_by as "closedBy",
  coalesce((select array_agg(tp.user_id) from tour_participants tp where tp.tour_id = t.id), '{}') as "participantIds",
  coalesce((select sum(e.amount) from expenses e where e.tour_id = t.id and e.deleted_at is null), 0)::float8 as spent,
  coalesce((select sum(p.amount) from tour_plan_items p where p.tour_id = t.id), 0)::float8 as planned`;

/** Tours this person can see: home sharers see all; guests only the tours they're on. */
export async function listTours(actor: Actor) {
  return query(
    `select ${TOUR_COLS} from tours t
     where t.deleted_at is null
       and ($1::text = 'member' or exists (select 1 from tour_participants tp where tp.tour_id = t.id and tp.user_id = $2))
     order by case t.status when 'active' then 0 when 'planned' then 1 else 2 end,
              coalesce(t.closed_at, t.started_at, t.created_at) desc`,
    [actor.role, actor.id],
  );
}

/** Everything about one tour: participants' positions, plan vs actual, and the settlement. */
export async function getTour(actor: Actor, id: string) {
  await tourAccess(query, id, actor, false);
  const [[tour], plan, byCategory, nets, settlements] = await Promise.all([
    query(`select ${TOUR_COLS} from tours t where t.id = $1`, [id]),
    query(
      `select id, label, category_id as "categoryId", amount::float8 as amount from tour_plan_items where tour_id = $1 order by created_at`,
      [id],
    ),
    query(
      `select category_id as "categoryId", sum(amount)::float8 as total, count(*)::int as count
       from expenses where tour_id = $1 and deleted_at is null group by 1 order by 2 desc`,
      [id],
    ),
    tourNets(id),
    query(
      `select t.id, t.from_user_id as "fromUserId", t.to_user_id as "toUserId", t.amount::float8 as amount, t.status,
              t.version, t.responded_at as "respondedAt"
       from transfers t where t.tour_id = $1 and t.settlement and t.deleted_at is null order by t.amount desc`,
      [id],
    ),
  ]);
  // While a tour is open, show what closing it *would* do.
  const preview = tour.status === "closed" ? null : await settlementFor(id, nets);
  return { tour, plan, byCategory, nets, settlements, preview };
}

/** The guest ↔ home sharer payments a tour needs (see settleWithGuests). */
async function settlementFor(tourId: string, nets?: Awaited<ReturnType<typeof tourNets>>) {
  const [rows, roles, home] = await Promise.all([
    nets ? Promise.resolve(nets) : tourNets(tourId),
    query<{ id: string; role: string }>(
      "select u.id, u.role from users u join tour_participants tp on tp.user_id = u.id where tp.tour_id = $1",
      [tourId],
    ),
    homeBalances(),
  ]);
  const roleOf = Object.fromEntries(roles.map((r) => [r.id, r.role]));
  const netOf = Object.fromEntries(rows.map((r) => [r.id, r.net]));
  const guestNets = Object.fromEntries(rows.filter((r) => roleOf[r.id] === "guest").map((r) => [r.id, r.net]));
  // "Status of their account": home balance with this tour added. Home sharers on the tour settle
  // with guests; if none went, any home sharer can.
  const onTour = home.filter((h) => roleOf[h.id] === "member");
  const candidates = onTour.length ? onTour : home;
  const status = Object.fromEntries(candidates.map((h) => [h.id, h.planBalance + (netOf[h.id] ?? 0)]));
  return settleWithGuests(guestNets, status);
}

async function checkPeople(q: Query, ids: string[]) {
  const unique = [...new Set(ids)];
  const [{ n }] = await q<{ n: number }>("select count(*)::int as n from users where id = any($1::uuid[]) and status = 'active'", [
    unique,
  ]);
  if (n !== unique.length) throw new HttpError(400, "Unknown person selected");
  return unique;
}

async function writePlan(q: Query, tourId: string, items: z.infer<typeof tourInput>["planItems"], actorId: string) {
  await q("delete from tour_plan_items where tour_id = $1", [tourId]);
  if (!items.length) return;
  await q(
    `insert into tour_plan_items (tour_id, label, category_id, amount, created_by)
     select $1, x.label, x.category_id, x.amount, $2 from json_to_recordset($3::json) as x(label text, category_id uuid, amount bigint)`,
    [tourId, actorId, JSON.stringify(items.map((i) => ({ label: i.label, category_id: i.categoryId ?? null, amount: i.amount })))],
  );
}

const snapshotTour = async (q: Query, id: string) => (await q(`select ${TOUR_COLS} from tours t where t.id = $1`, [id]))[0];

/** Making a plan doesn't start the tour: it stays "planned" until a home sharer starts it. */
export async function createTour(actorId: string, body: unknown) {
  const d = tourInput.parse(body);
  return withTx(async (q) => {
    const people = await checkPeople(q, d.participantIds);
    const [{ id }] = await q<{ id: string }>(
      `insert into tours (name, emoji, start_date, end_date, notes, created_by) values ($1, $2, $3, $4, $5, $6) returning id`,
      [d.name, d.emoji, d.startDate ?? null, d.endDate ?? null, d.notes, actorId],
    );
    await q("insert into tour_participants (tour_id, user_id) select $1, unnest($2::uuid[])", [id, people]);
    await writePlan(q, id, d.planItems, actorId);
    const after = await snapshotTour(q, id);
    const actorName = await userName(q, actorId);
    await audit(q, {
      entity: "tour",
      entityId: id,
      action: "create",
      actorId,
      actorName,
      title: `${d.emoji} ${actorName} planned a tour: ${d.name}`,
      summary: `${d.emoji} Tour "${d.name}" planned`,
      after,
      audience: people,
    });
    return after;
  });
}

export async function updateTour(actorId: string, id: string, body: unknown) {
  const d = tourInput.parse(body);
  return withTx(async (q) => {
    const before = await snapshotTour(q, id);
    if (!before) throw new HttpError(404, "Tour not found");
    if (before.status === "closed") throw new HttpError(400, "A closed tour can't be changed");
    const people = await checkPeople(q, d.participantIds);
    // Someone who already has expenses on the tour can't be removed from it.
    const [busy] = await q<{ name: string }>(
      `select u.name from users u where u.id = any($2::uuid[]) and not (u.id = any($3::uuid[])) and (
         exists (select 1 from expenses e where e.tour_id = $1 and e.deleted_at is null and e.payer_id = u.id) or
         exists (select 1 from expense_shares s join expenses e on e.id = s.expense_id
                 where e.tour_id = $1 and e.deleted_at is null and s.user_id = u.id))
       limit 1`,
      [id, before.participantIds, people],
    );
    if (busy) throw new HttpError(400, `${busy.name} already has expenses on this tour and can't be removed`);
    await q("update tours set name = $2, emoji = $3, start_date = $4, end_date = $5, notes = $6 where id = $1", [
      id,
      d.name,
      d.emoji,
      d.startDate ?? null,
      d.endDate ?? null,
      d.notes,
    ]);
    await q("delete from tour_participants where tour_id = $1", [id]);
    await q("insert into tour_participants (tour_id, user_id) select $1, unnest($2::uuid[])", [id, people]);
    await writePlan(q, id, d.planItems, actorId);
    const after = await snapshotTour(q, id);
    await audit(q, {
      entity: "tour",
      entityId: id,
      action: "update",
      actorId,
      actorName: await userName(q, actorId),
      summary: `${after.emoji} Tour "${after.name}" updated`,
      before,
      after,
      notify: false,
    });
    return after;
  });
}

/** Planned → active. Only home sharers can start a tour. */
export async function startTour(actorId: string, id: string) {
  return withTx(async (q) => {
    const before = await snapshotTour(q, id);
    if (!before) throw new HttpError(404, "Tour not found");
    if (before.status !== "planned") throw new HttpError(400, "This tour has already started");
    await q("update tours set status = 'active', started_at = now(), started_by = $2 where id = $1", [id, actorId]);
    const after = await snapshotTour(q, id);
    const actorName = await userName(q, actorId);
    await audit(q, {
      entity: "tour",
      entityId: id,
      action: "update",
      actorId,
      actorName,
      title: `${after.emoji} ${after.name} has started!`,
      summary: `${after.emoji} ${actorName} started the tour "${after.name}"`,
      before,
      after,
      audience: after.participantIds,
    });
    return after;
  });
}

/**
 * Active → closed (home sharers only). Creates one pending settlement payment per guest with the
 * chosen home sharer; the receiver confirms each when the money arrives. Home sharers' tour shares
 * then count in the home fund.
 */
export async function closeTour(actorId: string, id: string) {
  const payments = await settlementFor(id);
  return withTx(async (q) => {
    const before = await snapshotTour(q, id);
    if (!before) throw new HttpError(404, "Tour not found");
    if (before.status !== "active") throw new HttpError(400, before.status === "planned" ? "This tour hasn't started" : "Already closed");
    await q("update tours set status = 'closed', closed_at = now(), closed_by = $2 where id = $1", [id, actorId]);
    for (const p of payments) {
      await q(
        `insert into transfers (from_user_id, to_user_id, amount, note, sent_at, created_by, status, tour_id, settlement)
         values ($1, $2, $3, $4, date_trunc('milliseconds', now()), $5, 'pending', $6, true)`,
        [p.from, p.to, p.amount, `${before.emoji} ${before.name} settlement`, actorId, id],
      );
    }
    const after = await snapshotTour(q, id);
    const actorName = await userName(q, actorId);
    await audit(q, {
      entity: "tour",
      entityId: id,
      action: "update",
      actorId,
      actorName,
      title: `${after.emoji} ${after.name} is closed`,
      summary: `${after.emoji} ${actorName} closed "${after.name}" · spent ${formatTaka(after.spent)} · ${payments.length} settlement payment${
        payments.length === 1 ? "" : "s"
      }`,
      before,
      after,
      audience: after.participantIds,
    });
    return { ...after, payments };
  });
}

/** Only a tour that never started (and has no expenses) can be deleted. */
export async function deleteTour(actorId: string, id: string) {
  return withTx(async (q) => {
    const before = await snapshotTour(q, id);
    if (!before) throw new HttpError(404, "Tour not found");
    if (before.status !== "planned") throw new HttpError(400, "Only a tour that hasn't started can be deleted");
    await q("update tours set deleted_at = now(), deleted_by = $2 where id = $1", [id, actorId]);
    await audit(q, {
      entity: "tour",
      entityId: id,
      action: "delete",
      actorId,
      actorName: await userName(q, actorId),
      summary: `${before.emoji} Tour plan "${before.name}" deleted`,
      before,
      notify: false,
    });
    return { ok: true };
  });
}

/** Archive export: every visible tour with its expenses, positions, plan and settlements. */
export async function exportTours(actor: Actor) {
  const tours = await listTours(actor);
  const ids = tours.map((t) => t.id);
  if (!ids.length) return { tours: [], expenses: [], nets: [], plan: [], settlements: [], people: [], categories: [] };
  const [expenses, plan, settlements, people, categories, nets] = await Promise.all([
    query(
      `select e.tour_id as "tourId", e.spent_at as "spentAt", e.description, e.category_id as "categoryId",
              e.payer_id as "payerId", e.amount::float8 as amount, (e.deleted_at is not null) as deleted,
              coalesce((select array_agg(s.user_id) from expense_shares s where s.expense_id = e.id), '{}') as "consumerIds"
       from expenses e where e.tour_id = any($1::uuid[]) order by e.spent_at`,
      [ids],
    ),
    query(
      `select tour_id as "tourId", label, category_id as "categoryId", amount::float8 as amount
       from tour_plan_items where tour_id = any($1::uuid[]) order by created_at`,
      [ids],
    ),
    query(
      `select tour_id as "tourId", from_user_id as "fromUserId", to_user_id as "toUserId", amount::float8 as amount, status
       from transfers where tour_id = any($1::uuid[]) and settlement and deleted_at is null`,
      [ids],
    ),
    query(
      `select id, name, role from users where id in (select user_id from tour_participants where tour_id = any($1::uuid[]))`,
      [ids],
    ),
    query(`select id, name, emoji from categories`),
    Promise.all(ids.map(async (id) => (await tourNets(id)).map((n) => ({ ...n, tourId: id })))).then((x) => x.flat()),
  ]);
  return { tours, expenses, nets, plan, settlements, people, categories };
}
