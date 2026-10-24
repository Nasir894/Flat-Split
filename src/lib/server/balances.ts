import "server-only";
import { query } from "./db";

// Rows that belong to the home fund: home records, plus everything from tours once they're closed
// (an active tour is kept separate until it's closed).
export const IN_HOME_FUND = (alias: string) =>
  `(${alias}.tour_id is null or exists (select 1 from tours tr where tr.id = ${alias}.tour_id and tr.status = 'closed'))`;

export type Balance = { id: string; balance: number; paid: number; consumed: number; planBalance: number };

/**
 * Home-fund balance per home sharer: paid − consumed + sent − received (approved transfers).
 * `planBalance` also counts pending tour settlements as done — guests settle those with one home
 * sharer each, so home settle-up suggestions shouldn't wait for them.
 */
export async function homeBalances(): Promise<Balance[]> {
  return query<Balance>(
    `with paid as (select payer_id uid, sum(amount) v from expenses e where deleted_at is null and ${IN_HOME_FUND("e")} group by 1),
          owed as (select s.user_id uid, sum(s.amount) v from expense_shares s
                   join expenses e on e.id = s.expense_id where e.deleted_at is null and ${IN_HOME_FUND("e")} group by 1),
          sent as (select from_user_id uid, sum(amount) v from transfers t
                   where deleted_at is null and status = 'approved' and ${IN_HOME_FUND("t")} group by 1),
          recv as (select to_user_id uid, sum(amount) v from transfers t
                   where deleted_at is null and status = 'approved' and ${IN_HOME_FUND("t")} group by 1),
          psent as (select from_user_id uid, sum(amount) v from transfers
                    where deleted_at is null and status = 'pending' and settlement group by 1),
          precv as (select to_user_id uid, sum(amount) v from transfers
                    where deleted_at is null and status = 'pending' and settlement group by 1)
     select u.id,
            (coalesce(p.v,0) - coalesce(o.v,0) + coalesce(s.v,0) - coalesce(r.v,0))::float8 as balance,
            coalesce(p.v,0)::float8 as paid, coalesce(o.v,0)::float8 as consumed,
            (coalesce(p.v,0) - coalesce(o.v,0) + coalesce(s.v,0) - coalesce(r.v,0)
              + coalesce(ps.v,0) - coalesce(pr.v,0))::float8 as "planBalance"
     from users u
     left join paid p on p.uid = u.id left join owed o on o.uid = u.id
     left join sent s on s.uid = u.id left join recv r on r.uid = u.id
     left join psent ps on ps.uid = u.id left join precv pr on pr.uid = u.id
     where u.status = 'active' and u.role = 'member'`,
  );
}

export type TourNet = { id: string; paid: number; consumed: number; net: number };

/** Each participant's position on one tour: paid − consumed ± approved (non-settlement) tour transfers. */
export async function tourNets(tourId: string): Promise<TourNet[]> {
  return query<TourNet>(
    `with paid as (select payer_id uid, sum(amount) v from expenses where tour_id = $1 and deleted_at is null group by 1),
          owed as (select s.user_id uid, sum(s.amount) v from expense_shares s join expenses e on e.id = s.expense_id
                   where e.tour_id = $1 and e.deleted_at is null group by 1),
          sent as (select from_user_id uid, sum(amount) v from transfers
                   where tour_id = $1 and deleted_at is null and status = 'approved' and not settlement group by 1),
          recv as (select to_user_id uid, sum(amount) v from transfers
                   where tour_id = $1 and deleted_at is null and status = 'approved' and not settlement group by 1)
     select tp.user_id as id, coalesce(p.v,0)::float8 as paid, coalesce(o.v,0)::float8 as consumed,
            (coalesce(p.v,0) - coalesce(o.v,0) + coalesce(s.v,0) - coalesce(r.v,0))::float8 as net
     from tour_participants tp
     left join paid p on p.uid = tp.user_id left join owed o on o.uid = tp.user_id
     left join sent s on s.uid = tp.user_id left join recv r on r.uid = tp.user_id
     where tp.tour_id = $1`,
    [tourId],
  );
}
