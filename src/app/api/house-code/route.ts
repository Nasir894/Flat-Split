import { z } from "zod";
import { currentHouse, query, withTx } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { houseByCode, houseCodeSchema } from "@/lib/server/pin";
import { audit, userName } from "@/lib/server/audit";

// Joined members can see their house code (to share it) and change it. Changes are logged.
export const GET = route(async () => {
  await requireMember();
  const [row] = await query(
    `select h.code, h.updated_at as "updatedAt", u.name as "updatedBy"
     from houses h left join users u on u.id = h.updated_by`,
  );
  return row ?? { code: null, updatedAt: null, updatedBy: null };
});

export const POST = route(async (req) => {
  const actorId = await requireMember();
  const { code } = z.object({ code: houseCodeSchema }).parse(await req.json());
  // Codes are unique across houses (a code is how people find a house to join).
  const owner = await houseByCode(code);
  if (owner && owner !== currentHouse()) throw new HttpError(409, "That code is already used by another house. Pick a different one.");
  return withTx(async (q) => {
    await q("update houses set code = $1, updated_by = $2, updated_at = now()", [code, actorId]);
    const actorName = await userName(q, actorId);
    await audit(q, {
      entity: "house",
      entityId: null,
      action: "update",
      actorId,
      actorName,
      title: `🔐 ${actorName} changed the house code`,
      summary: `🔐 ${actorName} changed the house code`,
    });
    return { ok: true };
  });
});
