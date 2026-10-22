import { query } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";

// Audit feed. ?entityId=<uuid> gives one record's full history (with before/after states).
export const GET = route(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const entityId = url.searchParams.get("entityId");
  const cursor = Number(url.searchParams.get("cursor")) || null;
  const limit = 40;
  const rows = await query(
    `select id::int as id, entity, entity_id as "entityId", action, actor_id as "actorId", summary,
            ${entityId ? "before, after," : ""} created_at as "createdAt"
     from audit_log
     where ($1::uuid is null or entity_id = $1) and ($2::int is null or id < $2)
     order by id desc limit $3`,
    [entityId, cursor, limit + 1],
  );
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
});
