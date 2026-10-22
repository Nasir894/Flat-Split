import { route } from "@/lib/server/http";
import { requireSession } from "@/lib/server/auth";
import { getSummary } from "@/lib/server/summary";

export const GET = route(async () => getSummary(await requireSession()));