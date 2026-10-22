"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useInvalidateAll, useSummary } from "@/hooks/use-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberAvatar } from "./member-avatar";

/** People waiting to join the house. Any member can approve or decline; it's recorded who did. */
export function JoinRequests() {
  const { data } = useSummary();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState<string | null>(null);
  const pending = data?.pending ?? [];
  if (!pending.length) return null;

  const decide = async (id: string, name: string, decision: "approve" | "decline") => {
    setBusy(id + decision);
    try {
      await api(`/api/members/${id}/join`, { body: { decision } });
      toast.success(decision === "approve" ? `${name} added to the house` : `Declined ${name}'s request`);
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
        <CardDescription>Only approve people you actually live with. Your name is recorded as who added them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.map((p) => (
          <div key={p.id} className="flex items-center gap-3">
            <MemberAvatar name={p.name} color={p.color} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                asked {formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Decline ${p.name}`}
              disabled={Boolean(busy)}
              onClick={() => decide(p.id, p.name, "decline")}
            >
              {busy === p.id + "decline" ? <Loader2 className="animate-spin" /> : <X />}
            </Button>
            <Button size="sm" disabled={Boolean(busy)} onClick={() => decide(p.id, p.name, "approve")}>
              {busy === p.id + "approve" ? <Loader2 className="animate-spin" /> : <Check />} Approve
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
