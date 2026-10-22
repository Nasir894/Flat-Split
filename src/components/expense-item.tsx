"use client";

import { format } from "date-fns";
import { useLookups } from "@/hooks/use-data";
import { formatTaka } from "@/lib/money";
import type { Expense } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RecordActions, RecordMeta, RecordRow } from "./records";

export function ExpenseItem({ e, onEdit }: { e: Expense; onEdit: () => void }) {
  const { name, catById, meId, users } = useLookups();
  const cat = e.categoryId ? catById.get(e.categoryId) : undefined;
  const myShare = e.shares.find((s) => s.userId === meId)?.amount ?? 0;
  const myEffect = (e.payerId === meId ? e.amount : 0) - myShare;
  const everyone = e.shares.length === users.length;

  return (
    <RecordRow rec={e}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg">{cat?.emoji ?? "🧾"}</div>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", e.deletedAt && "line-through")}>{e.description || cat?.name || "Expense"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {name(e.payerId)} paid · {everyone ? "split with everyone" : `split ${e.shares.map((s) => name(s.userId)).join(", ")}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(e.spentAt), "d MMM")} <RecordMeta rec={e} />
        </p>
      </div>
      <div className="text-right">
        <p className={cn("font-semibold tabular", e.deletedAt && "line-through")}>{formatTaka(e.amount)}</p>
        {!e.deletedAt && myEffect !== 0 && (
          <p className={cn("text-xs tabular", myEffect > 0 ? "text-positive" : "text-negative")}>
            {formatTaka(myEffect, { sign: true })}
          </p>
        )}
      </div>
      <RecordActions kind="expenses" rec={e} onEdit={onEdit} />
    </RecordRow>
  );
}
