import "server-only";
import { settlePlan } from "@/lib/money";
import { query } from "./db";
import { IN_HOME_FUND } from "./balances";
import { getSummary } from "./summary";
import type { Role } from "./auth";

const TZ = "Asia/Dhaka";

export type WidgetData = Awaited<ReturnType<typeof widgetData>>;

/** Everything the phone's home-screen widgets show, for one member. Amounts in poisha. */
export async function widgetData(me: { id: string; role: Role }) {
  const data = await getSummary(me);
  const name = (id: string) => data.users.find((u) => u.id === id)?.name ?? data.guests.find((u) => u.id === id)?.name ?? "Someone";

  const [series, month] = await Promise.all([balanceSeries(me.id), monthSpending()]);
  const balance = data.balances.find((b) => b.id === me.id)?.balance ?? 0;
  const plan = settlePlan(data.balances.map((b) => ({ id: b.id, balance: b.planBalance ?? b.balance })));

  return {
    name: name(me.id),
    balance,
    // Daily closing balance for the last 30 days (Bangladesh time), oldest first.
    series,
    month,
    turns: data.trackers.map((t) => {
      const due = t.memberIds.filter((id) => (t.status.members[id]?.owed ?? 0) > 0);
      return { emoji: t.emoji, name: t.name, due: due.map(name), mine: due.includes(me.id) };
    }),
    settle: plan.slice(0, 3).map((p) => ({ from: name(p.from), to: name(p.to), amount: p.amount, mine: p.from === me.id || p.to === me.id })),
    settleCount: plan.length,
    // Payments waiting for my OK, plus join requests anyone can answer.
    waiting: data.awaitingMe.length + data.pending.length,
    updatedAt: new Date().toISOString(),
  };
}

/** Closing balance per day for the last 30 days, using the same home-fund rules as the app. */
async function balanceSeries(userId: string) {
  const rows = await query<{ day: string; balance: number }>(
    `with ev as (
       select (e.spent_at at time zone '${TZ}')::date d, e.amount::bigint v from expenses e
         where e.payer_id = $1 and e.deleted_at is null and ${IN_HOME_FUND("e")}
       union all
       select (e.spent_at at time zone '${TZ}')::date, -s.amount::bigint from expense_shares s join expenses e on e.id = s.expense_id
         where s.user_id = $1 and e.deleted_at is null and ${IN_HOME_FUND("e")}
       union all
       select (t.sent_at at time zone '${TZ}')::date, case when t.from_user_id = $1 then t.amount else -t.amount end::bigint
         from transfers t where (t.from_user_id = $1 or t.to_user_id = $1) and t.deleted_at is null and t.status = 'approved'
           and ${IN_HOME_FUND("t")}
     ),
     days as (select generate_series((now() at time zone '${TZ}')::date - 29, (now() at time zone '${TZ}')::date, '1 day')::date d)
     select to_char(days.d, 'YYYY-MM-DD') as day, (select coalesce(sum(v), 0) from ev where ev.d <= days.d)::float8 as balance
     from days order by days.d`,
    [userId],
  );
  return rows;
}

/** Home spending this month by day, and last month's total up to the same day for comparison. */
async function monthSpending() {
  const [rows, [cmp]] = await Promise.all([
    query<{ day: number; total: number }>(
      `select extract(day from (spent_at at time zone '${TZ}'))::int as day, sum(amount)::float8 as total
       from expenses where deleted_at is null and tour_id is null
         and date_trunc('month', spent_at at time zone '${TZ}') = date_trunc('month', now() at time zone '${TZ}')
       group by 1 order by 1`,
    ),
    query<{ last_same: number; last_total: number; today: number; days: number; label: string }>(
      `select coalesce(sum(amount) filter (where extract(day from (spent_at at time zone '${TZ}')) <= extract(day from (now() at time zone '${TZ}'))), 0)::float8 as last_same,
              coalesce(sum(amount), 0)::float8 as last_total,
              extract(day from (now() at time zone '${TZ}'))::int as today,
              extract(day from date_trunc('month', now() at time zone '${TZ}') + interval '1 month - 1 day')::int as days,
              to_char(now() at time zone '${TZ}', 'FMMonth') as label
       from expenses where deleted_at is null and tour_id is null
         and date_trunc('month', spent_at at time zone '${TZ}') = date_trunc('month', now() at time zone '${TZ}') - interval '1 month'`,
    ),
  ]);
  const byDay = Array.from({ length: cmp.days }, (_, i) => rows.find((r) => r.day === i + 1)?.total ?? 0);
  return {
    label: cmp.label,
    total: byDay.reduce((s, v) => s + v, 0),
    byDay,
    today: cmp.today,
    lastMonthSameDay: cmp.last_same,
    lastMonthTotal: cmp.last_total,
  };
}
