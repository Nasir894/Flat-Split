import { z } from "zod";
import { query } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";

const MAX_BYTES = 150 * 1024;
const TYPES = ["image/webp", "image/jpeg", "image/png"] as const;

// The app resizes pictures to 256×256 before upload, so they arrive small (~10–30 KB).
const body = z.object({ dataUrl: z.string().max(Math.ceil((MAX_BYTES * 4) / 3) + 100) });

export const POST = route(async (req) => {
  const userId = await requireUser();
  const { dataUrl } = body.parse(await req.json());
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || !TYPES.includes(m[1] as (typeof TYPES)[number])) throw new HttpError(400, "Please choose a photo (JPG, PNG or WebP)");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_BYTES) throw new HttpError(400, "That picture is too large");
  // Check the file really is the image type it claims (magic bytes), not just its label.
  const sig = bytes.subarray(0, 12).toString("latin1");
  const real =
    (m[1] === "image/png" && sig.startsWith("\x89PNG")) ||
    (m[1] === "image/jpeg" && sig.startsWith("\xff\xd8\xff")) ||
    (m[1] === "image/webp" && sig.startsWith("RIFF") && sig.slice(8, 12) === "WEBP");
  if (!real) throw new HttpError(400, "That file isn't a valid image");

  const [u] = await query<{ v: string }>(
    `update users set avatar = $2, avatar_type = $3, avatar_updated_at = now() where id = $1
     returning (extract(epoch from avatar_updated_at) * 1000)::bigint::text as v`,
    [userId, bytes, m[1]],
  );
  return { avatarVersion: u.v };
});

export const DELETE = route(async () => {
  const userId = await requireUser();
  await query("update users set avatar = null, avatar_type = null, avatar_updated_at = null where id = $1", [userId]);
  return { ok: true };
});
