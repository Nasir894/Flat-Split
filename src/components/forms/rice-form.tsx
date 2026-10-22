"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLookups, useRecordMutation } from "@/hooks/use-data";
import type { RiceEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDrawer, fromDateInput, toDateInput } from "./shared";

export function RiceForm({
  open,
  onOpenChange,
  entry,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entry?: RiceEntry;
}) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={entry ? "Edit rice entry" : "Rice given"}>
      {open && <RiceFields entry={entry} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function RiceFields({ entry, onDone }: { entry?: RiceEntry; onDone: () => void }) {
  const { users, meId } = useLookups();
  const mutation = useRecordMutation();
  const [userId, setUserId] = useState(entry?.userId ?? meId);
  const [note, setNote] = useState(entry?.note ?? "");
  const [date, setDate] = useState(toDateInput(entry?.givenAt));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { userId, note, givenAt: fromDateInput(date, entry?.givenAt), version: entry?.version };
    mutation.mutate(
      entry ? { op: "update", kind: "rice", id: entry.id, body } : { op: "create", kind: "rice", body },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="giver">Who gave rice?</Label>
        <select
          id="giver"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="h-10 w-full rounded-lg border bg-transparent px-2 text-sm dark:bg-input/30"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.id === meId ? `${u.name} (me)` : u.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="rnote">Note</Label>
          <Input id="rnote" value={note} maxLength={200} placeholder="e.g. 25kg Miniket" onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rdate">Date</Label>
          <Input id="rdate" type="date" value={date} max={toDateInput()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 className="animate-spin" />}
        {entry ? "Save changes" : "Save"}
      </Button>
    </form>
  );
}
