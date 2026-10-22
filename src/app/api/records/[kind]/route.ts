import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { createRecord, kindOf, listRecords } from "@/lib/server/records";

type Ctx = RouteContext<"/api/records/[kind]">;

export const GET = route<Ctx>(async (req, ctx) => {
  await requireUser();
  return listRecords(kindOf((await ctx.params).kind), new URL(req.url));
});

export const POST = route<Ctx>(async (req, ctx) => {
  const userId = await requireUser();
  return createRecord(kindOf((await ctx.params).kind), userId, await req.json());
});
