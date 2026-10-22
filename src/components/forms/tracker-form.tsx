"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useInvalidateAll, useLookups } from "@/hooks/use-data";
import type { Tracker } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/member-avatar";
import { FormDrawer } from "./shared";

const SUGGESTIONS = [
  { name: "Gas cylinder", emoji: "🔥" },
  { name: "Trash", emoji: "🗑️" },
  { name: "Cleaning", emoji: "🧹" },
  { name: "Water bottle", emoji: "💧" },
  { name: "Groceries run", emoji: "🛒" },
  { name: "Dishes", emoji: "🍽️" },
];
const EMOJIS = ["🔁", "🔥", "🗑️", "🧹", "💧", "🛒", "🍽️", "🧺", "🧴", "💡", "🥚", "🍞", "🧻", "🚿", "🌿", "🍚"];

/** Create or edit a custom turn tracker (who takes part, name, emoji). */
export function TrackerForm({
  open,
  onOpenChange,
  tracker,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tracker?: Tracker;
  onSaved?: (id: string) => void;
}) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={tracker ? "Edit tracker" : "New turn tracker"}
      description="For anything people take turns at: everyone does it once per cycle, in any order."
    >
      {open && (
        <TrackerFields
          tracker={tracker}
          onDone={(id) => {
            onOpenChange(false);
            onSaved?.(id);
          }}
        />
      )}
    </FormDrawer>
  );
}

function TrackerFields({ tracker, onDone }: { tracker?: Tracker; onDone: (id: string) => void }) {
  const { users } = useLookups();
  const invalidate = useInvalidateAll();
  const [name, setName] = useState(tracker?.name ?? "");
  const [emoji, setEmoji] = useState(tracker?.emoji ?? "🔁");
  const [everyone, setEveryone] = useState(tracker ? tracker.everyone : true);
  const [members, setMembers] = useState<string[]>(tracker?.memberIds ?? users.map((u) => u.id));
  const [busy, setBusy] = useState(false);
  const fixedMembers = tracker?.isDefault; // Rice always includes everyone

  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give it a name");
    if (!everyone && members.length < 2) return toast.error("Pick at least two people");
    setBusy(true);
    try {
      const body = { name, emoji, memberIds: everyone || fixedMembers ? null : members };
      const saved = await api<{ id: string }>(tracker ? `/api/trackers/${tracker.id}` : "/api/trackers", {
        method: tracker ? "PATCH" : "POST",
        body,
      });
      toast.success(tracker ? "Tracker updated" : `${emoji} ${name} tracker created`);
      invalidate();
      onDone(saved.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {!tracker && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              type="button"
              key={s.name}
              onClick={() => (setName(s.name), setEmoji(s.emoji))}
              className="rounded-full border bg-card px-3 py-1 text-sm transition active:scale-95"
            >
              {s.emoji} {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="t-name">Name</Label>
        <Input id="t-name" value={name} maxLength={30} placeholder="e.g. Gas cylinder" onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Icon</Label>
        <div className="grid grid-cols-8 gap-1">
          {EMOJIS.map((e) => (
            <button
              type="button"
              key={e}
              onClick={() => setEmoji(e)}
              className={cn("rounded-xl p-1.5 text-2xl transition active:scale-90", emoji === e && "bg-primary/15 ring-2 ring-primary")}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {!fixedMembers && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Who takes part?</Label>
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setEveryone((v) => !v)}>
              {everyone ? "Choose people" : "Everyone"}
            </button>
          </div>
          {everyone ? (
            <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">
              Everyone in the house, including people who join later.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {users.map((u) => {
                const on = members.includes(u.id);
                return (
                  <li key={u.id}>
                    <button type="button" onClick={() => toggle(u.id)} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left", !on && "opacity-50")}>
                      <UserAvatar user={u} className="size-7 text-xs" />
                      <span className="flex-1 text-sm">{u.name}</span>
                      <span className={cn("flex size-5 items-center justify-center rounded-md border", on && "border-primary bg-primary text-primary-foreground")}>
                        {on && <Check className="size-3.5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {tracker ? "Save changes" : "Create tracker"}
      </Button>
    </form>
  );
}
