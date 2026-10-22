import { query } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { pendingUserId, sessionUserId, setSignedInHint } from "@/lib/server/auth";

// Data for the sign-in screen. Member names are deliberately NOT listed here: anyone can open
// this page, so it only says whether a house exists, who is signed in on this device, and this
// device's own pending join request (if any).
export const GET = route(async () => {
  const [[{ active }], me, pendingId] = await Promise.all([
    query<{ active: number }>("select count(*)::int as active from users where status = 'active'"),
    sessionUserId(),
    pendingUserId(),
  ]);
  if (me) await setSignedInHint();
  let pending: { id: string; name: string } | null = null;
  if (pendingId) {
    const [p] = await query<{ id: string; name: string }>("select id, name from users where id = $1", [pendingId]);
    if (p) pending = p;
  }
  return { meId: me, houseExists: active > 0, pending };
});
