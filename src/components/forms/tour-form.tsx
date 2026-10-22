"use client";

import { useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatTaka, toPoisha } from "@/lib/money";
import { useInvalidateAll, useLookups } from "@/hooks/use-data";
import type { TourBrief, TourPlanItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/member-avatar";
import { cleanAmount, FormDrawer } from "./shared";

const EMOJIS = ["🧳", "🏖️", "⛰️", "🏕️", "🚌", "✈️", "🚆", "🛶", "🌴", "🏞️", "🎉", "🍜"];
type Line = { label: string; categoryId: string; amount: string };

/** Plan a tour (or edit one). Planning never starts it; a home sharer starts it later. */
export function TourForm({
  open,
  onOpenChange,
  tour,
  plan,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tour?: TourBrief;
  plan?: TourPlanItem[];
  onSaved?: (id: string) => void;
}) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={tour ? "Edit tour" : "Plan a tour"}
      description={tour ? undefined : "Saving a plan doesn't start the tour: start it when you actually leave."}
    >
      {open && (
        <TourFields
          tour={tour}
          plan={plan}
          onDone={(id) => {
            onOpenChange(false);
            onSaved?.(id);
          }}
        />
      )}
    </FormDrawer>
  );
}

function TourFields({ tour, plan, onDone }: { tour?: TourBrief; plan?: TourPlanItem[]; onDone: (id: string) => void }) {
  const { users, guests, meId, activeCategories, catById } = useLookups();
  const invalidate = useInvalidateAll();
  const [name, setName] = useState(tour?.name ?? "");
  const [emoji, setEmoji] = useState(tour?.emoji ?? "🧳");
  const [startDate, setStartDate] = useState(tour?.startDate ?? "");
  const [endDate, setEndDate] = useState(tour?.endDate ?? "");
  const [notes, setNotes] = useState(tour?.notes ?? "");
  const [people, setPeople] = useState<string[]>(tour?.participantIds ?? [meId]);
  const [lines, setLines] = useState<Line[]>(
    plan?.length
      ? plan.map((p) => ({ label: p.label, categoryId: p.categoryId ?? "", amount: String(p.amount / 100) }))
      : [{ label: "", categoryId: "", amount: "" }],
  );
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setPeople((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const budget = lines.reduce((s, l) => s + toPoisha(l.amount || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give the tour a name");
    if (!people.length) return toast.error("Add at least one person");
    setBusy(true);
    try {
      const body = {
        name,
        emoji,
        startDate: startDate || null,
        endDate: endDate || null,
        notes,
        participantIds: people,
        planItems: lines
          .filter((l) => l.label.trim() || l.amount)
          .map((l) => ({ label: l.label.trim() || (l.categoryId ? (catById.get(l.categoryId)?.name ?? "Item") : "Item"), categoryId: l.categoryId || null, amount: toPoisha(l.amount || 0) })),
      };
      const saved = await api<{ id: string }>(tour ? `/api/tours/${tour.id}` : "/api/tours", { method: tour ? "PATCH" : "POST", body });
      toast.success(tour ? "Tour updated" : `${emoji} ${name} planned`);
      invalidate();
      onDone(saved.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const personRow = (u: (typeof users)[number], guest: boolean) => {
    const on = people.includes(u.id);
    return (
      <li key={u.id}>
        <button type="button" onClick={() => toggle(u.id)} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left", !on && "opacity-50")}>
          <UserAvatar user={u} className="size-7 text-xs" />
          <span className="flex-1 text-sm">
            {u.name}
            {u.id === meId && <span className="text-muted-foreground"> (me)</span>}
          </span>
          {guest && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Guest</span>}
          <span className={cn("flex size-5 items-center justify-center rounded-md border", on && "border-primary bg-primary text-primary-foreground")}>
            {on && <Check className="size-3.5" />}
          </span>
        </button>
      </li>
    );
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex gap-2">
        <div className="space-y-2">
          <Label>Icon</Label>
          <select
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="h-9 rounded-lg border bg-transparent px-2 text-xl dark:bg-input/30"
            aria-label="Tour icon"
          >
            {EMOJIS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="tour-name">Tour name</Label>
          <Input id="tour-name" value={name} maxLength={60} placeholder="e.g. Cox's Bazar trip" onChange={(e) => setName(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="t-start">Planned start</Label>
          <Input id="t-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="t-end">Planned end</Label>
          <Input id="t-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Who&apos;s going?</Label>
        <ul className="divide-y rounded-xl border">
          {users.map((u) => personRow(u, false))}
          {guests.map((u) => personRow(u, true))}
        </ul>
        {!guests.length && (
          <p className="text-xs text-muted-foreground">
            Friends from outside the flat can join with the house code. Approve them as a <b>Guest</b> and they&apos;ll only
            see their tours.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label>Budget plan</Label>
          <span className="text-xs text-muted-foreground tabular">Total {formatTaka(budget)}</span>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_6.5rem_2rem] gap-2">
              <div className="space-y-1">
                <Input placeholder="e.g. Bus tickets" value={l.label} maxLength={80} onChange={(e) => setLine(i, { label: e.target.value })} />
                <select
                  value={l.categoryId}
                  onChange={(e) => setLine(i, { categoryId: e.target.value })}
                  className="h-8 w-full rounded-lg border bg-transparent px-2 text-xs text-muted-foreground dark:bg-input/30"
                  aria-label="Category to compare with"
                >
                  <option value="">No category</option>
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Input inputMode="decimal" placeholder="৳" value={l.amount} onChange={(e) => setLine(i, { amount: cleanAmount(e.target.value) })} />
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { label: "", categoryId: "", amount: "" }])}>
            <Plus /> Add line
          </Button>
          <p className="text-[11px] text-muted-foreground">Pick a category to compare a line with what you actually spend in it.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="t-notes">Notes</Label>
        <Textarea id="t-notes" value={notes} maxLength={1000} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {tour ? "Save changes" : "Save plan"}
      </Button>
    </form>
  );
}
