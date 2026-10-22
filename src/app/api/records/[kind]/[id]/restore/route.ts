import { route } from "@/lib/server/http";
import { requireSession } from "@/lib/server/auth";
import { kindOf, setDeleted } from "@/lib/server/records";

type Ctx = RouteContext<"/api/records/[kind]/[id]/restore">;

export const POST = route<Ctx>(async (req, ctx) => {
  const actor = await requireSession();
  const { kind, id } = await ctx.params;
  return setDeleted(kindOf(kind), actor, id, await req.json(), false);
});
