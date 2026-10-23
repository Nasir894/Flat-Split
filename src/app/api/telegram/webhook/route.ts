import { timingSafeEqual } from "node:crypto";
import { runScoped } from "@/lib/server/db";
import { handleUpdate, webhookSecret } from "@/lib/server/telegram";

// Telegram calls this for /link, /update and the "Latest update" button. Always answer 200 so
// Telegram doesn't retry the same update over and over.
export async function POST(req: Request) {
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(webhookSecret());
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new Response("Unauthorized", { status: 401 });
  try {
    const update = await req.json();
    await runScoped(() => handleUpdate(update)); // the chat decides which house this is for
  } catch (err) {
    console.error("telegram webhook", err);
  }
  return Response.json({ ok: true });
}
