"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, Plus, Receipt, Wheat } from "lucide-react";
import { useLookups, useRecords, useSummary } from "@/hooks/use-data";
import { formatTaka, settlePlan } from "@/lib/money";
import type { Expense } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberAvatar } from "@/components/member-avatar";
import { ExpenseItem } from "@/components/expense-item";
import { EmptyState } from "@/components/records";
import { ExpenseForm } from "@/components/forms/expense-form";
import { TransferForm, type TransferDraft } from "@/components/forms/transfer-form";
import { RiceForm } from "@/components/forms/rice-form";

export default function HomePage() {
  const { data } = useSummary();
  const { userById, meId, name } = useLookups();
  const recent = useRecords<Expense>("expenses", { limit: "5" });
  const [form, setForm] = useState<null | "expense" | "transfer" | "rice">(null);
  const [edit, setEdit] = useState<Expense>();
  const [draft, setDraft] = useState<TransferDraft>();

  if (!data) return <HomeSkeleton />;

  const balances = [...data.balances].sort((a, b) => b.balance - a.balance);
  const mine = data.balances.find((b) => b.id === meId)?.balance ?? 0;
  const maxAbs = Math.max(1, ...balances.map((b) => Math.abs(b.balance)));
  const plan = settlePlan(data.balances);
  const myRice = data.rice.members[meId];

  return (
    <div className="space-y-5">
      <Card className="rise overflow-hidden border-0 bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg">
        <CardContent className="space-y-1 py-1">
          <p className="text-sm text-white/80">{mine >= 0 ? "You should get back" : "You owe the flat"}</p>
          <p className="text-4xl font-bold tracking-tight tabular">{formatTaka(Math.abs(mine))}</p>
          {myRice && (
            <p className="pt-1 text-sm text-white/80">
              🍚 Rice: {myRice.owed > 0 ? `you need to give ${myRice.owed}×` : "you're all caught up"}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <QuickAction icon={Receipt} label="Expense" onClick={() => (setEdit(undefined), setForm("expense"))} />
        <QuickAction icon={ArrowLeftRight} label="Transfer" onClick={() => (setDraft(undefined), setForm("transfer"))} />
        <QuickAction icon={Wheat} label="Rice given" onClick={() => setForm("rice")} />
      </div>

      <Card className="rise">
        <CardHeader>
          <CardTitle className="text-base">Balances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {balances.map((b) => {
            const u = userById.get(b.id);
            const pct = (Math.abs(b.balance) / maxAbs) * 50;
            return (
              <div key={b.id} className="flex items-center gap-3">
                <MemberAvatar name={u?.name ?? "?"} color={u?.color} className="size-8 text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="truncate">
                      {u?.name}
                      {b.id === meId && <span className="text-muted-foreground"> (me)</span>}
                    </span>
                    <span className={cn("font-medium tabular", b.balance > 0 ? "text-positive" : b.balance < 0 && "text-negative")}>
                      {formatTaka(b.balance, { sign: true })}
                    </span>
                  </div>
                  <div className="relative mt-1 h-1.5 rounded-full bg-muted">
                    <div className="absolute top-0 left-1/2 h-full w-px bg-border" />
                    <div
                      className={cn(
                        "absolute top-0 h-full rounded-full transition-all duration-700",
                        b.balance >= 0 ? "left-1/2 bg-positive" : "right-1/2 bg-negative",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {plan.length > 0 && (
        <Card className="rise">
          <CardHeader>
            <CardTitle className="text-base">Settle up</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {plan.map((p) => (
              <div key={p.from + p.to} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{name(p.from)}</span>
                <ArrowRight className="size-4 text-muted-foreground" />
                <span className="flex-1 font-medium">{name(p.to)}</span>
                <span className="tabular">{formatTaka(p.amount)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraft({ fromUserId: p.from, toUserId: p.to, amount: p.amount, note: "Settle up" });
                    setForm("transfer");
                  }}
                >
                  Paid
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <section className="rise">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold">Recent expenses</h2>
          <Link href="/expenses" className="text-sm text-primary">
            See all
          </Link>
        </div>
        <div className="divide-y">
          {recent.data?.pages[0]?.items.map((e) => (
            <ExpenseItem key={e.id} e={e} onEdit={() => (setEdit(e), setForm("expense"))} />
          ))}
          {recent.data && !recent.data.pages[0]?.items.length && <EmptyState icon={Receipt} text="No expenses yet. Add the first one!" />}
        </div>
      </section>

      <Button
        size="lg"
        className="fixed right-4 bottom-20 z-20 size-14 rounded-full shadow-xl"
        onClick={() => (setEdit(undefined), setForm("expense"))}
        aria-label="Add expense"
      >
        <Plus className="size-6" />
      </Button>

      <ExpenseForm open={form === "expense"} onOpenChange={(o) => !o && setForm(null)} expense={edit} />
      <TransferForm open={form === "transfer"} onOpenChange={(o) => !o && setForm(null)} draft={draft} />
      <RiceForm open={form === "rice"} onOpenChange={(o) => !o && setForm(null)} />
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-xl border bg-card py-3 text-xs font-medium transition active:scale-95"
    >
      <Icon className="size-5 text-primary" />
      {label}
    </button>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
