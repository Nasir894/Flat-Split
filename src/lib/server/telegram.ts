import "server-only";
import { formatTaka, settlePlan } from "@/lib/money";
import { query } from "./db";
import { HttpError } from "./http";
import { getSummary } from "./summary";

const TZ = "Asia/Dhaka";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The home dashboard as a Telegram message (HTML): balances, settle-up, turns, spending, approvals, tours. */
export async function dashboardDigest(): Promise<string> {
  const [first] = await query<{ id: string }>(
    "select id from users where status = 'active' and role = 'member' order by created_at limit 1",
  );
  if (!first) return "🏠 <b>Flat Split</b>\nNo home sharers yet.";
  // The house-wide parts of the summary are the same for every home sharer; any one will do.
  const data = await getSummary({ id: first.id, role: "member" });
  const name = (id: string) => esc(data.users.find((u) => u.id === id)?.name ?? data.guests.find((u) => u.id === id)?.name ?? "Someone");

  const [[spend], pending] = await Promise.all([
    query<{ today: number; todayCount: number; month: number }>(
      `select coalesce(sum(amount) filter (where (spent_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date), 0)::float8 as today,
              count(*) filter (where (spent_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date)::int as "todayCount",
              coalesce(sum(amount), 0)::float8 as month
       from expenses
       where deleted_at is null and tour_id is null
         and date_trunc('month', spent_at at time zone '${TZ}') = date_trunc('month', now() at time zone '${TZ}')`,
    ),
    query<{ fromUserId: string; toUserId: string; amount: number }>(
      `select from_user_id as "fromUserId", to_user_id as "toUserId", amount::float8 as amount
       from transfers where deleted_at is null and status = 'pending' order by sent_at`,
    ),
  ]);

  const date = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date());
  const lines = [`🏠 <b>Flat Split · ${date}</b>`];

  const balances = [...data.balances].sort((a, b) => b.balance - a.balance);
  lines.push("", "<b>Balances</b>");
  for (const b of balances) {
    const dot = b.balance > 0 ? "🟢" : b.balance < 0 ? "🔴" : "⚪";
    lines.push(`${dot} ${name(b.id)}  ${formatTaka(b.balance, { sign: true })}`);
  }

  // Same plan as the dashboard: pending guest settlements from closed tours count as paid.
  const plan = settlePlan(data.balances.map((b) => ({ id: b.id, balance: b.planBalance ?? b.balance })));
  lines.push("", "<b>Settle up</b>");
  if (plan.length) for (const p of plan) lines.push(`${name(p.from)} → ${name(p.to)}  ${formatTaka(p.amount)}`);
  else lines.push("Everyone is settled ✅");

  if (data.trackers.length) {
    lines.push("", "<b>Turns</b>");
    for (const t of data.trackers) {
      const due = t.memberIds.filter((id) => (t.status.members[id]?.owed ?? 0) > 0);
      lines.push(`${t.emoji} ${esc(t.name)}: ${due.length ? due.map(name).join(", ") : "all caught up"}`);
    }
  }

  lines.push(
    "",
    "<b>Home spending</b>",
    `Today: ${formatTaka(spend.today)} · ${spend.todayCount} expense${spend.todayCount === 1 ? "" : "s"}`,
    `This month: ${formatTaka(spend.month)}`,
  );

  if (pending.length) {
    lines.push("", `<b>Waiting for approval (${pending.length})</b>`);
    for (const t of pending) lines.push(`${name(t.fromUserId)} → ${name(t.toUserId)}  ${formatTaka(t.amount)}`);
  }

  const tours = data.tours.filter((t) => t.status === "active" || t.status === "planned");
  if (tours.length) {
    lines.push("", "<b>Tours</b>");
    for (const t of tours) {
      lines.push(`${t.emoji} ${esc(t.name)}: ${t.status === "active" ? `ongoing · spent ${formatTaka(t.spent)}` : "planned"}`);
    }
  }

  const url = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (url) lines.push("", `<a href="https://${url}">Open Flat Split</a>`);
  return lines.join("\n");
}

/** Sends an HTML message to every chat in TELEGRAM_CHAT_ID (comma-separated: you, the flat's group, …). */
export async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || !chats.length) {
    throw new HttpError(500, "Telegram is not set up: add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to the environment.");
  }
  await Promise.all(
    chats.map(async (chat_id) => {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      });
      if (!res.ok) throw new HttpError(502, `Telegram refused the message for chat ${chat_id}: ${(await res.text()).slice(0, 200)}`);
    }),
  );
  return chats.length;
}
