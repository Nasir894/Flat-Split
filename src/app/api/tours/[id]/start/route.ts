import { route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { startTour } from "@/lib/server/tours";

type Ctx = RouteContext<"/api/tours/[id]/start">;

// Tours start only when a home sharer starts them (planning alone doesn't).
export const POST = route<Ctx>(async (_req, ctx) => startTour(await requireMember(), (await ctx.params).id));