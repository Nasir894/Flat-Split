import "server-only";
import { after } from "next/server";
import type { Query } from "./db";
import { notifyOthers } from "./push";

export type Entity = "expense" | "transfer" | "rice" | "category" | "user" | "backup" | "house" | "tracker";
export type Action = "create" | "update" | "delete" | "restore" | "import";

const URLS: Record<Entity, string> = {
  expense: "/expenses",
  transfer: "/transfers",
  rice: "/rice",
  category: "/settings",
  user: "/",
  backup: "/activity",
  house: "/settings",
  tracker: "/rice",
};

/**
 * Appends to the immutable audit log inside the caller's transaction and, once the
 * response is sent, pushes a notification to everyone else's devices.
 */
export async function audit(
  q: Query,
  e: {
    entity: Entity;
    entityId: string | null;
    action: Action;
    actorId: string;
    actorName: string;
    summary: string;
    /** Notification title; defaults to an emoji + "<actor> <did what>" for the entity/action. */
    title?: string;
    /** Set false for private events (e.g. turning on fingerprint sign-in). Default: notify everyone else. */
    notify?: boolean;
    before?: unknown;
    after?: unknown;
  },
) {
  await q(
    `insert into audit_log (entity, entity_id, action, actor_id, summary, before, after)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      e.entity,
      e.entityId,
      e.action,
      e.actorId,
      e.summary,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
    ],
  );
  if (e.notify === false) return;
  const notify = () =>
    after(() =>
      notifyOthers(e.actorId, {
        title: e.title ?? defaultTitle(e.entity, e.action, e.actorName),
        body: e.summary,
        url: URLS[e.entity],
        tag: e.entityId ? `${e.entity}-${e.entityId}` : undefined,
        kind: e.action,
        entity: e.entity,
      }).catch((err) => console.error("notify failed", err)),
    );
  if (q.onCommit) q.onCommit(notify);
  else notify();
}

// Each kind of change reads differently at a glance on the lock screen.
const ICON: Record<Action, string> = { create: "➕", update: "✏️", delete: "🗑️", restore: "♻️", import: "📦" };
const VERB: Record<Action, string> = {
  create: "added",
  update: "edited",
  delete: "deleted",
  restore: "restored",
  import: "restored",
};
const NOUN: Partial<Record<Entity, string>> = {
  expense: "an expense",
  transfer: "a transfer",
  rice: "a turn",
  tracker: "a turn tracker",
  category: "a category",
  backup: "a backup",
};

function defaultTitle(entity: Entity, action: Action, actor: string) {
  if (entity === "rice" && action === "create") return `🔁 ${actor} did their turn`;
  if (entity === "transfer" && action === "create") return `💸 ${actor} recorded a transfer`;
  if (entity === "category" && action === "create") return `🏷️ ${actor} added a category`;
  if (entity === "category" && action === "delete") return `🏷️ ${actor} hid a category`;
  return `${ICON[action]} ${actor} ${VERB[action]} ${NOUN[entity] ?? "something"}`;
}

export async function userName(q: Query, id: string): Promise<string> {
  const [u] = await q<{ name: string }>("select name from users where id = $1", [id]);
  return u?.name ?? "Someone";
}
