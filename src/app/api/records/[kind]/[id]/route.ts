import { route } from "@/lib/server/http";
import { requireSession } from "@/lib/server/auth";
import { kindOf, setDeleted, updateRecord } from "@/lib/server/records";

type Ctx = RouteContext<"/api/records/[kind]/[id]">;

export const PATCH = route<Ctx>(async (req, ctx) => {
  const actor = await requireSession();
  const { kind, id } = await ctx.params;
  return updateRecord(kindOf(kind), actor, id, await req.json());
});

// Soft delete: the row stays (greyed out in the UI) and the change is audited.
export const DELETE = route<Ctx>(async (req, ctx) => {
  const actor = await requireSession();
  const { kind, id } = await ctx.params;
  return setDeleted(kindOf(kind), actor, id, await req.json(), true);
});
