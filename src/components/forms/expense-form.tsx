"use client";

import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useLookups, useRecordMutation } from "@/hooks/use-data";
import { api } from "@/lib/api";
import { formatTaka, splitEqual, toPoisha } from "@/lib/money";
import type { Category, Expense } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/member-avatar";
import { AmountInput, cleanAmount, FormDrawer, fromDateInput, toDateInput } from "./shared";

// The last place someone added an expense to (home or an active tour) stays selected until they
// change it or the tour closes.
const TARGET_KEY = "fs_expense_target";

export function ExpenseForm({
  open,
  onOpenChange,
  expense,
  tourId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  expense?: Expense;
  /** Open straight on this tour (e.g. from the tour page). */
  tourId?: string;
}) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={expense ? "Edit expense" : "Add expense"}>
      {open && <ExpenseFields expense={expense} tourId={tourId} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function ExpenseFields({ expense, tourId, onDone }: { expense?: Expense; tourId?: string; onDone: () => void }) {
  const { users, meId, activeCategories, tours, isGuest, userById } = useLookups();
  const mutation = useRecordMutation();
  // Where this expense goes: "home" or an active tour I'm allowed to use.
  const activeTours = tours.filter((t) => t.status === "active" && (!isGuest || t.participantIds.includes(meId)));
  const [target, setTarget] = useState<string>(() => {
    if (expense) return expense.tourId ?? "home";
    if (tourId) return tourId;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(TARGET_KEY);
    } catch {}
    if (saved && activeTours.some((t) => t.id === saved)) return saved;
    return isGuest ? (activeTours[0]?.id ?? "home") : "home";
  });
  const tour = activeTours.find((t) => t.id === target) ?? tours.find((t) => t.id === target);
  const people =
    target === "home" ? users : ((tour?.participantIds ?? []).map((id) => userById.get(id)).filter(Boolean) as typeof users);
  const [amount, setAmount] = useState(expense ? String(expense.amount / 100) : "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(expense?.categoryId ?? null);
  const [payerId, setPayerId] = useState(expense?.payerId ?? meId);
  const [consumers, setConsumers] = useState<string[]>(expense?.shares.map((s) => s.userId) ?? people.map((u) => u.id));
  const [date, setDate] = useState(toDateInput(expense?.spentAt));

  const chooseTarget = (t: string) => {
    setTarget(t);
    const next = t === "home" ? users : ((tours.find((x) => x.id === t)?.participantIds ?? []).map((id) => userById.get(id)).filter(Boolean) as typeof users);
    // Default split: everyone in the new place; keep me as payer if I'm there.
    setConsumers(next.map((u) => u.id));
    setPayerId(next.some((u) => u.id === meId) ? meId : (next[0]?.id ?? meId));
  };

  const total = toPoisha(amount || 0);
  const shares = consumers.length && total > 0 ? splitEqual(total, consumers) : [];
  const toggle = (id: string) =>
    setConsumers((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (total <= 0) return toast.error("Enter an amount");
    if (!consumers.length) return toast.error("Pick who consumed it");
    const body = {
      payerId,
      amount: total,
      categoryId,
      description,
      spentAt: fromDateInput(date, expense?.spentAt),
      consumerIds: consumers,
      version: expense?.version,
      tourId: target === "home" ? null : target,
    };
    mutation.mutate(
      expense ? { op: "update", kind: "expenses", id: expense.id, body } : { op: "create", kind: "expenses", body },
      {
        onSuccess: () => {
          if (!expense) {
            try {
              localStorage.setItem(TARGET_KEY, target);
            } catch {}
          }
          onDone();
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Home or an active tour (locked when editing: an expense stays where it was added) */}
      {expense ? (
        expense.tourId && (
          <p className="rounded-xl border bg-card px-3 py-2 text-sm">
            {tour?.emoji} On tour: <b>{tour?.name}</b>
          </p>
        )
      ) : (
        (activeTours.length > 0 || isGuest) && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
            {!isGuest && (
              <TargetChip active={target === "home"} onClick={() => chooseTarget("home")}>
                🏠 Home
              </TargetChip>
            )}
            {activeTours.map((t) => (
              <TargetChip key={t.id} active={target === t.id} onClick={() => chooseTarget(t.id)}>
                {t.emoji} {t.name}
              </TargetChip>
            ))}
            {isGuest && !activeTours.length && <p className="text-sm text-muted-foreground">None of your tours is active right now.</p>}
          </div>
        )
      )}

      <AmountInput value={amount} onChange={(e) => setAmount(cleanAmount(e.target.value))} autoFocus={!expense} />

      <div className="space-y-2">
        <Label htmlFor="desc">What for?</Label>
        <Input
          id="desc"
          placeholder="e.g. Chicken 2kg"
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Category</Label>
        <CategoryPicker categories={activeCategories} value={categoryId} onChange={setCategoryId} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="payer">Paid by</Label>
          <select
            id="payer"
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
            className="h-9 w-full rounded-lg border bg-transparent px-2 text-sm dark:bg-input/30"
          >
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id === meId ? `${u.name} (me)` : u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={date} max={toDateInput()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Consumed by</Label>
          <button
            type="button"
            className="text-xs text-primary"
            onClick={() => setConsumers(consumers.length === people.length ? [] : people.map((u) => u.id))}
          >
            {consumers.length === people.length ? "Clear" : "Everyone"}
          </button>
        </div>
        <ul className="divide-y rounded-xl border">
          {people.map((u) => {
            const on = consumers.includes(u.id);
            const share = shares.find((s) => s.userId === u.id)?.amount ?? 0;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => toggle(u.id)}
                  className={cn("flex w-full items-center gap-3 px-3 py-2 text-left transition", !on && "opacity-50")}
                >
                  <UserAvatar user={u} className="size-7 text-xs" />
                  <span className="flex-1 text-sm">{u.name}</span>
                  <span className="text-sm tabular text-muted-foreground">{on && share ? formatTaka(share) : ""}</span>
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-md border",
                      on && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {on && <Check className="size-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {total > 0 && consumers.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {people.find((u) => u.id === payerId)?.name} gets back{" "}
            <span className="font-medium text-positive">
              {formatTaka(total - (shares.find((s) => s.userId === payerId)?.amount ?? 0))}
            </span>
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 className="animate-spin" />}
        {expense ? "Save changes" : "Add expense"}
      </Button>
    </form>
  );
}

function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await api<Category>("/api/categories", { body: { name, emoji: emoji || "🏷️" } });
      await qc.invalidateQueries({ queryKey: ["summary"] });
      onChange(c.id);
      setAdding(false);
      setName("");
      setEmoji("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => onChange(value === c.id ? null : c.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition active:scale-95",
              value === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            {c.emoji} {c.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground"
        >
          <Plus className="size-3.5" /> Custom
        </button>
      </div>
      {adding && (
        <div className="flex gap-2">
          <Input className="w-14 text-center" placeholder="🏷️" value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} />
          <Input placeholder="Category name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          <Button type="button" onClick={add} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : "Add"}
          </Button>
        </div>
      )}
    </div>
  );
}

function TargetChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition active:scale-95",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card",
      )}
    >
      {children}
    </button>
  );
}