"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useRecords } from "@/hooks/use-data";
import type { Transfer } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, LoadMore } from "@/components/records";
import { TransferForm } from "@/components/forms/transfer-form";
import { MoneyTabs } from "@/components/money-tabs";
import { TransferItem } from "@/components/transfer-item";

export default function TransfersPage() {
  const q = useRecords<Transfer>("transfers");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Transfer>();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-1">
      <MoneyTabs />
      <p className="pt-2 pb-2 text-sm text-muted-foreground">
        When one flatmate pays another directly, record it here. It counts once the person who received the money
        confirms it.
      </p>
      {q.isLoading && !q.data ? (
        [0, 1, 2].map((i) => <Skeleton key={i} className="mb-3 h-14" />)
      ) : items.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} text="No transfers yet." />
      ) : (
        <div className="divide-y">
          {items.map((t) => (
            <TransferItem key={t.id} t={t} onEdit={() => (setEdit(t), setOpen(true))} />
          ))}
        </div>
      )}
      <LoadMore query={q} />
      <TransferForm open={open} onOpenChange={setOpen} transfer={edit} />
    </div>
  );
}
