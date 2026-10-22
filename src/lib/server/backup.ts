import "server-only";
import { z } from "zod";
import { query, withTx } from "./db";
import { HttpError } from "./http";
import { audit, userName } from "./audit";

// PIN hashes are deliberately NOT exported: with only 10,000 possible PINs a leaked
// backup would be trivial to crack. Restored members who don't exist yet set a new PIN.

export async function exportBackup() {
  const [users, categories, expenses, expenseShares, transfers, riceEntries, auditLog, trackers] = await Promise.all([
    query(`select id, name, color, created_at as "createdAt", approved_by as "addedBy", approved_at as "approvedAt"
           from users where status = 'active' order by created_at`),
    query(`select id, name, emoji, is_default as "isDefault", created_by as "createdBy", created_at as "createdAt",
                  deleted_by as "deletedBy", deleted_at as "deletedAt" from categories order by created_at`),
    query(`select id, payer_id as "payerId", amount::int8::float8 as amount, category_id as "categoryId", description,
                  spent_at as "spentAt", created_by as "createdBy", created_at as "createdAt", updated_by as "updatedBy",
                  updated_at as "updatedAt", deleted_by as "deletedBy", deleted_at as "deletedAt", version
           from expenses order by spent_at`),
    query(`select expense_id as "expenseId", user_id as "userId", amount::float8 as amount from expense_shares`),
    query(`select id, from_user_id as "fromUserId", to_user_id as "toUserId", amount::float8 as amount, note,
                  sent_at as "sentAt", created_by as "createdBy", created_at as "createdAt", updated_by as "updatedBy",
                  updated_at as "updatedAt", deleted_by as "deletedBy", deleted_at as "deletedAt", version,
                  status, responded_by as "respondedBy", responded_at as "respondedAt"
           from transfers order by sent_at`),
    query(`select id, user_id as "userId", given_at as "givenAt", note, created_by as "createdBy",
                  created_at as "createdAt", updated_by as "updatedBy", updated_at as "updatedAt",
                  deleted_by as "deletedBy", deleted_at as "deletedAt", version, tracker_id as "trackerId"
           from rice_entries order by given_at`),
    query(`select entity, entity_id as "entityId", action, actor_id as "actorId", summary, before, after,
                  created_at as "createdAt" from audit_log order by id`),
    query(`select id, name, emoji, member_ids as "memberIds", is_default as "isDefault", created_by as "createdBy",
                  created_at as "createdAt", deleted_by as "deletedBy", deleted_at as "deletedAt" from trackers order by created_at`),
  ]);
  return {
    app: "flat-split",
    format: 1,
    exportedAt: new Date().toISOString(),
    users,
    categories,
    expenses,
    expenseShares,
    transfers,
    riceEntries,
    trackers,
    auditLog,
  };
}

const id = z.uuid();
const ts = z.string().min(1);
const opt = <T extends z.ZodType>(t: T) => t.nullish().transform((v) => v ?? null);
const meta = {
  createdBy: opt(id),
  createdAt: ts,
  updatedBy: opt(id),
  updatedAt: opt(ts),
  deletedBy: opt(id),
  deletedAt: opt(ts),
  version: z.number().int().positive().default(1),
};

const backupSchema = z.object({
  app: z.literal("flat-split", { error: "This is not a Flat Split backup file" }),
  format: z.literal(1),
  users: z.array(
    z.object({ id, name: z.string().min(1).max(40), color: z.string().max(20), createdAt: ts, addedBy: opt(id), approvedAt: opt(ts) }),
  ),
  categories: z.array(
    z.object({
      id,
      name: z.string().min(1),
      emoji: z.string(),
      isDefault: z.boolean(),
      createdBy: opt(id),
      createdAt: ts,
      deletedBy: opt(id),
      deletedAt: opt(ts),
    }),
  ),
  expenses: z.array(
    z.object({
      id,
      payerId: id,
      amount: z.number().int().positive(),
      categoryId: opt(id),
      description: z.string(),
      spentAt: ts,
      ...meta,
    }),
  ),
  expenseShares: z.array(z.object({ expenseId: id, userId: id, amount: z.number().int().nonnegative() })),
  transfers: z.array(
    z.object({
      id,
      fromUserId: id,
      toUserId: id,
      amount: z.number().int().positive(),
      note: z.string(),
      sentAt: ts,
      ...meta,
      // Older backups have no status: those transfers were all counted.
      status: z.enum(["pending", "approved", "declined"]).default("approved"),
      respondedBy: opt(id),
      respondedAt: opt(ts),
    }),
  ),
  riceEntries: z.array(
    z.object({ id, userId: id, givenAt: ts, note: z.string(), ...meta, trackerId: id.default("00000000-0000-4000-8000-000000000001") }),
  ),
  // Older backups have no trackers: only the built-in Rice tracker existed.
  trackers: z
    .array(
      z.object({
        id,
        name: z.string().min(1),
        emoji: z.string(),
        memberIds: z.array(id).nullish().transform((v) => v ?? null),
        isDefault: z.boolean(),
        createdBy: opt(id),
        createdAt: ts,
        deletedBy: opt(id),
        deletedAt: opt(ts),
      }),
    )
    .default([]),
  auditLog: z
    .array(
      z.object({
        entity: z.string(),
        entityId: opt(id),
        action: z.string(),
        actorId: opt(id),
        summary: z.string(),
        before: z.unknown().optional(),
        after: z.unknown().optional(),
        createdAt: ts,
      }),
    )
    .default([]),
});

