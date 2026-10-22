import { route } from "@/lib/server/http";
import { requireMember, requireSession } from "@/lib/server/auth";
import { deleteTour, getTour, updateTour } from "@/lib/server/tours";

type Ctx = RouteContext<"/api/tours/[id]">;

export const GET = route<Ctx>(async (_req, ctx) => getTour(await requireSession(), (await ctx.params).id));
export const PATCH = route<Ctx>(async (req, ctx) => updateTour(await requireMember(), (await ctx.params).id, await req.json()));
export const DELETE = route<Ctx>(async (_req, ctx) => deleteTour(await requireMember(), (await ctx.params).id));