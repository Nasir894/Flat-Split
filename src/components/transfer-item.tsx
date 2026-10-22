"use client";

import { format } from "date-fns";
import { ArrowRight, Check, Clock, Loader2, X } from "lucide-react";
import { useLookups, useRespondTransfer } from "@/hooks/use-data";
import { formatTaka } from "@/lib/money";
import type { Transfer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "./member-avatar";
import { RecordActions, RecordMeta, RecordRow } from "./records";

/** One transfer, with its confirmation status. The receiver can approve or decline pending ones. */
export function TransferItem({ t, onEdit }: { t: Transfer; onEdit: () => void }) {
  const { userById, meId } = useLookups();
  const respond = useRespondTransfer();
  const from = userById.get(t.fromUserId);
  const to = userById.get(t.toUserId);
  const mine = t.fromUserId === meId ? 1 : t.toUserId === meId ? -1 : 0;
  const pending = t.status === "pending" && !t.deletedAt;
  const declined = t.status === "declined" && !t.deletedAt;
  const iMustAnswer = pending && t.toUserId === meId;

  return (
    <RecordRow rec={t}>
      <div className="flex shrink-0 -space-x-2 pt-0.5">
        <UserAvatar user={from} className="size-8 text-xs ring-2 ring-background" />
        <UserAvatar user={to} className="size-8 text-xs ring-2 ring-background" />
      </div>
      <div className={cn("min-w-0 flex-1", declined && "opacity-50")}>
        <p className={cn("flex items-center gap-1 font-medium", (t.deletedAt || declined) && "line-through")}>
          {from?.name} <ArrowRight className="size-3.5 text-muted-foreground" /> {to?.name}
        </p>
        {t.note && <p className="truncate text-xs text-muted-foreground">{t.note}</p>}
        <p className="text-xs text-muted-foreground">
          {format(new Date(t.sentAt), "d MMM yyyy")} <RecordMeta rec={t} />
        </p>
        {pending && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-foreground">
            <Clock className="size-3" />
            {iMustAnswer ? "Did you receive this?" : `Waiting for ${to?.name ?? "them"} to confirm`}
          </p>
        )}
        {declined && <p className="mt-1 text-[11px] font-medium text-negative">Declined by {to?.name} · not counted</p>}
        {iMustAnswer && (
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ id: t.id, version: t.version, decision: "decline" })}
            >
              <X /> Decline
            </Button>
            <Button
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ id: t.id, version: t.version, decision: "approve" })}
            >
              {respond.isPending ? <Loader2 className="animate-spin" /> : <Check />} Approve
            </Button>
          </div>
        )}
      </div>
      <p
        className={cn(
          "font-semibold tabular",
          (t.deletedAt || declined) && "line-through opacity-50",
          !t.deletedAt && t.status === "approved" && mine > 0 && "text-positive",
          !t.deletedAt && t.status === "approved" && mine < 0 && "text-negative",
          pending && "text-muted-foreground",
        )}
      >
        {formatTaka(t.amount)}
      </p>
      <RecordActions kind="transfers" rec={t} onEdit={onEdit} />
    </RecordRow>
  );
}
