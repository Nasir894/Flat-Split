import { z } from "zod";
import { route } from "@/lib/server/http";
import { startSession } from "@/lib/server/auth";
import { checkPin, pinSchema } from "@/lib/server/pin";

const body = z.object({ userId: z.uuid(), pin: pinSchema });

export const POST = route(async (req) => {
  const d = body.parse(await req.json());
  await checkPin(d.userId, d.pin);
  await startSession(d.userId);
  return { id: d.userId };
});
