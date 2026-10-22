import { route } from "@/lib/server/http";
import { requireSession } from "@/lib/server/auth";
import { exportTours } from "@/lib/server/tours";

// Everyone can download the archive of the tours they can see.
export const GET = route(async () => exportTours(await requireSession()));