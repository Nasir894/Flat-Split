import { query } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";

// Called (throttled) while someone types; others see "… is typing" for ~6 seconds after.
export const POST = route(async () => {
  const userId = await requireUser();
  await query(
    `insert into chat_typing (user_id, at) values ($1, now()) on conflict (user_id) do update set at = now()`,
    [userId],
  );
  return { ok: true };
});

// Stopped typing (cleared the box).
export const DELETE = route(async () => {
  const userId = await requireUser();
  await query("delete from chat_typing where user_id = $1", [userId]);
  return { ok: true };
});
