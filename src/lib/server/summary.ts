import "server-only";
import { computeRice } from "@/lib/rice";
import { query } from "./db";
import { iso } from "./http";
import { RICE_COLS, TRANSFER_COLS, type Actor } from "./records";
import { homeBalances } from "./balances";
import { listTours } from "./tours";

const USER_COLS = `id, name, color, role, created_at as "createdAt", (pin_hash is null) as "needsPin",
  coalesce(reset_expires_at > now(), false) as "resetApproved",
  approved_by as "addedBy", coalesce(approved_at, created_at) as "joinedAt",
  (extract(epoch from avatar_updated_at) * 1000)::bigint::text as "avatarVersion"`;

// Payments other people say they made to me, waiting for my OK (home + my tours).
const awaitingFor = (meId: string) =>
  query(
    `select ${TRANSFER_COLS} from transfers t
     where t.deleted_at is null and t.status = 'pending' and t.to_user_id = $1 order by t.sent_at desc`,
    [meId],
  );

export async function getSummary(actor: Actor) {
  return actor.role === "guest" ? guestSummary(actor) : memberSummary(actor);
}

/** Guests only see their tours and the people on them. */
async function guestSummary(actor: Actor) {
  const [people, tours, awaitingMe] = await Promise.all([
    query(
      `select ${USER_COLS} from users where status = 'active' and id in (
         select user_id from tour_participants where tour_id in (
           select tour_id from tour_participants tp join tours t on t.id = tp.tour_id
           where tp.user_id = $1 and t.deleted_at is null))
       or id = $1
       order by created_at`,
      [actor.id],
    ),
    listTours(actor),
    awaitingFor(actor.id),
  ]);
  return {
    meId: actor.id,
    role: "guest" as const,
    users: people.filter((u) => u.role === "member"),
    guests: people.filter((u) => u.role === "guest"),
    pending: [],
    categories: await query(
      `select id, name, emoji, is_default as "isDefault", deleted_at as "deletedAt" from categories order by is_default desc, name`,
    ),
    balances: [],
    rice: computeRice([], []),
    awaitingMe: awaitingMe.filter((t) => t.tourId),
    lastChat: null,
    lastActivity: null,
    trackers: [],
    tours,
  };
}

async function memberSummary(actor: Actor) {
  const meId = actor.id;
  const [everyone, pending, categories, balances, rice, awaitingMe, chat, activity, trackerRows, tours] = await Promise.all([
    query(`select ${USER_COLS} from users where status = 'active' order by created_at`),
    query(`select id, name, color, created_at as "createdAt" from users where status = 'pending' order by created_at`),
    query(
      `select id, name, emoji, is_default as "isDefault", deleted_at as "deletedAt"
       from categories order by is_default desc, name`,
    ),
    homeBalances(),
    query(`select ${RICE_COLS} from rice_entries r where r.deleted_at is null`),
    awaitingFor(meId),
    // Latest chat message, for the unread dot.
    query(`select id::int as id, user_id as "userId", created_at as "createdAt" from chat_messages order by id desc limit 1`),
    // Latest activity-log entry, for the bell dot.
    query(`select id::int as id, actor_id as "userId" from audit_log order by id desc limit 1`),
    query<{ id: string; name: string; emoji: string; memberIds: string[] | null; isDefault: boolean; createdAt: Date }>(
      `select id, name, emoji, member_ids as "memberIds", is_default as "isDefault", created_at as "createdAt"
       from trackers where deleted_at is null order by is_default desc, created_at`,
    ),
    listTours(actor),
  ]);
  // Home sharers run the house; guests only appear on tours.
  const users = everyone.filter((u) => u.role === "member");
  const guests = everyone.filter((u) => u.role === "guest");

  // Every turn tracker (Rice + custom ones) gets its own cycle status, replayed from its entries.
  const trackers = trackerRows.map((t) => {
    const participants = users.filter((u) => !t.memberIds || t.memberIds.includes(u.id));
    const trackerStart = new Date(t.createdAt).getTime();
    return {
      id: t.id,
      name: t.name,
      emoji: t.emoji,
      isDefault: t.isDefault,
      memberIds: participants.map((u) => u.id),
      everyone: !t.memberIds,
      status: computeRice(
        // Duty starts when the member joined or when the tracker was created, whichever is later.
        participants.map((u) => ({ id: u.id, createdAt: new Date(Math.max(new Date(u.joinedAt).getTime(), trackerStart)).toISOString() })),
        rice
          .filter((r) => r.trackerId === t.id)
          .map((r) => ({ id: r.id, userId: r.userId, givenAt: iso(r.givenAt)!, createdAt: iso(r.createdAt)! })),
      ),
    };
  });
  const riceStatus = trackers.find((t) => t.isDefault)?.status ?? computeRice([], []);
  return {
    meId,
    role: "member" as const,
    users,
    guests,
    pending,
    categories,
    balances,
    rice: riceStatus,
    awaitingMe,
    lastChat: chat[0] ?? null,
    lastActivity: activity[0] ?? null,
    trackers,
    tours,
  };
}
