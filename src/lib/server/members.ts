import "server-only";
import { asSystem, query, setHouse } from "./db";
import { HttpError } from "./http";
import { assertNotLimited, clientKey, guardHouseCode, recordFailure } from "./pin";

/** Thrown when a name exists in more than one house: the sign-in screen then asks for the house code. */
export const NEED_HOUSE_CODE = 409;

/**
 * Finds a joined member by name (case-insensitive) for sign-in or PIN recovery, and points this
 * request at their house. Names are unique within a house, so when several houses have the same
 * name the house code tells them apart. Unknown names count as failed attempts per client.
 */
export async function memberIdByName(req: Request, name: string, houseCode?: string): Promise<string> {
  const key = `name:${clientKey(req)}`;
  await assertNotLimited(key, 10);
  const houseId = houseCode?.trim() ? await guardHouseCode(req, houseCode) : null;
  const matches = await asSystem(() =>
    query<{ id: string; status: string; house_id: string }>(
      "select id, status, house_id from users where lower(name) = lower($1) and ($2::uuid is null or house_id = $2::uuid)",
      [name.trim(), houseId],
    ),
  );
  if (!matches.length) {
    await recordFailure(key);
    throw new HttpError(401, "No member with that name. Check the spelling, or ask to join.");
  }
  if (matches.length > 1) throw new HttpError(NEED_HOUSE_CODE, "More than one house has someone with that name. Enter your house code too.");
  const [u] = matches;
  if (u.status !== "active") throw new HttpError(403, "Your join request is still waiting for a flatmate's approval.");
  setHouse(u.house_id);
  return u.id;
}
