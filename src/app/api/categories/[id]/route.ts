import { withTx } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { audit, userName } from "@/lib/server/audit";

type Ctx = RouteContext<"/api/categories/[id]">;

const COLS = `id, name, emoji, is_default as "isDefault", deleted_at as "deletedAt"`;

/** DELETE hides the category (existing expenses keep it); POST brings it back. */
async function toggle(userId: string, id: string, deleted: boolean) {
  return withTx(async (q) => {
    const [before] = await q(`select ${COLS} from categories where id = $1 for update`, [id]);
    if (!before) throw new HttpError(404, "Not found");
    const [after] = await q(
      `update categories set deleted_at = ${deleted ? "now()" : "null"}, deleted_by = ${deleted ? "$2" : "null"}
       where id = $1 ${deleted ? "" : "and $2::uuid is not null"} returning ${COLS}`,
      [id, userId],
    );
    await audit(q, {
      entity: "category",
      entityId: id,
      action: deleted ? "delete" : "restore",
      actorId: userId,
      actorName: await userName(q, userId),
      summary: `Category ${after.emoji} ${after.name}`,
      before,
      after,
    });
    return after;
  });
}

export const DELETE = route<Ctx>(async (_req, ctx) => toggle(await requireMember(), (await ctx.params).id, true));
export const POST = route<Ctx>(async (_req, ctx) => toggle(await requireMember(), (await ctx.params).id, false));
