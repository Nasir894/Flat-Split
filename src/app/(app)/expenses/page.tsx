"use client";

import { useState } from "react";
import { Plus, Receipt } from "lucide-react";
import { useLookups, useRecords } from "@/hooks/use-data";
import { formatTaka } from "@/lib/money";
import type { Expense } from "@/lib/types";
import { byDay, dayLabel } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/chip";
import { ExpenseItem } from "@/components/expense-item";
import { EmptyState, LoadMore } from "@/components/records";
import { ExpenseForm } from "@/components/forms/expense-form";

export default function ExpensesPage() {
  const { activeCategories } = useLookups();
  const [category, setCategory] = useState<string>();
  const q = useRecords<Expense>("expenses", { category });
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Expense>();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Chip active={!category} onClick={() => setCategory(undefined)}>
          All
        </Chip>
        {activeCategories.map((c) => (
          <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
            {c.emoji} {c.name}
          </Chip>
        ))}
      </div>

      {q.isLoading && !q.data ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Receipt} text="No expenses here yet." />
      ) : (
        byDay(items, (e) => e.spentAt).map((g) => (
          <section key={g.day}>
            <div className="sticky top-[53px] z-10 -mx-4 flex justify-between bg-background/90 px-4 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <span>{dayLabel(g.items[0].spentAt)}</span>
              <span className="tabular">
                {formatTaka(g.items.filter((e) => !e.deletedAt).reduce((s, e) => s + e.amount, 0))}
              </span>
            </div>
            <div className="divide-y">
              {g.items.map((e) => (
                <ExpenseItem key={e.id} e={e} onEdit={() => (setEdit(e), setOpen(true))} />
              ))}
            </div>
          </section>
        ))
      )}
      <LoadMore query={q} />

      <Button
        size="lg"
        className="fixed right-4 bottom-20 z-20 size-14 rounded-full shadow-xl"
        onClick={() => (setEdit(undefined), setOpen(true))}
        aria-label="Add expense"
      >
        <Plus className="size-6" />
      </Button>
      <ExpenseForm open={open} onOpenChange={setOpen} expense={edit} />
    </div>
  );
}
