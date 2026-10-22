import { query } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";

type Ctx = RouteContext<"/api/avatars/[id]">;

// Profile pictures are only visible to signed-in members. URLs carry ?v=<updated time>, so the
// browser can keep each version forever and a new picture simply gets a new URL.
export const GET = route<Ctx>(async (_req, ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const [row] = await query<{ avatar: Buffer | Uint8Array | string | null; avatar_type: string | null }>(
    "select avatar, avatar_type from users where id = $1",
    [id],
  );
  if (!row?.avatar || !row.avatar_type) throw new HttpError(404, "No picture");
  // The HTTP driver may return bytea as "\x…" hex text; normalize to bytes.
  const bytes =
    typeof row.avatar === "string" ? Buffer.from(row.avatar.replace(/^\\x/, ""), "hex") : Buffer.from(row.avatar);
  return new Response(bytes, {
    headers: {
      "content-type": row.avatar_type,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});
