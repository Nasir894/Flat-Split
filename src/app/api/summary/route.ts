import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { getSummary } from "@/lib/server/summary";

export const GET = route(async () => getSummary(await requireUser()));
