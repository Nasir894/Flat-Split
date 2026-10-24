import { z } from "zod";
import { query } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { deviceUser } from "@/lib/server/devices";
import { respondTransfer } from "@/lib/server/records";
import { decideJoin } from "@/lib/server/members";
import { postChatMessage } from "@/lib/server/chat";

// Buttons on the Android app's notifications, authorised by the phone's device key. Each action runs
// the same code (and checks) as doing it inside the app, as the phone's owner.
const body = z.discriminatedUnion("category", [
  z.object({ category: z.literal("transfer"), id: z.uuid(), decision: z.enum(["approve", "decline"]) }),
  z.object({ category: z.literal("join"), id: z.uuid(), decision: z.enum(["approve", "decline"]) }),
  z.object({ category: z.literal("chat"), id: z.string(), text: z.string() }),
]);

export const POST = route(async (req) => {
  const me = await deviceUser(req);
  const d = body.parse(await req.json());
  if (d.category === "transfer") {
    const [t] = await query<{ version: number }>("select version from transfers where id = $1", [d.id]);
    if (!t) throw new HttpError(404, "That payment no longer exists");
    await respondTransfer(me, d.id, { decision: d.decision, version: t.version });
  } else if (d.category === "join") {
    if (me.role !== "member") throw new HttpError(403, "Only home sharers can answer join requests");
    await decideJoin(me.id, d.id, { decision: d.decision });
  } else {
    if (me.role !== "member") throw new HttpError(403, "Only home sharers can use the house chat");
    await postChatMessage(me.id, { body: d.text });
  }
  return { ok: true };
});
