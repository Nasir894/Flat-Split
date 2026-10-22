import { z } from "zod";
import { route } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { withTx } from "@/lib/server/db";
import { audit, userName } from "@/lib/server/audit";
import {
  newLinkCode,
  registerWebhook,
  sendDigestToAll,
  setDigestTime,
  telegramStatus,
  unlinkChat,
} from "@/lib/server/telegram";

export const GET = route(async () => {
  await requireMember();
  return telegramStatus();
});

// "Send now" from Settings: the same digest the daily schedule sends, to every linked chat.
export const POST = route(async (req) => {
  await requireMember();
  await registerWebhook(req);
  return { ok: true, sent: await sendDigestToAll() };
});

const patch = z.union([
  z.object({ time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a valid time") }),
  z.object({ linkCode: z.literal(true) }),
  z.object({ removeChat: z.string() }),
]);

export const PATCH = route(async (req) => {
  const actorId = await requireMember();
  const d = patch.parse(await req.json());
  // Keep the bot pointed at this deployment so /link and the "Latest update" button work.
  await registerWebhook(req);
  if ("linkCode" in d) return { code: await newLinkCode(actorId) };
  if ("removeChat" in d) {
    await unlinkChat(d.removeChat);
    return telegramStatus();
  }
  await setDigestTime(d.time, actorId);
  await withTx(async (q) => {
    const actorName = await userName(q, actorId);
    await audit(q, {
      entity: "house",
      entityId: null,
      action: "update",
      actorId,
      actorName,
      title: `📨 ${actorName} set the Telegram update to ${d.time}`,
      summary: `📨 ${actorName} set the daily Telegram update to ${d.time}`,
    });
  });
  return telegramStatus();
});
