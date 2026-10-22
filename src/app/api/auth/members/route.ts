import { query } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { pendingUserId, sessionUserId, setSignedInHint } from "@/lib/server/auth";

// Data for the sign-in screen: joined members (names + colors), whether a house exists yet,
// who is signed in on this device, and this device's own pending join request (if any).
export const GET = route(async () => {
  const [members, me, pendingId] = await Promise.all([
    query(
      `select id, name, color, (pin_hash is null) as "needsPin",
              coalesce(reset_expires_at > now(), false) as "resetApproved"
       from users where status = 'active' order by created_at`,
    ),
    sessionUserId(),
    pendingUserId(),
  ]);
  if (me) await setSignedInHint();
  let pending: { id: string; name: string } | null = null;
  if (pendingId) {
    const [p] = await query<{ id: string; name: string; status: string }>("select id, name, status from users where id = $1", [pendingId]);
    if (p) pending = { id: p.id, name: p.name };
  }
  return { members, meId: me, houseExists: members.length > 0, pending };
});
