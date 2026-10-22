import { timingSafeEqual } from "node:crypto";
import { handleUpdate, webhookSecret } from "@/lib/server/telegram";

// Telegram calls this for /link, /update and the "Latest update" button. Always answer 200 so
// Telegram doesn't retry the same update over and over.
export async function POST(req: Request) {
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(webhookSecret());
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new Response("Unauthorized", { status: 401 });
  try {
    await handleUpdate(await req.json());
  } catch (err) {
    console.error("telegram webhook", err);
  }
  return Response.json({ ok: true });
}
