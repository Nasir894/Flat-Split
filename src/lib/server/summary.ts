import "server-only";
import { computeRice } from "@/lib/rice";
import { query } from "./db";
import { iso } from "./http";
import { RICE_COLS } from "./records";

export async function getSummary(meId: string) {
  const [users, pending, categories, balances, rice] = await Promise.all([
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
            sent as (select from_user_id uid, sum(amount) v from transfers where deleted_at is null group by 1),
            recv as (select to_user_id uid, sum(amount) v from transfers where deleted_at is null group by 1)
       select u.id,
              (coalesce(p.v,0) - coalesce(o.v,0) + coalesce(s.v,0) - coalesce(r.v,0))::float8 as balance,
              coalesce(p.v,0)::float8 as paid, coalesce(o.v,0)::float8 as consumed
       from users u
       left join paid p on p.uid = u.id left join owed o on o.uid = u.id
       left join sent s on s.uid = u.id left join recv r on r.uid = u.id
       where u.status = 'active'`,
    ),
    query(`select ${RICE_COLS} from rice_entries r where r.deleted_at is null`),
  ]);

  const riceStatus = computeRice(
    // Rice duty starts when a member actually joined (was approved).
    users.map((u) => ({ id: u.id, createdAt: iso(u.joinedAt)! })),
    rice.map((r) => ({ id: r.id, userId: r.userId, givenAt: iso(r.givenAt)!, createdAt: iso(r.createdAt)! })),
  );

  return { meId, users, pending, categories, balances, rice: riceStatus };
}
