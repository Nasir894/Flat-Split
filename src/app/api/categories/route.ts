import { z } from "zod";
import { withTx } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { audit, userName } from "@/lib/server/audit";

const body = z.object({
  name: z.string().trim().min(1, "Enter a name").max(30),
  emoji: z.string().trim().max(8).default("🏷️"),
});

export const POST = route(async (req) => {
  const userId = await requireMember();
  const d = body.parse(await req.json());
  return withTx(async (q) => {
    const [dupe] = await q("select 1 from categories where lower(name) = lower($1) and deleted_at is null", [d.name]);
    if (dupe) throw new HttpError(409, "That category already exists");
    const [c] = await q(
      `insert into categories (name, emoji, created_by) values ($1, $2, $3)
       returning id, name, emoji, is_default as "isDefault", deleted_at as "deletedAt"`,
      [d.name, d.emoji || "🏷️", userId],
    );
    await audit(q, {
      entity: "category",
      entityId: c.id,
      action: "create",
      actorId: userId,
      actorName: await userName(q, userId),
      summary: `New category ${c.emoji} ${c.name}`,
      after: c,
    });
    return c;
  });
});
