import { route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { exportBackup, importBackup } from "@/lib/server/backup";

export const GET = route(async () => {
  await requireMember();
  return exportBackup();
});

export const POST = route(async (req) => {
  const userId = await requireMember();
  return importBackup(userId, await req.json());
});
