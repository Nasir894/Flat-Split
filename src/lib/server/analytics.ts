import "server-only";
import { z } from "zod";
import { query } from "./db";

export const TZ = "Asia/Dhaka";

const params = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  category: z.uuid().nullish(),
});

/**
 * Spending aggregates for [from, to), plus the same-length period just before it for comparison.
 * Only non-deleted expenses count.
 */
export async function getAnalytics(url: URL) {
  const p = params.parse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    category: url.searchParams.get("category") || null,
  });
  const fromMs = new Date(p.from).getTime();
  const toMs = new Date(p.to).getTime();
  const prevFrom = new Date(fromMs - (toMs - fromMs)).toISOString();

  // $1 from, $2 to, $3 category (nullable), $4 time zone
  const args = [p.from, p.to, p.category ?? null, TZ];
  const where = `e.deleted_at is null and e.spent_at >= $1 and e.spent_at < $2
                 and ($3::uuid is null or e.category_id = $3) and $4::text is not null`;

  const [daily, byCategory, byPayer, byConsumer, byWeekday, top, totals, previous] = await Promise.all([
    query(
      `select to_char(date_trunc('day', e.spent_at at time zone $4), 'YYYY-MM-DD') as day, sum(e.amount)::float8 as total
       from expenses e where ${where} group by 1 order by 1`,
      args,
    ),
    query(
      `select e.category_id as "categoryId", sum(e.amount)::float8 as total, count(*)::int as count
       from expenses e where ${where} group by 1 order by 2 desc`,
      args,
    ),
    query(
      `select e.payer_id as "userId", sum(e.amount)::float8 as total
       from expenses e where ${where} group by 1`,
      args,
    ),
    query(
      `select s.user_id as "userId", sum(s.amount)::float8 as total
       from expense_shares s join expenses e on e.id = s.expense_id where ${where} group by 1`,
      args,
    ),
    // 1 = Monday … 7 = Sunday, in Dhaka time
    query(
      `select extract(isodow from e.spent_at at time zone $4)::int as dow, sum(e.amount)::float8 as total, count(*)::int as count
       from expenses e where ${where} group by 1 order by 1`,
      args,
    ),
    query(
      `select e.id, e.description, e.amount::float8 as amount, e.category_id as "categoryId",
              e.payer_id as "payerId", e.spent_at as "spentAt"
       from expenses e where ${where} order by e.amount desc, e.spent_at desc limit 5`,
      args,
    ),
    query(
      `select coalesce(sum(e.amount), 0)::float8 as total, count(*)::int as count,
              count(distinct date_trunc('day', e.spent_at at time zone $4))::int as "activeDays"
       from expenses e where ${where}`,
      args,
    ),
    query(
      `select coalesce(sum(e.amount), 0)::float8 as total, count(*)::int as count
       from expenses e where e.deleted_at is null and e.spent_at >= $1 and e.spent_at < $2
         and ($3::uuid is null or e.category_id = $3)`,
      [prevFrom, p.from, p.category ?? null],
    ),
  ]);

  return { daily, byCategory, byPayer, byConsumer, byWeekday, top, totals: totals[0], previous: previous[0] };
}
