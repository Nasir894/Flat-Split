import { z } from "zod";
import { query, withTx } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { houseCodeSchema } from "@/lib/server/pin";
import { audit, userName } from "@/lib/server/audit";

// Joined members can see the house code (to share it) and change it. Changes are logged.
export const GET = route(async () => {
  await requireUser();
  const [row] = await query(
    `select s.value as code, s.updated_at as "updatedAt", u.name as "updatedBy"
     from settings s left join users u on u.id = s.updated_by where s.key = 'house_code'`,
  );
  return row ?? { code: null, updatedAt: null, updatedBy: null };
});

export const POST = route(async (req) => {
  const actorId = await requireUser();
  const { code } = z.object({ code: houseCodeSchema }).parse(await req.json());
  return withTx(async (q) => {
    await q(
      `insert into settings (key, value, updated_by) values ('house_code', $1, $2)
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
      [code, actorId],
    );
    const actorName = await userName(q, actorId);
    await audit(q, {
      entity: "house",
      entityId: null,
      action: "update",
      actorId,
      actorName,
      summary: `🔐 ${actorName} changed the house code`,
    });
    return { ok: true };
  });
});
