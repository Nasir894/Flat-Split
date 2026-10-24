import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { asSystem, query, setHouse } from "./db";
import { HttpError } from "./http";
import type { Role } from "./auth";

// Phones running the Android app (see app_devices in db/schema.sql). Each gets a random device key
// that only allows notification-button actions; the database stores just its hash.

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

/** Registers (or re-registers) this phone for the signed-in member and returns its new device key. */
export async function registerDevice(userId: string, pushToken: string | null, oldKey?: string) {
  const key = randomBytes(32).toString("base64url");
  if (oldKey) await query("delete from app_devices where key_hash = $1", [hash(oldKey)]);
  // A push token belongs to one phone; whoever signs in on it now owns it (across houses too).
  if (pushToken) await asSystem(() => query("delete from app_devices where push_token = $1", [pushToken]));
  await query("insert into app_devices (user_id, push_token, key_hash) values ($1, $2, $3)", [userId, pushToken, hash(key)]);
  return key;
}

export async function unregisterDevice(key: string) {
  await asSystem(() => query("delete from app_devices where key_hash = $1", [hash(key)]));
}

/** The member a device key belongs to; also points this request at their house. */
export async function deviceUser(req: Request): Promise<{ id: string; role: Role; houseId: string }> {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!key) throw new HttpError(401, "Missing device key");
  const [d] = await asSystem(() =>
    query<{ id: string; role: Role; house_id: string; status: string }>(
      `update app_devices a set last_seen_at = now() from users u
       where a.key_hash = $1 and u.id = a.user_id
       returning u.id, u.role, u.status, a.house_id`,
      [hash(key)],
    ),
  );
  if (!d || d.status !== "active") throw new HttpError(401, "This phone is signed out. Open Flat Split to sign in again.");
  setHouse(d.house_id);
  return { id: d.id, role: d.role, houseId: d.house_id };
}

// ---------- sending (Expo push service → Firebase on Android) ----------

/** Buttons a notification offers; the phone shows them for these categories. */
export type PushAction = {
  category: "transfer" | "join" | "chat";
  id: string;
  /** Only this person gets the buttons (e.g. the receiver confirms a payment); others get a plain notification. */
  forUserId?: string;
};

type ExpoMessage = {
  to: string;
  title?: string;
  body?: string;
  data: Record<string, unknown>;
  categoryId?: string;
  channelId?: string;
  priority: "high" | "normal";
  sound?: "default";
};

async function sendExpo(messages: ExpoMessage[]) {
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(batch),
    }).catch(() => null);
    if (!res?.ok) continue;
    const { data } = (await res.json().catch(() => ({}))) as { data?: { status: string; details?: { error?: string } }[] };
    // Phones that uninstalled the app: forget them.
    const gone = (data ?? []).flatMap((t, j) => (t.details?.error === "DeviceNotRegistered" ? [batch[j].to] : []));
    if (gone.length) await asSystem(() => query("delete from app_devices where push_token = any($1::text[])", [gone]));
  }
}

/**
 * Phone notifications for a change in the current house:
 * - `visibleTo` see the notification (with buttons when `action` applies to them),
 * - every other app in the house gets a silent "refresh your widgets" message.
 */
export async function pushToPhones(
  visibleTo: string[],
  payload: { title: string; body: string; url?: string; action?: PushAction },
) {
  const devices = await query<{ user_id: string; push_token: string }>(
    "select a.user_id, a.push_token from app_devices a join users u on u.id = a.user_id where a.push_token is not null and u.status = 'active'",
  );
  if (!devices.length) return;
  const show = new Set(visibleTo);
  const messages = devices.map<ExpoMessage>((d) => {
    if (!show.has(d.user_id)) return { to: d.push_token, data: { type: "refresh" }, priority: "high" };
    const a = payload.action;
    const buttons = a && (!a.forUserId || a.forUserId === d.user_id);
    return {
      to: d.push_token,
      title: payload.title,
      body: payload.body,
      data: { type: "notice", url: payload.url ?? "/", ...(buttons ? { category: a.category, id: a.id } : {}) },
      ...(buttons ? { categoryId: a.category } : {}),
      channelId: "default",
      priority: "high",
      sound: "default",
    };
  });
  await sendExpo(messages);
}
