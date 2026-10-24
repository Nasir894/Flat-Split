import { query } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { MESSAGE_COLS, postChatMessage } from "@/lib/server/chat";


/**
 * Messages, oldest → newest.
 *  - no params: latest 50
 *  - ?before=<id>: older page
 *  - ?after=<id>&since=<iso>: polling — new messages, messages whose reactions/deletion changed
 *    since the last poll, and who is typing right now.
 */
export const GET = route(async (req) => {
  const me = await requireMember();
  const url = new URL(req.url);
  const afterId = Number(url.searchParams.get("after")) || null;
  const beforeId = Number(url.searchParams.get("before")) || null;
  const since = url.searchParams.get("since");

  if (afterId) {
    const sinceIso = since && !Number.isNaN(Date.parse(since)) ? since : new Date(Date.now() - 10_000).toISOString();
    const [items, changed, typing, [{ now }]] = await Promise.all([
      query(`select ${MESSAGE_COLS} from chat_messages m where m.id > $1 order by m.id limit 200`, [afterId]),
      query(`select ${MESSAGE_COLS} from chat_messages m where m.id <= $1 and m.updated_at > $2 order by m.id`, [afterId, sinceIso]),
      query<{ userId: string }>(
        `select user_id as "userId" from chat_typing where at > now() - interval '6 seconds' and user_id <> $1`,
        [me],
      ),
      query<{ now: string }>("select now() as now"),
    ]);
    return { items, changed, typing: typing.map((t) => t.userId), now };
  }

  const rows = await query(
    `select ${MESSAGE_COLS} from chat_messages m where ($1::int is null or m.id < $1) order by m.id desc limit 51`,
    [beforeId],
  );
  const [{ now }] = await query<{ now: string }>("select now() as now");
  return { items: rows.slice(0, 50).reverse(), hasMore: rows.length > 50, now };
});

export const POST = route(async (req) => postChatMessage(await requireMember(), await req.json()));
