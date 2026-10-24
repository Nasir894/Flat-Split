import { query } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { issueWidgetToken, requireSession, widgetUser } from "@/lib/server/auth";
import { homeBalances } from "@/lib/server/balances";

// For the companion phone app's home-screen widget.

// Signed in (inside the app's web view): get a read-only key the widget can use on its own.
export const POST = route(async () => {
  const me = await requireSession();
  if (me.role !== "member") throw new HttpError(403, "The balance widget is for home sharers");
  return { token: await issueWidgetToken(me.id, me.houseId) };
});

// With that key: just this person's home balance.
export const GET = route(async (req) => {
  const userId = await widgetUser(req);
  const [[me], balances] = await Promise.all([
    query<{ name: string; status: string }>("select name, status from users where id = $1", [userId]),
    homeBalances(),
  ]);
  if (!me || me.status !== "active") throw new HttpError(401, "This member is no longer in the house");
  const balance = balances.find((b) => b.id === userId)?.balance ?? 0;
  return { name: me.name, balance, updatedAt: new Date().toISOString() };
});
