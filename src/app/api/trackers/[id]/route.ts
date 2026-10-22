import { route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { deleteTracker, updateTracker } from "@/lib/server/trackers";

type Ctx = RouteContext<"/api/trackers/[id]">;

export const PATCH = route<Ctx>(async (req, ctx) =>
  updateTracker(await requireMember(), (await ctx.params).id, await req.json()),
);

export const DELETE = route<Ctx>(async (_req, ctx) => deleteTracker(await requireMember(), (await ctx.params).id));
