import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { deleteTracker, updateTracker } from "@/lib/server/trackers";

type Ctx = RouteContext<"/api/trackers/[id]">;

export const PATCH = route<Ctx>(async (req, ctx) =>
  updateTracker(await requireUser(), (await ctx.params).id, await req.json()),
);

export const DELETE = route<Ctx>(async (_req, ctx) => deleteTracker(await requireUser(), (await ctx.params).id));
