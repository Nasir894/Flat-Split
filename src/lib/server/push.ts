import "server-only";
import webpush from "web-push";
import { query } from "./db";

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://flat-split.vercel.app", pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string; kind?: string; entity?: string };

/** Sends a push to every home sharer's devices except the actor's own (guests only get tour pushes). */
export async function notifyOthers(actorId: string, payload: PushPayload) {
  if (!configure()) return;
  const subs = await query<Sub>(
    `select s.endpoint, s.p256dh, s.auth from push_subscriptions s join users u on u.id = s.user_id
     where s.user_id <> $1 and u.role = 'member' and u.status = 'active'`,
    [actorId],
  );
  await sendAll(subs, payload);
}

/** Sends a push only to the given members' devices (e.g. the author of a message someone reacted to). */
export async function notifyUsers(userIds: string[], payload: PushPayload) {
  if (!configure() || !userIds.length) return;
  const subs = await query<Sub>("select endpoint, p256dh, auth from push_subscriptions where user_id = any($1::uuid[])", [userIds]);
  await sendAll(subs, payload);
}

type Sub = { endpoint: string; p256dh: string; auth: string };

async function sendAll(subs: Sub[], payload: PushPayload) {
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 24,
        });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await query("delete from push_subscriptions where endpoint = $1", [s.endpoint]);
        } else {
          console.error("push failed", code);
        }
      }
    }),
  );
}