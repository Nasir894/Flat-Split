import "server-only";
import { query } from "./db";
import { HttpError } from "./http";
import { assertNotLimited, clientKey, recordFailure } from "./pin";

/**
 * Finds a joined member by name (case-insensitive) for sign-in or PIN recovery.
 * Unknown names count as failed attempts per client, so names can't be guessed endlessly.
 */
export async function memberIdByName(req: Request, name: string): Promise<string> {
  const key = `name:${clientKey(req)}`;
  await assertNotLimited(key, 10);
  const [u] = await query<{ id: string; status: string }>("select id, status from users where lower(name) = lower($1)", [
    name.trim(),
  ]);
  if (!u) {
    await recordFailure(key);
    throw new HttpError(401, "No member with that name. Check the spelling, or ask to join.");
  }
  if (u.status !== "active") throw new HttpError(403, "Your join request is still waiting for a flatmate's approval.");
  return u.id;
}
