import { query } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { sessionUserId } from "@/lib/server/auth";

// Names + colors for the login picker, plus who (if anyone) is signed in on this device.
export const GET = route(async () => {
  const [members, me] = await Promise.all([
    query(`select id, name, color, (pin_hash is null) as "needsPin", coalesce(reset_expires_at > now(), false) as "resetApproved" from users order by created_at`),
    sessionUserId(),
  ]);
  return { members, meId: me };
});
