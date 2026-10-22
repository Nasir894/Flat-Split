import { query } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { endPendingSession, pendingUserId, startSession } from "@/lib/server/auth";

// Polled by a device waiting for approval. Once approved, it swaps the pending cookie for a real session.
export const GET = route(async () => {
  const id = await pendingUserId();
  if (!id) return { status: "none" };
  const [u] = await query<{ status: string; approver: string | null }>(
    `select u.status, a.name as approver from users u left join users a on a.id = u.approved_by where u.id = $1`,
    [id],
  );
  if (!u) {
    await endPendingSession();
    return { status: "declined" };
  }
  if (u.status === "active") {
    await endPendingSession();
    await startSession(id);
    return { status: "approved", approvedBy: u.approver };
  }
  return { status: "pending" };
});

// Cancel my own request (e.g. typed the wrong name).
export const DELETE = route(async () => {
  const id = await pendingUserId();
  if (id) await query("delete from users where id = $1 and status = 'pending'", [id]);
  await endPendingSession();
  return { ok: true };
});
