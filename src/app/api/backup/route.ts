import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { exportBackup, importBackup } from "@/lib/server/backup";

export const GET = route(async () => {
  await requireUser();
  return exportBackup();
});

export const POST = route(async (req) => {
  const userId = await requireUser();
  return importBackup(userId, await req.json());
});
