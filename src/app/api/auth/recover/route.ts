import { z } from "zod";
import { query, withTx } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { hashPin, startSession, verifyPin } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import {
  assertNotLimited,
  clientKey,
  guardHouseCode,
  normalizeRecoveryCode,
  pinSchema,
  recordFailure,
  rotateRecoveryCode,
} from "@/lib/server/pin";

const body = z.object({
  userId: z.uuid(),
  newPin: pinSchema,
  recoveryCode: z.string().optional(),
  houseCode: z.string().optional(),
});

// Forgot PIN: either the member's recovery code, or a reset another flatmate approved (+ house code).
export const POST = route(async (req) => {
  const d = body.parse(await req.json());
  const limitKey = `recover:${d.userId}:${clientKey(req)}`;
  await assertNotLimited(limitKey, 5);

  const [u] = await query<{
    name: string;
    recovery_hash: string | null;
    reset_approved_by: string | null;
    reset_expires_at: Date | null;
    approver: string | null;
    status: string;
  }>(
    `select u.name, u.status, u.recovery_hash, u.reset_approved_by, u.reset_expires_at, a.name as approver
     from users u left join users a on a.id = u.reset_approved_by where u.id = $1`,
    [d.userId],
  );
  if (!u) throw new HttpError(404, "Unknown member");
  if (u.status !== "active") throw new HttpError(403, "This join request is still waiting for approval.");

  let method: string;
  if (d.recoveryCode) {
    const ok = await verifyPin(normalizeRecoveryCode(d.recoveryCode), u.recovery_hash);
    if (!ok) {
      await recordFailure(limitKey);
      throw new HttpError(401, "That recovery code is not correct");
    }
    method = "with their recovery code";
  } else {
    const approved = u.reset_approved_by && u.reset_expires_at && new Date(u.reset_expires_at) > new Date();
    if (!approved) throw new HttpError(403, "Enter your recovery code, or ask a flatmate to approve a PIN reset.");
    await guardHouseCode(req, d.houseCode ?? "");
    method = `approved by ${u.approver}`;
  }

  const pinHash = await hashPin(d.newPin);
  const recoveryCode = await withTx(async (q) => {
    await q(
      `update users set pin_hash = $2, failed_attempts = 0, locked_until = null,
         reset_approved_by = null, reset_expires_at = null where id = $1`,
      [d.userId, pinHash],
    );
    await audit(q, {
      entity: "user",
      entityId: d.userId,
      action: "update",
      actorId: d.userId,
      actorName: u.name,
      summary: `🔑 ${u.name} reset their PIN (${method})`,
    });
    // Recovery codes are single-use: issue a fresh one.
    return rotateRecoveryCode(q, d.userId);
  });
  await startSession(d.userId);
  return { id: d.userId, recoveryCode };
});
