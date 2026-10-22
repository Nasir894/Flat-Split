import "server-only";
import { z } from "zod";
import { query } from "./db";

export const TZ = "Asia/Dhaka";

const params = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  category: z.uuid().nullish(),
});

/** Spending aggregates for [from, to). Only non-deleted expenses count. */
export async function getAnalytics(url: URL) {
  const p = params.parse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    category: url.searchParams.get("category") || null,
  });
  const args = [p.from, p.to, p.category ?? null, TZ];
  const base = `from expenses e where e.deleted_at is null and e.spent_at >= $1 and e.spent_at < $2
                and ($3::uuid is null or e.category_id = $3)`;

  const [daily, byCategory, byPayer, byConsumer, totals] = await Promise.all([
    query(
      `select to_char(date_trunc('day', e.spent_at at time zone $4), 'YYYY-MM-DD') as day,
              sum(e.amount)::float8 as total
       ${base} group by 1 order by 1`,
      args,
    ),
    query(
      `select e.category_id as "categoryId", sum(e.amount)::float8 as total, count(*)::int as count
       ${base} and $4::text is not null group by 1 order by 2 desc`,
      args,
    ),
    query(
      `select e.payer_id as "userId", sum(e.amount)::float8 as total
       ${base} and $4::text is not null group by 1 order by 2 desc`,
      args,
    ),
    query(
      `select s.user_id as "userId", sum(s.amount)::float8 as total
       from expense_shares s join expenses e on e.id = s.expense_id
       where e.deleted_at is null and e.spent_at >= $1 and e.spent_at < $2
         and ($3::uuid is null or e.category_id = $3) and $4::text is not null
       group by 1 order by 2 desc`,
      args,
    ),
    query(
      `select coalesce(sum(e.amount),0)::float8 as total, count(*)::int as count,
              coalesce(max(e.amount),0)::float8 as largest
       ${base} and $4::text is not null`,
      args,
    ),
  ]);

  return { daily, byCategory, byPayer, byConsumer, totals: totals[0] };
}
