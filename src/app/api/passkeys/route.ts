import { z } from "zod";
import { query } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";

// My devices with fingerprint/face sign-in.
export const GET = route(async () => {
  const userId = await requireUser();
  return query(
    `select id, device, created_at as "createdAt", last_used_at as "lastUsedAt"
     from passkeys where user_id = $1 order by created_at`,
    [userId],
  );
});

// Turn it off for one device (only my own).
export const DELETE = route(async (req) => {
  const userId = await requireUser();
  const { id } = z.object({ id: z.string().min(1) }).parse(await req.json());
  await query("delete from passkeys where id = $1 and user_id = $2", [id, userId]);
  return { ok: true };
});
