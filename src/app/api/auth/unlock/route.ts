import { z } from "zod";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { checkPin, pinSchema } from "@/lib/server/pin";

// Re-checks the signed-in member's PIN when the app is reopened (app lock).
export const POST = route(async (req) => {
  const userId = await requireUser();
  const { pin } = z.object({ pin: pinSchema }).parse(await req.json());
  await checkPin(userId, pin);
  return { ok: true };
});
