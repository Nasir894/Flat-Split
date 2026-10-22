import "server-only";

/** Chat message columns, including its reactions as [{ emoji, userId }]. Use with alias `m`. */
export const MESSAGE_COLS = `m.id::int as id, m.user_id as "userId",
  case when m.deleted_at is null then m.body else '' end as body,
  m.created_at as "createdAt", (m.deleted_at is not null) as deleted,
  coalesce((select json_agg(json_build_object('emoji', r.emoji, 'userId', r.user_id) order by r.created_at)
            from chat_reactions r where r.message_id = m.id), '[]'::json) as reactions`;