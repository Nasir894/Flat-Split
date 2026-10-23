import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { asSystem, query } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireUser, sessionUserId, startSession } from "@/lib/server/auth";
import { assertNotLimited, clientKey, recordFailure } from "@/lib/server/pin";
import { fromB64url, relyingParty, saveChallenge, takeChallenge } from "@/lib/server/webauthn";

const purposeSchema = z.enum(["login", "unlock"]);

// Step 1: a challenge for the phone to sign with its fingerprint/face.
//  - login: any passkey saved on this phone (no name needed)
//  - unlock: only the signed-in member's passkeys (app lock)
export const GET = route(async (req) => {
  const purpose = purposeSchema.parse(new URL(req.url).searchParams.get("purpose"));
  const { rpID } = relyingParty(req);
  let allowCredentials: { id: string; transports: string[] }[] | undefined;
  if (purpose === "unlock") {
    const userId = await requireUser();
    allowCredentials = await query("select id, transports from passkeys where user_id = $1", [userId]);
    if (!allowCredentials.length) throw new HttpError(404, "Fingerprint/face isn't set up for you yet");
  }
  const options = await generateAuthenticationOptions({ rpID, allowCredentials, userVerification: "required" });
  await saveChallenge(options.challenge, purpose);
  return options;
});

// Step 2: check the signature against the stored public key, then sign in / unlock.
export const POST = route(async (req) => {
  const purpose = purposeSchema.parse(new URL(req.url).searchParams.get("purpose"));
  const limitKey = `passkey:${clientKey(req)}`;
  await assertNotLimited(limitKey, 10);
  const response = (await req.json()) as AuthenticationResponseJSON;
  const { rpID, origin } = relyingParty(req);
  const expectedChallenge = await takeChallenge(purpose);

  // A passkey can belong to anyone in any house, so this lookup searches every house.
  const [cred] = await asSystem(() => query<{
    id: string;
    user_id: string;
    public_key: string;
    counter: string;
    transports: string[];
    name: string;
    status: string;
  }>(
    `select p.id, p.user_id, p.public_key, p.counter::text as counter, p.transports, u.name, u.status
     from passkeys p join users u on u.id = p.user_id where p.id = $1`,
    [response.id],
  ));
  if (!cred) {
    await recordFailure(limitKey);
    throw new HttpError(401, "This fingerprint/face isn't set up for Flat Split anymore. Use your PIN.");
  }
  if (cred.status !== "active") throw new HttpError(403, "This account is waiting for approval.");

  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: cred.id,
      publicKey: fromB64url(cred.public_key),
      counter: Number(cred.counter),
      transports: cred.transports,
    },
  }).catch(() => null);
  if (!result?.verified) {
    await recordFailure(limitKey);
    throw new HttpError(401, "Fingerprint/face check failed. Try again or use your PIN.");
  }

  await query("update passkeys set counter = $2, last_used_at = now() where id = $1", [
    cred.id,
    result.authenticationInfo.newCounter,
  ]);

  if (purpose === "unlock") {
    // The app lock may only be opened by the member who is already signed in on this device.
    if ((await sessionUserId()) !== cred.user_id) throw new HttpError(403, "That's not your fingerprint/face sign-in");
  } else {
    await startSession(cred.user_id);
  }
  return { id: cred.user_id, name: cred.name };
});
