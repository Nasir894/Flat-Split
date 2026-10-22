import { z } from "zod";
import { withTx } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { checkPin, pinSchema, rotateRecoveryCode } from "@/lib/server/pin";

// Make a new recovery code (the old one stops working). Requires the current PIN.
export const POST = route(async (req) => {
  const userId = await requireUser();
  const { pin } = z.object({ pin: pinSchema }).parse(await req.json());
  await checkPin(userId, pin);
  return { recoveryCode: await withTx((q) => rotateRecoveryCode(q, userId)) };
});
