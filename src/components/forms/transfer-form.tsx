"use client";

import { useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLookups, useRecordMutation } from "@/hooks/use-data";
import { toPoisha } from "@/lib/money";
import type { Transfer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput, cleanAmount, FormDrawer, fromDateInput, toDateInput } from "./shared";

export type TransferDraft = { fromUserId?: string; toUserId?: string; amount?: number; note?: string };

export function TransferForm({
  open,
  onOpenChange,
  transfer,
  draft,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transfer?: Transfer;
  draft?: TransferDraft;
}) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={transfer ? "Edit transfer" : "Record a transfer"}
      description="Money handed from one flatmate to another (e.g. settling up)."
    >
      {open && <TransferFields transfer={transfer} draft={draft} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function TransferFields({ transfer, draft, onDone }: { transfer?: Transfer; draft?: TransferDraft; onDone: () => void }) {
  const { users, meId } = useLookups();
  const mutation = useRecordMutation();
  const init = transfer ?? draft;
  const [amount, setAmount] = useState(init?.amount ? String(init.amount / 100) : "");
  const [fromUserId, setFrom] = useState(init?.fromUserId ?? meId);
  const [toUserId, setTo] = useState(init?.toUserId ?? users.find((u) => u.id !== meId)?.id ?? "");
  const [note, setNote] = useState(init?.note ?? "");
  const [date, setDate] = useState(toDateInput(transfer?.sentAt));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const total = toPoisha(amount || 0);
    if (total <= 0) return toast.error("Enter an amount");
    if (fromUserId === toUserId) return toast.error("Pick two different people");
    const body = { fromUserId, toUserId, amount: total, note, sentAt: fromDateInput(date, transfer?.sentAt), version: transfer?.version };
    mutation.mutate(
      transfer ? { op: "update", kind: "transfers", id: transfer.id, body } : { op: "create", kind: "transfers", body },
      { onSuccess: onDone },
    );
  };

  const select = (id: string, value: string, set: (v: string) => void) => (
    <select
      id={id}
      value={value}
      onChange={(e) => set(e.target.value)}
      className="h-10 w-full rounded-lg border bg-transparent px-2 text-sm dark:bg-input/30"
    >
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.id === meId ? `${u.name} (me)` : u.name}
        </option>
      ))}
    </select>
  );

  return (
    <form onSubmit={submit} className="space-y-5">
      <AmountInput value={amount} onChange={(e) => setAmount(cleanAmount(e.target.value))} autoFocus={!init?.amount} />
      <div className="space-y-2">
        <Label htmlFor="from">From (who paid)</Label>
        {select("from", fromUserId, setFrom)}
        <ArrowDown className="mx-auto size-4 text-muted-foreground" />
        <Label htmlFor="to">To (who received)</Label>
        {select("to", toUserId, setTo)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="note">Note</Label>
          <Input id="note" value={note} maxLength={200} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tdate">Date</Label>
          <Input id="tdate" type="date" value={date} max={toDateInput()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 className="animate-spin" />}
        {transfer ? "Save changes" : "Record transfer"}
      </Button>
    </form>
  );
}
