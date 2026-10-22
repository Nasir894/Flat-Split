import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { query, withTx } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { audit, userName } from "@/lib/server/audit";
import { RP_NAME, deviceLabel, relyingParty, saveChallenge, takeChallenge, toB64url } from "@/lib/server/webauthn";

// Step 1: options for turning on fingerprint/face on this device (signed-in members only).
export const GET = route(async (req) => {
  const userId = await requireUser();
  const { rpID } = relyingParty(req);
  const [[u], existing] = await Promise.all([
    query<{ name: string }>("select name from users where id = $1", [userId]),
    query<{ id: string; transports: string[] }>("select id, transports from passkeys where user_id = $1", [userId]),
  ]);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: u.name,
    userDisplayName: u.name,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
    // No attachment restriction: phones use their fingerprint/face, laptops use Windows Hello /
    // Touch ID, and a phone can also be used for a laptop via QR code.
    authenticatorSelection: {
      residentKey: "required", // lets the sign-in screen work without typing a name
      userVerification: "required", // must actually check the fingerprint/face (or device PIN)
    },
  });
  await saveChallenge(options.challenge, "register");
  return options;
});

// Step 2: verify the phone's response and store the public key.
export const POST = route(async (req) => {
  const userId = await requireUser();
  const response = (await req.json()) as RegistrationResponseJSON;
  const { rpID, origin } = relyingParty(req);
  const expectedChallenge = await takeChallenge("register");

  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified) throw new HttpError(400, "Couldn't verify this device. Please try again.");

  const { credential } = result.registrationInfo;
  const device = deviceLabel(req);
  await withTx(async (q) => {
    await q(
      `insert into passkeys (id, user_id, public_key, counter, transports, device)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update set public_key = excluded.public_key, counter = excluded.counter`,
      [credential.id, userId, toB64url(credential.publicKey), credential.counter, credential.transports ?? [], device],
    );
    const actorName = await userName(q, userId);
    await audit(q, {
      entity: "user",
      entityId: userId,
      action: "update",
      actorId: userId,
      actorName,
      summary: `🔐 ${actorName} turned on fingerprint/face sign-in (${device})`,
      notify: false,
    });
  });
  return { id: credential.id, device };
});
