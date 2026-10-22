import { route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { closeTour } from "@/lib/server/tours";

type Ctx = RouteContext<"/api/tours/[id]/close">;

// Only home sharers can close a tour; this creates the guest settlement payments.
export const POST = route<Ctx>(async (_req, ctx) => closeTour(await requireMember(), (await ctx.params).id));