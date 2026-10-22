import { route } from "@/lib/server/http";
import { requireMember, requireSession } from "@/lib/server/auth";
import { createTour, listTours } from "@/lib/server/tours";

// Tours visible to me (guests: only their own).
export const GET = route(async () => listTours(await requireSession()));

// Planning a tour (home sharers). It stays "planned" until someone starts it.
export const POST = route(async (req) => createTour(await requireMember(), await req.json()));