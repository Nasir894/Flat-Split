import { z } from "zod";
import { route } from "@/lib/server/http";
import { startSession } from "@/lib/server/auth";
import { checkPin, pinSchema } from "@/lib/server/pin";
import { memberIdByName } from "@/lib/server/members";

const body = z.object({
  name: z.string().trim().min(1, "Enter your name").max(40),
  pin: pinSchema,
  // Only needed when the same name exists in more than one house.
  houseCode: z.string().max(40).optional(),
});

export const POST = route(async (req) => {
  const d = body.parse(await req.json());
  const userId = await memberIdByName(req, d.name, d.houseCode);
  await checkPin(userId, d.pin);
  await startSession(userId);
  return { id: userId };
});
