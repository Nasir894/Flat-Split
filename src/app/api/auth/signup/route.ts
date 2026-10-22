import { z } from "zod";
import { query, withTx } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { hashPin, startSession } from "@/lib/server/auth";
import { guardHouseCode, pinSchema, rotateRecoveryCode } from "@/lib/server/pin";
import { audit } from "@/lib/server/audit";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#d946ef", "#84cc16", "#f97316", "#3b82f6", "#ec4899"];

const body = z.object({
  houseCode: z.string().min(1, "Enter the house code"),
  name: z.string().trim().min(1, "Enter your name").max(40),
  pin: pinSchema,
});

// Join the house with the house code, or set a new PIN on an account restored from backup.
export const POST = route(async (req) => {
  const d = body.parse(await req.json());
  await guardHouseCode(req, d.houseCode);
  const pinHash = await hashPin(d.pin);

  const [existing] = await query<{ id: string; pin_hash: string | null }>(
    "select id, pin_hash from users where lower(name) = lower($1)",
    [d.name],
  );
  if (existing?.pin_hash) throw new HttpError(409, "That name is already taken. Sign in instead.");

  const { id, recoveryCode } = await withTx(async (q) => {
    if (existing) {
      await q("update users set pin_hash = $2, failed_attempts = 0, locked_until = null where id = $1", [
        existing.id,
        pinHash,
      ]);
      return { id: existing.id, recoveryCode: await rotateRecoveryCode(q, existing.id) };
    }
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from users");
    const [u] = await q<{ id: string }>("insert into users (name, pin_hash, color) values ($1, $2, $3) returning id", [
      d.name,
      pinHash,
      COLORS[n % COLORS.length],
    ]);
    await audit(q, {
      entity: "user",
      entityId: u.id,
      action: "create",
      actorId: u.id,
      actorName: d.name,
      summary: `${d.name} joined the flat`,
      after: { id: u.id, name: d.name },
    });
    return { id: u.id, recoveryCode: await rotateRecoveryCode(q, u.id) };
  });
  await startSession(id);
  // The recovery code is shown once; only its hash is stored.
  return { id, recoveryCode };
});
