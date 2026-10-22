"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ArrowLeftRight, ArrowRight, Plus } from "lucide-react";
import { useLookups, useRecords } from "@/hooks/use-data";
import { formatTaka } from "@/lib/money";
import type { Transfer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberAvatar } from "@/components/member-avatar";
import { EmptyState, LoadMore, RecordActions, RecordMeta, RecordRow } from "@/components/records";
import { TransferForm } from "@/components/forms/transfer-form";

export default function TransfersPage() {
  const { userById, meId } = useLookups();
  const q = useRecords<Transfer>("transfers");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Transfer>();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-1">
      <p className="pb-2 text-sm text-muted-foreground">
        When one flatmate pays another directly, record it here. The payer&apos;s balance goes up and the receiver&apos;s goes down.
      </p>
      {q.isLoading && !q.data ? (
        [0, 1, 2].map((i) => <Skeleton key={i} className="mb-3 h-14" />)
      ) : items.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} text="No transfers yet." />
      ) : (
        <div className="divide-y">
          {items.map((t) => {
            const from = userById.get(t.fromUserId);
            const to = userById.get(t.toUserId);
            const mine = t.fromUserId === meId ? 1 : t.toUserId === meId ? -1 : 0;
            return (
              <RecordRow key={t.id} rec={t}>
                <div className="flex shrink-0 -space-x-2 pt-0.5">
                  <MemberAvatar name={from?.name ?? "?"} color={from?.color} className="size-8 text-xs ring-2 ring-background" />
                  <MemberAvatar name={to?.name ?? "?"} color={to?.color} className="size-8 text-xs ring-2 ring-background" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("flex items-center gap-1 font-medium", t.deletedAt && "line-through")}>
                    {from?.name} <ArrowRight className="size-3.5 text-muted-foreground" /> {to?.name}
                  </p>
                  {t.note && <p className="truncate text-xs text-muted-foreground">{t.note}</p>}
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(t.sentAt), "d MMM yyyy")} <RecordMeta rec={t} />
                  </p>
                </div>
                <p
                  className={cn(
                    "font-semibold tabular",
                    t.deletedAt && "line-through",
                    !t.deletedAt && mine > 0 && "text-positive",
                    !t.deletedAt && mine < 0 && "text-negative",
                  )}
                >
                  {formatTaka(t.amount)}
                </p>
                <RecordActions kind="transfers" rec={t} onEdit={() => (setEdit(t), setOpen(true))} />
              </RecordRow>
            );
          })}
        </div>
      )}
      <LoadMore query={q} />
      <Button
        size="lg"
        className="fixed right-4 bottom-20 z-20 size-14 rounded-full shadow-xl"
        onClick={() => (setEdit(undefined), setOpen(true))}
        aria-label="Record transfer"
      >
        <Plus className="size-6" />
      </Button>
      <TransferForm open={open} onOpenChange={setOpen} transfer={edit} />
    </div>
  );
}
