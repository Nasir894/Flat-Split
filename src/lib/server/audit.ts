import "server-only";
import { after } from "next/server";
import type { Query } from "./db";
import { notifyOthers } from "./push";

export type Entity = "expense" | "transfer" | "rice" | "category" | "user" | "backup";
export type Action = "create" | "update" | "delete" | "restore" | "import";

const URLS: Record<Entity, string> = {
  expense: "/expenses",
  transfer: "/transfers",
  rice: "/rice",
  category: "/settings",
  user: "/",
  backup: "/activity",
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
  const notify = () =>
    after(() =>
      notifyOthers(e.actorId, {
        title: `${e.actorName} ${VERB[e.action]}`,
        body: e.summary,
        url: URLS[e.entity],
        tag: e.entityId ?? undefined,
      }).catch((err) => console.error("notify failed", err)),
    );
  if (q.onCommit) q.onCommit(notify);
  else notify();
}

const VERB: Record<Action, string> = {
  create: "added",
  update: "edited",
  delete: "deleted",
  restore: "restored",
  import: "restored a backup",
};

export async function userName(q: Query, id: string): Promise<string> {
  const [u] = await q<{ name: string }>("select name from users where id = $1", [id]);
  return u?.name ?? "Someone";
}
