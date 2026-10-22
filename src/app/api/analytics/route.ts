import { route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { getAnalytics } from "@/lib/server/analytics";

export const GET = route(async (req) => {
  await requireMember();
  return getAnalytics(new URL(req.url));
});
