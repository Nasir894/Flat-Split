import { route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { createTracker } from "@/lib/server/trackers";

// Any member can start a new turn tracker (gas cylinder, trash, cleaning…).
export const POST = route(async (req) => createTracker(await requireMember(), await req.json()));
