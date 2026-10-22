"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLookups, useRecordMutation, useSummary } from "@/hooks/use-data";
import type { RiceEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDrawer, fromDateInput, toDateInput } from "./shared";

/** "Turn done" for any turn tracker (Rice, Gas cylinder, Trash…). */
export function RiceForm({
  open,
  onOpenChange,
  entry,
  trackerId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entry?: RiceEntry;
  trackerId?: string;
}) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={entry ? "Edit turn" : "Turn done"}>
      {open && <RiceFields entry={entry} trackerId={trackerId} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function RiceFields({ entry, trackerId, onDone }: { entry?: RiceEntry; trackerId?: string; onDone: () => void }) {
  const { data } = useSummary();
  const { users, meId } = useLookups();
  const trackers = data?.trackers ?? [];
  const mutation = useRecordMutation();
  const [tracker, setTracker] = useState(entry?.trackerId ?? trackerId ?? trackers.find((t) => t.isDefault)?.id ?? "");
  const current = trackers.find((t) => t.id === tracker);
  const people = users.filter((u) => !current || current.memberIds.includes(u.id));
  const [userId, setUserId] = useState(entry?.userId ?? meId);
  const [note, setNote] = useState(entry?.note ?? "");
  const [date, setDate] = useState(toDateInput(entry?.givenAt));
  const chosen = people.some((u) => u.id === userId) ? userId : (people[0]?.id ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { trackerId: tracker, userId: chosen, note, givenAt: fromDateInput(date, entry?.givenAt), version: entry?.version };
    mutation.mutate(entry ? { op: "update", kind: "rice", id: entry.id, body } : { op: "create", kind: "rice", body }, {
      onSuccess: onDone,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label>What was done?</Label>
        <div className="flex flex-wrap gap-2">
          {trackers.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setTracker(t.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition active:scale-95",
                tracker === t.id ? "border-primary bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {t.emoji} {t.name}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="giver">Who did it?</Label>
        <select
          id="giver"
          value={chosen}
          onChange={(e) => setUserId(e.target.value)}
          className="h-10 w-full rounded-lg border bg-transparent px-2 text-sm dark:bg-input/30"
        >
          {people.map((u) => (
            <option key={u.id} value={u.id}>
              {u.id === meId ? `${u.name} (me)` : u.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="rnote">Note</Label>
          <Input id="rnote" value={note} maxLength={200} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rdate">Date</Label>
          <Input id="rdate" type="date" value={date} max={toDateInput()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending || !tracker || !chosen}>
        {mutation.isPending && <Loader2 className="animate-spin" />}
        {entry ? "Save changes" : "Save"}
      </Button>
    </form>
  );
}
