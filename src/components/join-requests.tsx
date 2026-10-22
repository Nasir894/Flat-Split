"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, House, Loader2, Luggage, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useInvalidateAll, useLookups, useSummary } from "@/hooks/use-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberAvatar } from "./member-avatar";

/**
 * People waiting to join. A home sharer decides who they are:
 *  - Home sharer: lives in the flat, full access (admin)
 *  - Guest: only joins tours; pick which tours now (more can be added later from the tour)
 */
export function JoinRequests() {
  const { data } = useSummary();
  const { tours } = useLookups();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState<string | null>(null);
  const [asGuest, setAsGuest] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const pending = data?.pending ?? [];
  const openTours = tours.filter((t) => t.status !== "closed");
  if (!pending.length) return null;

  const decide = async (id: string, name: string, decision: "approve" | "decline", role: "member" | "guest" = "member") => {
    setBusy(id + decision + role);
    try {
      await api(`/api/members/${id}/join`, { body: { decision, role, tourIds: role === "guest" ? picked : [] } });
      toast.success(decision === "decline" ? `Declined ${name}'s request` : role === "guest" ? `${name} added as a tour guest` : `${name} added to the house`);
      setAsGuest(null);
      setPicked([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      invalidate();
    }
  };

  return (
    <Card className="rise border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="size-4 text-primary" /> Join {pending.length === 1 ? "request" : "requests"}
        </CardTitle>
        <CardDescription>
          Home sharers live in the flat and see everything. Guests only see the tours you add them to. Your name is recorded
          as who added them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pending.map((p) => (
          <div key={p.id} className="space-y-2">
            <div className="flex items-center gap-3">
              <MemberAvatar name={p.name} color={p.color} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">asked {formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}</p>
              </div>
              <Button size="sm" variant="outline" aria-label={`Decline ${p.name}`} disabled={!!busy} onClick={() => decide(p.id, p.name, "decline")}>
                {busy === p.id + "declinemember" ? <Loader2 className="animate-spin" /> : <X />}
              </Button>
            </div>
            {asGuest === p.id ? (
              <div className="rise space-y-2 rounded-xl border bg-card p-3">
                <p className="text-sm font-medium">Which tours is {p.name} joining?</p>
                {openTours.length === 0 && <p className="text-xs text-muted-foreground">No planned or ongoing tours. You can add them to a tour later.</p>}
                {openTours.map((t) => {
                  const on = picked.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setPicked((x) => (on ? x.filter((y) => y !== t.id) : [...x, t.id]))}
                      className="flex w-full items-center gap-2 text-left text-sm"
                    >
                      <span className={cn("flex size-5 items-center justify-center rounded-md border", on && "border-primary bg-primary text-primary-foreground")}>
                        {on && <Check className="size-3.5" />}
                      </span>
                      {t.emoji} {t.name}
                    </button>
                  );
                })}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setAsGuest(null)}>
                    Back
                  </Button>
                  <Button size="sm" className="flex-1" disabled={!!busy} onClick={() => decide(p.id, p.name, "approve", "guest")}>
                    {busy === p.id + "approveguest" ? <Loader2 className="animate-spin" /> : <Luggage />} Add as guest
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" disabled={!!busy} onClick={() => decide(p.id, p.name, "approve", "member")}>
                  {busy === p.id + "approvemember" ? <Loader2 className="animate-spin" /> : <House />} Home sharer
                </Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => (setAsGuest(p.id), setPicked([]))}>
                  <Luggage /> Tour guest
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
