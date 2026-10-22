import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { formatTaka, settlePlan } from "@/lib/money";
import { query } from "./db";
import { env } from "./env";
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

// ---------- Telegram API ----------

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new HttpError(500, "Telegram is not set up: add TELEGRAM_BOT_TOKEN in Vercel → Settings → Environment Variables.");
  return token;
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) throw new HttpError(502, `Telegram: ${json.description ?? res.statusText}`);
  return json.result as T;
}

// Every digest carries this button, so anyone in the chat can pull a fresh one.
const UPDATE_BUTTON = { inline_keyboard: [[{ text: "🔄 Latest update", callback_data: "update" }]] };

export const sendDigestTo = async (chatId: string | number, text?: string) =>
  tg("sendMessage", {
    chat_id: chatId,
    text: text ?? (await dashboardDigest()),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: UPDATE_BUTTON,
  });

// ---------- house-wide Telegram settings (in the `settings` table) ----------

export type LinkedChat = { id: string; title: string };

async function getSetting(key: string) {
  const [row] = await query<{ value: string }>("select value from settings where key = $1", [key]);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string, actorId: string | null = null) {
  await query(
    `insert into settings (key, value, updated_by) values ($1, $2, $3)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [key, value, actorId],
  );
}

/** Chats linked from Telegram with /link, plus any fixed ones in TELEGRAM_CHAT_ID. */
export async function telegramChats(): Promise<LinkedChat[]> {
  const linked: LinkedChat[] = JSON.parse((await getSetting("telegram_chats")) ?? "[]");
  const fixed = (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...linked, ...fixed.filter((id) => !linked.some((c) => c.id === id)).map((id) => ({ id, title: "Set in environment" }))];
}

const isAllowedChat = async (chatId: string) => (await telegramChats()).some((c) => c.id === chatId);

export async function unlinkChat(chatId: string) {
  const linked: LinkedChat[] = JSON.parse((await getSetting("telegram_chats")) ?? "[]");
  await setSetting("telegram_chats", JSON.stringify(linked.filter((c) => c.id !== chatId)));
}

/** Daily send time as HH:MM in Bangladesh time. */
export const getDigestTime = async () => (await getSetting("telegram_time")) ?? "21:00";
export const setDigestTime = (time: string, actorId: string) => setSetting("telegram_time", time, actorId);

/** A one-time code (valid 15 minutes) that links a Telegram chat with "/link CODE". */
export async function newLinkCode(actorId: string) {
  const code = randomBytes(4).toString("hex").toUpperCase();
  await setSetting("telegram_link_code", `${code}|${Date.now() + 15 * 60_000}`, actorId);
  return code;
}

export async function telegramStatus() {
  const [time, lastSent, chats] = await Promise.all([getDigestTime(), getSetting("telegram_last_sent"), telegramChats()]);
  return { configured: !!process.env.TELEGRAM_BOT_TOKEN, time, lastSent, chats };
}

/** Sends the digest to every linked chat now. */
export async function sendDigestToAll() {
  const chats = await telegramChats();
  if (!chats.length) throw new HttpError(400, "No Telegram chat is linked yet. Tap “Link a group” first.");
  const text = await dashboardDigest();
  await Promise.all(chats.map((c) => sendDigestTo(c.id, text)));
  return chats.length;
}

/**
 * Called every few minutes by the scheduler: sends once a day, the first time it runs at or after the
 * chosen time. Claiming today's date first means overlapping runs can't double-send.
 */
export async function sendDigestIfDue() {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now); // YYYY-MM-DD
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  if (clock < (await getDigestTime())) return { sent: 0, reason: "not yet" };
  const claimed = await query(
    `insert into settings (key, value) values ('telegram_last_sent', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now() where settings.value <> excluded.value
     returning key`,
    [today],
  );
  if (!claimed.length) return { sent: 0, reason: "already sent today" };
  try {
    return { sent: await sendDigestToAll() };
  } catch (err) {
    // Let the next run try again.
    await query("update settings set value = 'failed' where key = 'telegram_last_sent'");
    throw err;
  }
}

// ---------- webhook: /link, /update and the "Latest update" button ----------

/** Secret Telegram echoes back on every webhook call, derived so no extra env var is needed. */
export const webhookSecret = () => createHmac("sha256", env("SESSION_SECRET")).update("telegram-webhook").digest("hex");

/** Points the bot at this deployment and registers its commands. Needs a public https URL. */
export async function registerWebhook(req: Request) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? new URL(req.url).host;
  if (/^(localhost|127\.|192\.168\.)/.test(host)) return;
  await tg("setWebhook", {
    url: `https://${host}/api/telegram/webhook`,
    secret_token: webhookSecret(),
    allowed_updates: ["message", "callback_query"],
  });
  await tg("setMyCommands", {
    commands: [
      { command: "update", description: "Latest Flat Split dashboard" },
      { command: "link", description: "Link this chat: /link CODE (code from Flat Split → Settings)" },
      { command: "unlink", description: "Stop daily updates in this chat" },
    ],
  });
}

type Update = {
  message?: { text?: string; chat: { id: number; type: string; title?: string; first_name?: string } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
};

export async function handleUpdate(u: Update) {
  if (u.callback_query) {
    const chatId = String(u.callback_query.message?.chat.id ?? "");
    const ok = u.callback_query.data === "update" && chatId && (await isAllowedChat(chatId));
    await tg("answerCallbackQuery", { callback_query_id: u.callback_query.id, text: ok ? "Fetching…" : "This chat isn't linked" }).catch(
      () => {}, // only stops the button's spinner; still send the update
    );
    if (ok) await sendDigestTo(chatId);
    return;
  }
  const msg = u.message;
  if (!msg?.text?.startsWith("/")) return;
  const chatId = String(msg.chat.id);
  const [cmd, arg] = msg.text.trim().split(/\s+/);
  const command = cmd.slice(1).split("@")[0].toLowerCase();
  const reply = (text: string) => tg("sendMessage", { chat_id: chatId, text });

  if (command === "link") {
    const [code, expires] = ((await getSetting("telegram_link_code")) ?? "").split("|");
    if (!arg || !code || arg.toUpperCase() !== code || Date.now() > Number(expires)) {
      return reply("That code didn't work. Get a fresh one in Flat Split → Settings → Telegram → Link a group.");
    }
    await query("delete from settings where key = 'telegram_link_code'"); // one use only
    const linked: LinkedChat[] = JSON.parse((await getSetting("telegram_chats")) ?? "[]");
    const title = msg.chat.title ?? msg.chat.first_name ?? "Chat";
    await setSetting("telegram_chats", JSON.stringify([...linked.filter((c) => c.id !== chatId), { id: chatId, title }]));
    await reply(`✅ Linked! This chat now gets the Flat Split dashboard every day at ${await getDigestTime()} (Bangladesh time).`);
    return sendDigestTo(chatId);
  }
  if (!(await isAllowedChat(chatId))) {
    return reply("Hi! To get Flat Split updates here, open Flat Split → Settings → Telegram → Link a group, then send the /link command it shows.");
  }
  if (command === "update" || command === "start") return sendDigestTo(chatId);
  if (command === "unlink") {
    await unlinkChat(chatId);
    return reply("Unlinked. This chat won't get Flat Split updates any more.");
  }
}
