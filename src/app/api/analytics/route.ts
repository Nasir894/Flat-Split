import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { getAnalytics } from "@/lib/server/analytics";

export const GET = route(async (req) => {
  await requireUser();
  return getAnalytics(new URL(req.url));
});
