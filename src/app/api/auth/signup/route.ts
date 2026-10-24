import { z } from "zod";
import { randomUUID } from "node:crypto";
import { query, setHouse, withTx, type Query } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { hashPin, startPendingSession, startSession } from "@/lib/server/auth";
import { assertNotLimited, clientKey, guardHouseCode, houseByCode, houseCodeSchema, pinSchema, recordFailure, rotateRecoveryCode } from "@/lib/server/pin";
import { audit } from "@/lib/server/audit";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#d946ef", "#84cc16", "#f97316", "#3b82f6", "#ec4899"];
const MAX_PENDING = 5;

const DEFAULT_CATEGORIES = [
  ["Grocery", "🛒"], ["Fast Food", "🍔"], ["Fish & Meat", "🍗"], ["Vegetables", "🥬"], ["Utilities", "💡"],
  ["Internet", "🌐"], ["Gas", "🔥"], ["Household", "🧴"], ["Rent", "🏠"], ["Other", "📦"],
];

const body = z.object({
  houseCode: z.string().min(1, "Enter the house code"),
  name: z.string().trim().min(1, "Enter your name").max(40),
  pin: pinSchema,
  // true: start a brand-new house with this code. Otherwise: ask to join the house that has it.
  create: z.boolean().optional(),
});

/**
 * - create: anyone can start a new house and choose its code; they're its first member.
 * - Otherwise: house code + name + PIN creates a *join request* that a member of that house must approve.
 */
export const POST = route(async (req) => {
  const d = body.parse(await req.json());
  if (d.create) return createHouse(req, d);

  await guardHouseCode(req, d.houseCode); // now working inside that house
  const [existing] = await query("select 1 from users where lower(name) = lower($1)", [d.name]);
  if (existing) {
    throw new HttpError(409, "That name is already taken in this house. If it's you, sign in or tap “Forgot PIN?”.");
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
      pushAction: { category: "join", id: u.id },
    });
    return { id: u.id, recoveryCode: await rotateRecoveryCode(q, u.id) };
  });
  await startPendingSession(id);
  return { id, pending: true, recoveryCode };
});

async function createHouse(req: Request, d: z.infer<typeof body>) {
  const houseCode = houseCodeSchema.parse(d.houseCode);
  // "Code already taken" says that code exists, so it counts towards the same guess limit as joining.
  const key = clientKey(req);
  await assertNotLimited(key, 10);
  if (await houseByCode(houseCode)) {
    await recordFailure(key);
    throw new HttpError(409, "That house code is already used by another house. Pick a different one.");
  }
  const pinHash = await hashPin(d.pin);
  // The house, its first member and its defaults are created together (all or nothing).
  setHouse(randomUUID());
  const { id, recoveryCode } = await withTx(async (q) => {
    const [house] = await q<{ id: string }>(
      "insert into houses (id, code) values (current_setting('app.house_id')::uuid, $1) on conflict do nothing returning id",
      [houseCode],
    );
    if (!house) throw new HttpError(409, "That house code was just taken. Pick a different one.");
    const [u] = await q<{ id: string }>(
      "insert into users (name, pin_hash, color, status, approved_at) values ($1, $2, $3, 'active', now()) returning id",
      [d.name, pinHash, COLORS[0]],
    );
    await seedHouse(q, u.id);
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

/** A new house starts with the usual categories and a Rice turn tracker. */
async function seedHouse(q: Query, userId: string) {
  await q(
    `insert into categories (name, emoji, is_default, created_by)
     select x.name, x.emoji, true, $2 from json_to_recordset($1::json) as x(name text, emoji text)`,
    [JSON.stringify(DEFAULT_CATEGORIES.map(([name, emoji]) => ({ name, emoji }))), userId],
  );
  await q("insert into trackers (name, emoji, is_default, created_by) values ('Rice', '🍚', true, $1)", [userId]);
}
