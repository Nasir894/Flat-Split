import { z } from "zod";
import { query, withTx } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { hashPin, startPendingSession, startSession } from "@/lib/server/auth";
import { guardHouseCode, houseCodeSchema, pinSchema, rotateRecoveryCode } from "@/lib/server/pin";
import { audit } from "@/lib/server/audit";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#d946ef", "#84cc16", "#f97316", "#3b82f6", "#ec4899"];
const MAX_PENDING = 5;

const body = z.object({
  houseCode: z.string().min(1, "Enter the house code"),
  name: z.string().trim().min(1, "Enter your name").max(40),
  pin: pinSchema,
});

/**
 * - No house yet: the first person creates it and chooses the house code.
 * - Otherwise: house code + name + PIN creates a *join request* that an existing member must approve.
 */
export const POST = route(async (req) => {
  const d = body.parse(await req.json());

  const [{ active }] = await query<{ active: number }>("select count(*)::int as active from users where status = 'active'");
  if (active === 0) return createHouse(d);

  await guardHouseCode(req, d.houseCode);
  const [existing] = await query("select 1 from users where lower(name) = lower($1)", [d.name]);
  if (existing) {
    throw new HttpError(409, "That name is already taken. If it's you, sign in or tap “Forgot PIN?”.");
  }
  const [{ pending }] = await query<{ pending: number }>("select count(*)::int as pending from users where status = 'pending'");
  if (pending >= MAX_PENDING) throw new HttpError(429, "Too many join requests waiting. Ask a flatmate to review them first.");

  const pinHash = await hashPin(d.pin);
  const { id, recoveryCode } = await withTx(async (q) => {
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from users");
    const [u] = await q<{ id: string }>(
      "insert into users (name, pin_hash, color, status) values ($1, $2, $3, 'pending') returning id",
      [d.name, pinHash, COLORS[n % COLORS.length]],
    );
    await audit(q, {
      entity: "user",
      entityId: u.id,
      action: "create",
      actorId: u.id,
      actorName: d.name,
      title: "👋 New join request",
      summary: `${d.name} wants to join the house. Open Flat Split to approve or decline.`,
    });
    return { id: u.id, recoveryCode: await rotateRecoveryCode(q, u.id) };
  });
  await startPendingSession(id);
  return { id, pending: true, recoveryCode };
});

async function createHouse(d: z.infer<typeof body>) {
  const houseCode = houseCodeSchema.parse(d.houseCode);
  const pinHash = await hashPin(d.pin);
  const { id, recoveryCode } = await withTx(async (q) => {
    // Serialize concurrent "create house" attempts, then re-check inside the lock.
    await q("select pg_advisory_xact_lock(727001)");
    const [{ active }] = await q<{ active: number }>("select count(*)::int as active from users where status = 'active'");
    if (active > 0) throw new HttpError(409, "The house was just created by someone else. Ask them for the house code.");
    const [taken] = await q("select 1 from users where lower(name) = lower($1)", [d.name]);
    if (taken) throw new HttpError(409, "That name is already taken");

    const [u] = await q<{ id: string }>(
      "insert into users (name, pin_hash, color, status, approved_at) values ($1, $2, $3, 'active', now()) returning id",
      [d.name, pinHash, COLORS[0]],
    );
    await q(
      `insert into settings (key, value, updated_by) values ('house_code', $1, $2)
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
      [houseCode, u.id],
    );
    await audit(q, {
      entity: "house",
      entityId: u.id,
      action: "create",
      actorId: u.id,
      actorName: d.name,
      summary: `🏠 ${d.name} created the house`,
    });
    return { id: u.id, recoveryCode: await rotateRecoveryCode(q, u.id) };
  });
  await startSession(id);
  return { id, pending: false, recoveryCode };
}
