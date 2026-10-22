import "server-only";
import { computeRice } from "@/lib/rice";
import { query } from "./db";
import { iso } from "./http";
import { RICE_COLS, TRANSFER_COLS } from "./records";

export async function getSummary(meId: string) {
  const [users, pending, categories, balances, rice, awaitingMe, chat, activity, trackerRows] = await Promise.all([
    query(`select id, name, color, created_at as "createdAt", (pin_hash is null) as "needsPin",
            coalesce(reset_expires_at > now(), false) as "resetApproved",
            approved_by as "addedBy", coalesce(approved_at, created_at) as "joinedAt",
            (extract(epoch from avatar_updated_at) * 1000)::bigint::text as "avatarVersion"
           from users where status = 'active' order by created_at`),
    query(`select id, name, color, created_at as "createdAt" from users where status = 'pending' order by created_at`),
    query(
      `select id, name, emoji, is_default as "isDefault", deleted_at as "deletedAt"
       from categories order by is_default desc, name`,
    ),
    query<{ id: string; balance: number; paid: number; consumed: number }>(
      `with paid as (select payer_id uid, sum(amount) v from expenses where deleted_at is null group by 1),
            owed as (select s.user_id uid, sum(s.amount) v from expense_shares s
                     join expenses e on e.id = s.expense_id where e.deleted_at is null group by 1),
            sent as (select from_user_id uid, sum(amount) v from transfers where deleted_at is null and status = 'approved' group by 1),
            recv as (select to_user_id uid, sum(amount) v from transfers where deleted_at is null and status = 'approved' group by 1)
       select u.id,
              (coalesce(p.v,0) - coalesce(o.v,0) + coalesce(s.v,0) - coalesce(r.v,0))::float8 as balance,
              coalesce(p.v,0)::float8 as paid, coalesce(o.v,0)::float8 as consumed
       from users u
       left join paid p on p.uid = u.id left join owed o on o.uid = u.id
       left join sent s on s.uid = u.id left join recv r on r.uid = u.id
       where u.status = 'active'`,
    ),
    query(`select ${RICE_COLS} from rice_entries r where r.deleted_at is null`),
    // Payments other people say they made to me, waiting for my OK.
    query(
      `select ${TRANSFER_COLS} from transfers t
       where t.deleted_at is null and t.status = 'pending' and t.to_user_id = $1 order by t.sent_at desc`,
      [meId],
    ),
    // Latest chat message, for the unread dot.
    query(`select id::int as id, user_id as "userId", created_at as "createdAt" from chat_messages order by id desc limit 1`),
    // Latest activity-log entry, for the bell dot.
    query(`select id::int as id, actor_id as "userId" from audit_log order by id desc limit 1`),
    query<{ id: string; name: string; emoji: string; memberIds: string[] | null; isDefault: boolean; createdAt: Date }>(
      `select id, name, emoji, member_ids as "memberIds", is_default as "isDefault", created_at as "createdAt"
       from trackers where deleted_at is null order by is_default desc, created_at`,
    ),
  ]);

  // Every turn tracker (Rice + custom ones) gets its own cycle status, replayed from its entries.
  const trackers = trackerRows.map((t) => {
    const participants = users.filter((u) => !t.memberIds || t.memberIds.includes(u.id));
    const trackerStart = new Date(t.createdAt).getTime();
    return {
      id: t.id,
      name: t.name,
      emoji: t.emoji,
      isDefault: t.isDefault,
      memberIds: participants.map((u) => u.id),
      everyone: !t.memberIds,
      status: computeRice(
        // Duty starts when the member joined or when the tracker was created, whichever is later.
        participants.map((u) => ({ id: u.id, createdAt: new Date(Math.max(new Date(u.joinedAt).getTime(), trackerStart)).toISOString() })),
        rice
          .filter((r) => r.trackerId === t.id)
          .map((r) => ({ id: r.id, userId: r.userId, givenAt: iso(r.givenAt)!, createdAt: iso(r.createdAt)! })),
      ),
    };
  });
  const riceStatus = trackers.find((t) => t.isDefault)?.status ?? computeRice([], []);
  return { meId, users, pending, categories, balances, rice: riceStatus, awaitingMe, lastChat: chat[0] ?? null, lastActivity: activity[0] ?? null, trackers };
}