/** Full restore: replaces all money/rice/category records with the backup's. Audit history is kept and merged. */
export async function importBackup(actorId: string, raw: unknown) {
  const b = backupSchema.parse(raw);

  return withTx(async (q) => {
    // Allow the hard deletes that the triggers otherwise block — for this transaction only.
    await q("select set_config('flatsplit.restore', 'on', true)");

    // Members: match by id, else by name (e.g. after a fresh deploy the same person signs up again).
    // Pending join requests whose name matches a member in the backup are dropped (the backup wins).
    await q("delete from users where status = 'pending' and lower(name) = any($1::text[])", [
      b.users.map((u) => u.name.toLowerCase()),
    ]);
    const existing = await q<{ id: string; name: string }>("select id, name from users");
    const byName = new Map(existing.map((u) => [u.name.toLowerCase(), u.id]));
    const ids = new Set(existing.map((u) => u.id));
    const map = new Map<string, string>();
    const inserted: typeof b.users = [];
    for (const u of b.users) {
      const target = ids.has(u.id) ? u.id : (byName.get(u.name.toLowerCase()) ?? u.id);
      map.set(u.id, target);
      if (!ids.has(target)) {
        await q(
          "insert into users (id, name, color, created_at, approved_at, status) values ($1, $2, $3, $4, $5, 'active')",
          [target, u.name, u.color, u.createdAt, u.approvedAt],
        );
        inserted.push(u);
      }
    }
    const m = (v: string | null) => (v ? (map.get(v) ?? v) : null);
    // "Added by" for restored members, once everyone they reference exists.
    for (const u of inserted) {
      if (u.addedBy) await q("update users set approved_by = $2 where id = $1", [m(u.id), m(u.addedBy)]);
    }
    const known = new Set([...ids, ...map.values()]);
    const check = (v: string | null) => {
      if (v && !known.has(v)) throw new HttpError(400, "Backup references a member that is not in the file");
      return v;
    };
    const mu = (v: string | null) => check(m(v));

    await q("delete from expense_shares");
    await q("delete from expenses");
    await q("delete from transfers");
    await q("delete from rice_entries");
    await q("delete from categories");
    await q("delete from trackers where not is_default");

    const bulk = (sql: string, rows: unknown[]) => (rows.length ? q(sql, [JSON.stringify(rows)]) : Promise.resolve([]));

    await bulk(
      `insert into categories (id, name, emoji, is_default, created_by, created_at, deleted_by, deleted_at)
       select * from json_to_recordset($1::json) as x(id uuid, name text, emoji text, is_default boolean,
         created_by uuid, created_at timestamptz, deleted_by uuid, deleted_at timestamptz)`,
      b.categories.map((c) => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        is_default: c.isDefault,
        created_by: mu(c.createdBy),
        created_at: c.createdAt,
        deleted_by: mu(c.deletedBy),
        deleted_at: c.deletedAt,
      })),
    );
    const metaRow = (r: z.infer<typeof backupSchema>["expenses"][number] | z.infer<typeof backupSchema>["transfers"][number] | z.infer<typeof backupSchema>["riceEntries"][number]) => ({
      created_by: mu(r.createdBy) ?? actorId,
      created_at: r.createdAt,
      updated_by: mu(r.updatedBy),
      updated_at: r.updatedAt,
      deleted_by: mu(r.deletedBy),
      deleted_at: r.deletedAt,
      version: r.version,
    });
    const META_COLS = `created_by uuid, created_at timestamptz, updated_by uuid, updated_at timestamptz,
                       deleted_by uuid, deleted_at timestamptz, version int`;
    await bulk(
      `insert into expenses (id, payer_id, amount, category_id, description, spent_at, created_by, created_at,
                             updated_by, updated_at, deleted_by, deleted_at, version)
       select * from json_to_recordset($1::json) as x(id uuid, payer_id uuid, amount bigint, category_id uuid,
         description text, spent_at timestamptz, ${META_COLS})`,
      b.expenses.map((e) => ({
        id: e.id,
        payer_id: mu(e.payerId),
        amount: e.amount,
        category_id: e.categoryId,
        description: e.description,
        spent_at: e.spentAt,
        ...metaRow(e),
      })),
    );
    await bulk(
      `insert into expense_shares (expense_id, user_id, amount)
       select * from json_to_recordset($1::json) as x(expense_id uuid, user_id uuid, amount bigint)`,
      b.expenseShares.map((s) => ({ expense_id: s.expenseId, user_id: mu(s.userId), amount: s.amount })),
    );
    await bulk(
      `insert into transfers (id, from_user_id, to_user_id, amount, note, sent_at, created_by, created_at,
                              updated_by, updated_at, deleted_by, deleted_at, version, status, responded_by, responded_at)
       select * from json_to_recordset($1::json) as x(id uuid, from_user_id uuid, to_user_id uuid, amount bigint,
         note text, sent_at timestamptz, ${META_COLS}, status text, responded_by uuid, responded_at timestamptz)`,
      b.transfers.map((t) => ({
        id: t.id,
        from_user_id: mu(t.fromUserId),
        to_user_id: mu(t.toUserId),
        amount: t.amount,
        note: t.note,
        sent_at: t.sentAt,
        ...metaRow(t),
        status: t.status,
        responded_by: mu(t.respondedBy),
        responded_at: t.respondedAt,
      })),
    );
    await bulk(
      `insert into trackers (id, name, emoji, member_ids, is_default, created_by, created_at, deleted_by, deleted_at)
       select * from json_to_recordset($1::json) as x(id uuid, name text, emoji text, member_ids uuid[], is_default boolean,
         created_by uuid, created_at timestamptz, deleted_by uuid, deleted_at timestamptz)
       on conflict (id) do update set name = excluded.name, emoji = excluded.emoji`,
      b.trackers.map((t) => ({
        id: t.id,
        name: t.name,
        emoji: t.emoji,
        member_ids: t.memberIds ? t.memberIds.map((x) => mu(x)) : null,
        is_default: t.isDefault,
        created_by: mu(t.createdBy),
        created_at: t.createdAt,
        deleted_by: mu(t.deletedBy),
        deleted_at: t.deletedAt,
      })),
    );
    await bulk(
      `insert into rice_entries (id, user_id, given_at, note, created_by, created_at,
                                 updated_by, updated_at, deleted_by, deleted_at, version, tracker_id)
       select * from json_to_recordset($1::json) as x(id uuid, user_id uuid, given_at timestamptz, note text, ${META_COLS}, tracker_id uuid)`,
      b.riceEntries.map((r) => ({ id: r.id, user_id: mu(r.userId), given_at: r.givenAt, note: r.note, ...metaRow(r), tracker_id: r.trackerId })),
    );
    // Merge history: add backup audit entries that aren't already in the log.
    await bulk(
      `insert into audit_log (entity, entity_id, action, actor_id, summary, before, after, created_at)
       select x.* from json_to_recordset($1::json) as x(entity text, entity_id uuid, action text, actor_id uuid,
         summary text, before jsonb, after jsonb, created_at timestamptz)
       where not exists (select 1 from audit_log a where a.created_at = x.created_at and a.action = x.action
                          and a.entity = x.entity and a.entity_id is not distinct from x.entity_id)
       order by x.created_at`,
      b.auditLog.map((a) => ({
        entity: a.entity,
        entity_id: a.entityId,
        action: a.action,
        actor_id: m(a.actorId),
        summary: a.summary,
        before: a.before ?? null,
        after: a.after ?? null,
        created_at: a.createdAt,
      })),
    );

    const counts = `${b.expenses.length} expenses, ${b.transfers.length} transfers, ${b.riceEntries.length} rice entries`;
    await audit(q, {
      entity: "backup",
      entityId: null,
      action: "import",
      actorId,
      actorName: await userName(q, actorId),
      summary: `Restored backup from ${b.users.length ? "file" : "empty file"} (${counts})`,
    });
    return { restored: counts };
  });
}
