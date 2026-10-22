import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { kindOf, setDeleted } from "@/lib/server/records";

type Ctx = RouteContext<"/api/records/[kind]/[id]/restore">;

export const POST = route<Ctx>(async (req, ctx) => {
  const userId = await requireUser();
  const { kind, id } = await ctx.params;
  return setDeleted(kindOf(kind), userId, id, await req.json(), false);
});
