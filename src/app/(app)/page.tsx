"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, ChevronRight, Clock, Receipt, Wheat } from "lucide-react";
import { useLookups, useRecords, useSummary } from "@/hooks/use-data";
import { formatTaka, settlePlan } from "@/lib/money";
import type { Expense, Transfer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/member-avatar";
import { ExpenseItem } from "@/components/expense-item";
import { TransferItem } from "@/components/transfer-item";
import { EmptyState } from "@/components/records";
import { ExpenseForm } from "@/components/forms/expense-form";
import { TransferForm, type TransferDraft } from "@/components/forms/transfer-form";
import { useQuickAdd } from "@/components/quick-add";
import { JoinRequests } from "@/components/join-requests";
import { Amount } from "@/components/amount";

type Feed = "all" | "expenses" | "transfers";

export default function HomePage() {
  const { data } = useSummary();
  const { userById, meId, name } = useLookups();
  const expenses = useRecords<Expense>("expenses", { limit: "6" });
  const transfers = useRecords<Transfer>("transfers", { limit: "6" });
  const quickAdd = useQuickAdd();
  const [form, setForm] = useState<null | "expense" | "transfer">(null);
  const [editExpense, setEditExpense] = useState<Expense>();
  const [editTransfer, setEditTransfer] = useState<Transfer>();
  const [draft, setDraft] = useState<TransferDraft>();
  const [feed, setFeed] = useState<Feed>("all");

  if (!data) return <HomeSkeleton />;

  const balances = [...data.balances].sort((a, b) => b.balance - a.balance);
  const mine = data.balances.find((b) => b.id === meId)?.balance ?? 0;
  const maxAbs = Math.max(1, ...balances.map((b) => Math.abs(b.balance)));
  const plan = settlePlan(data.balances);
  const myRice = data.rice.members[meId];
  const awaiting = data.awaitingMe ?? [];

  // Expenses and transfers in one timeline, newest first.
  const ex = (expenses.data?.pages[0]?.items ?? []).map((e) => ({ kind: "expense" as const, at: e.spentAt, e }));
  const tr = (transfers.data?.pages[0]?.items ?? []).map((t) => ({ kind: "transfer" as const, at: t.sentAt, t }));
  const timeline = (feed === "expenses" ? ex : feed === "transfers" ? tr : [...ex, ...tr])
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 8);
  const loadingFeed = !expenses.data || !transfers.data;

  return (
    <div className="space-y-5">
      <JoinRequests />

      {/* Hero */}
      <section className="rise px-1 pt-2 pb-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-foreground/65">{mine === 0 ? "You're all settled" : mine > 0 ? "You get back" : "You owe the flat"}</p>
          <span className="glass rounded-full px-3 py-1 text-xs font-medium">
            {mine > 0 ? "Credit" : mine < 0 ? "Due" : "Settled"}
          </span>
        </div>
        <Amount poisha={Math.abs(mine)} className="mt-1 block text-[2.9rem] leading-tight font-bold" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/rice" className="glass flex items-center gap-2.5 rounded-2xl p-2.5 transition active:scale-[0.98]">
            <span className="flex size-9 items-center justify-center rounded-full bg-foreground/10 text-lg">🍚</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Rice</span>
              <span className="block truncate text-[11px] text-foreground/60">
                {myRice ? (myRice.owed > 0 ? `Give ${myRice.owed}×` : "Up to date") : "—"}
              </span>
            </span>
            <ChevronRight className="size-4 text-foreground/50" />
          </Link>
          <Link href="/transfers" className="glass flex items-center gap-2.5 rounded-2xl p-2.5 transition active:scale-[0.98]">
            <span className="flex size-9 items-center justify-center rounded-full bg-brand text-brand-foreground">
              <Clock className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Pending</span>
              <span className="block truncate text-[11px] text-foreground/60">
                {awaiting.length ? `${awaiting.length} to confirm` : "Nothing waiting"}
              </span>
            </span>
            <ChevronRight className="size-4 text-foreground/50" />
          </Link>
        </div>
      </section>

      {/* Payments waiting for my OK */}
      {awaiting.length > 0 && (
        <Card className="rise border-brand/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="size-2 animate-pulse rounded-full bg-brand" /> Confirm payments to you
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {awaiting.map((t) => (
              <TransferItem key={t.id} t={t} onEdit={() => (setEditTransfer(t), setForm("transfer"))} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-2">
        <QuickAction icon={Receipt} label="Add Expense" onClick={() => quickAdd("expense")} />
        <QuickAction icon={ArrowLeftRight} label="Send Money" onClick={() => quickAdd("transfer")} />
        <QuickAction icon={Wheat} label="Rice Given" onClick={() => quickAdd("rice")} />
      </div>

      {/* Balances */}
      <Card className="rise">
        <CardHeader>
          <CardTitle className="text-base">Balances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3.5">
          {balances.map((b) => {
            const u = userById.get(b.id);
            const pct = (Math.abs(b.balance) / maxAbs) * 50;
            return (
              <div key={b.id} className="flex items-center gap-3">
                <UserAvatar user={u} className="size-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="truncate font-medium">
                      {u?.name}
                      {b.id === meId && <span className="font-normal text-muted-foreground"> (me)</span>}
                    </span>
                    <span className={cn("font-semibold tabular", b.balance > 0 ? "text-positive" : b.balance < 0 && "text-negative")}>
                      {formatTaka(b.balance, { sign: true })}
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-1.5 rounded-full bg-muted">
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
          <CardContent className="space-y-2.5">
            {plan.map((p) => (
              <div key={p.from + p.to} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{name(p.from)}</span>
                <ArrowRight className="size-4 text-muted-foreground" />
                <span className="flex-1 font-medium">{name(p.to)}</span>
                <span className="font-semibold tabular">{formatTaka(p.amount)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    setEditTransfer(undefined);
                    setDraft({ fromUserId: p.from, toUserId: p.to, amount: p.amount, note: "Settle up" });
                    setForm("transfer");
                  }}
                >
                  Paid
                </Button>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-muted-foreground">A payment counts once the receiver confirms it.</p>
          </CardContent>
        </Card>
      )}

      {/* Recent activity: expenses + transfers */}
      <section className="rise">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Recent activity</h2>
          <Link href={feed === "transfers" ? "/transfers" : "/expenses"} className="text-sm text-muted-foreground">
            See all
          </Link>
        </div>
        <div className="mb-1 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {(["all", "expenses", "transfers"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFeed(f)}
              className={cn(
                "rounded-lg py-1.5 text-xs font-medium capitalize transition-all",
                feed === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="divide-y">
          {loadingFeed && !timeline.length
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="my-3 h-12" />)
            : timeline.map((item) =>
                item.kind === "expense" ? (
                  <ExpenseItem key={"e" + item.e.id} e={item.e} onEdit={() => (setEditExpense(item.e), setForm("expense"))} />
                ) : (
                  <TransferItem key={"t" + item.t.id} t={item.t} onEdit={() => (setEditTransfer(item.t), setDraft(undefined), setForm("transfer"))} />
                ),
              )}
          {!loadingFeed && !timeline.length && <EmptyState icon={Receipt} text="Nothing here yet. Tap + to add the first one!" />}
        </div>
      </section>

      <ExpenseForm open={form === "expense"} onOpenChange={(o) => !o && setForm(null)} expense={editExpense} />
      <TransferForm open={form === "transfer"} onOpenChange={(o) => !o && setForm(null)} transfer={editTransfer} draft={draft} />
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-3.5 text-xs font-medium transition active:scale-95"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-foreground text-background">
        <Icon className="size-4" />
      </span>
      {label}
    </button>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-48 rounded-[1.75rem]" />
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}
