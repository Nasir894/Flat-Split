import { route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { decideJoin } from "@/lib/server/members";

type Ctx = RouteContext<"/api/members/[id]/join">;

export const POST = route<Ctx>(async (req, ctx) => decideJoin(await requireMember(), (await ctx.params).id, await req.json()));
