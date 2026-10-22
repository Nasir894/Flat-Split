import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { kindOf, setDeleted, updateRecord } from "@/lib/server/records";

type Ctx = RouteContext<"/api/records/[kind]/[id]">;

export const PATCH = route<Ctx>(async (req, ctx) => {
  const userId = await requireUser();
  const { kind, id } = await ctx.params;
  return updateRecord(kindOf(kind), userId, id, await req.json());
});

// Soft delete: the row stays (greyed out in the UI) and the change is audited.
export const DELETE = route<Ctx>(async (req, ctx) => {
  const userId = await requireUser();
  const { kind, id } = await ctx.params;
  return setDeleted(kindOf(kind), userId, id, await req.json(), true);
});
