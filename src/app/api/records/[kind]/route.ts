import { route } from "@/lib/server/http";
import { requireSession } from "@/lib/server/auth";
import { createRecord, kindOf, listRecords } from "@/lib/server/records";

type Ctx = RouteContext<"/api/records/[kind]">;

export const GET = route<Ctx>(async (req, ctx) => {
  const actor = await requireSession();
  return listRecords(kindOf((await ctx.params).kind), new URL(req.url), actor);
});

export const POST = route<Ctx>(async (req, ctx) => {
  const actor = await requireSession();
  return createRecord(kindOf((await ctx.params).kind), actor, await req.json());
});
