import { query } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { issueWidgetToken, requireSession, widgetUser } from "@/lib/server/auth";
import { widgetData } from "@/lib/server/widget";

// For the companion phone app's home-screen widgets.

// Signed in (inside the app's web view): get a read-only key the widgets can use on their own.
export const POST = route(async () => {
  const me = await requireSession();
  if (me.role !== "member") throw new HttpError(403, "The widgets are for home sharers");
  return { token: await issueWidgetToken(me.id, me.houseId) };
});

// With that key: what the widgets show for this person.
export const GET = route(async (req) => {
  const userId = await widgetUser(req);
  const [me] = await query<{ status: string; role: "member" | "guest" }>("select status, role from users where id = $1", [userId]);
  if (!me || me.status !== "active") throw new HttpError(401, "This member is no longer in the house");
  return widgetData({ id: userId, role: me.role });
});
