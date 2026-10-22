import { z } from "zod";
import { query } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { hashPin, requireUser } from "@/lib/server/auth";
import { checkPin, pinSchema } from "@/lib/server/pin";

const body = z.object({ currentPin: pinSchema, newPin: pinSchema });

export const POST = route(async (req) => {
  const userId = await requireUser();
  const d = body.parse(await req.json());
  await checkPin(userId, d.currentPin);
  await query("update users set pin_hash = $2 where id = $1", [userId, await hashPin(d.newPin)]);
  return { ok: true };
});
