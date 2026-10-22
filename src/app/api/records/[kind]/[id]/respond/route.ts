import { HttpError, route } from "@/lib/server/http";
import { requireSession } from "@/lib/server/auth";
import { kindOf, respondTransfer } from "@/lib/server/records";

type Ctx = RouteContext<"/api/records/[kind]/[id]/respond">;

// The receiver approves or declines a transfer; only approved transfers change balances.
export const POST = route<Ctx>(async (req, ctx) => {
  const actor = await requireSession();
  const { kind, id } = await ctx.params;
  if (kindOf(kind) !== "transfer") throw new HttpError(404, "Not found");
  return respondTransfer(actor, id, await req.json());
});
