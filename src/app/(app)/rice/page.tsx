"use client";

import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Check, Info, MoreVertical, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useInvalidateAll, useLookups, useRecords, useSummary } from "@/hooks/use-data";
import { api } from "@/lib/api";
import type { RiceEntry, Tracker } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserAvatar } from "@/components/member-avatar";
import { EmptyState, LoadMore, RecordActions, RecordMeta, RecordRow } from "@/components/records";
import { RiceForm } from "@/components/forms/rice-form";
import { TrackerForm } from "@/components/forms/tracker-form";
import { Chip } from "@/components/chip";

/** Turns: Rice plus any custom cyclic duties (gas cylinder, trash, cleaning…). */
export default function TurnsPage() {
  const { data } = useSummary();
  const { users, name, meId } = useLookups();
  const invalidate = useInvalidateAll();
  const [chosen, setChosen] = useState<string | null>(null);
  const trackers = data?.trackers ?? [];
  const tracker = trackers.find((t) => t.id === chosen) ?? trackers[0];
  const entries = useRecords<RiceEntry>("rice", { tracker: tracker?.id });
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<RiceEntry>();
  const [trackerForm, setTrackerForm] = useState<{ open: boolean; tracker?: Tracker }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!data || !tracker) return <Skeleton className="h-64" />;
  const st = tracker.status;
  const people = users.filter((u) => tracker.memberIds.includes(u.id));
  const doneCount = people.filter((u) => st.members[u.id]?.gaveThisCycle).length;
  const items = entries.data?.pages.flatMap((p) => p.items) ?? [];

  const removeTracker = async () => {
    try {
      await api(`/api/trackers/${tracker.id}`, { method: "DELETE" });
      toast.success(`Removed ${tracker.name}`);
      setChosen(null);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tracker switcher */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {trackers.map((t) => {
          const mine = t.status.members[meId]?.owed ?? 0;
          return (
            <Chip key={t.id} active={t.id === tracker.id} onClick={() => setChosen(t.id)}>
              {t.emoji} {t.name}
              {mine > 0 && <span className="ml-1 rounded-full bg-negative px-1.5 text-[10px] font-bold text-white">{mine}</span>}
            </Chip>
          );
        })}
        <button
          type="button"
          onClick={() => setTrackerForm({ open: true })}
          className="flex shrink-0 items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground"
        >
          <Plus className="size-3.5" /> New
        </button>
      </div>

      <Card className="rise">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="truncate">
              {tracker.emoji} {tracker.name} · Cycle {st.cycleNo}
            </span>
            <span className="flex items-center gap-1">
              <Badge variant="secondary">
                {doneCount}/{people.length} done
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" aria-label="Tracker options">
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setTrackerForm({ open: true, tracker })}>
                    <Pencil /> Edit tracker
                  </DropdownMenuItem>
                  {!tracker.isDefault && (
                    <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                      <Trash2 /> Remove tracker
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </CardTitle>
          <CardDescription>
            {tracker.everyone ? "Everyone takes" : `${people.length} people take`} a turn once per cycle, in any order.
          </CardDescription>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${people.length ? (doneCount / people.length) * 100 : 0}%` }}
            />
          </div>
        </CardHeader>
        <CardContent className="divide-y">
          {people.map((u) => {
            const s = st.members[u.id];
            if (!s) return null;
            return (
              <div key={u.id} className="flex items-center gap-3 py-2.5">
                <UserAvatar user={u} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {u.name}
                    {u.id === meId && <span className="text-muted-foreground"> (me)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Done {s.totalGiven}× · Skipped {s.skips} cycle{s.skips === 1 ? "" : "s"}
                    {s.lastGivenAt && ` · last ${formatDistanceToNow(new Date(s.lastGivenAt), { addSuffix: true })}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {s.gaveThisCycle ? (
                    <Badge className="bg-positive/15 text-positive">
                      <Check /> Done
                    </Badge>
                  ) : (
                    <Badge variant="outline">Pending</Badge>
                  )}
                  <span
                    className={cn(
                      "text-xs font-medium tabular",
                      s.owed > 0 ? "text-negative" : s.owed < 0 ? "text-positive" : "text-muted-foreground",
                    )}
                  >
                    {s.owed > 0 ? `Owes ${s.owed}×` : s.owed < 0 ? `${-s.owed}× ahead` : "Up to date"}
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
        <CardContent>
          <Button className="w-full" onClick={() => (setEdit(undefined), setOpen(true))}>
            {tracker.emoji} Mark a turn done
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="log">
        <TabsList className="w-full">
          <TabsTrigger value="log">Log</TabsTrigger>
          <TabsTrigger value="cycles">Cycles</TabsTrigger>
          <TabsTrigger value="rules">How it works</TabsTrigger>
        </TabsList>

        <TabsContent value="log">
          {items.length === 0 && !entries.isLoading ? (
            <EmptyState icon={Repeat} text={`No turns logged for ${tracker.name} yet.`} />
          ) : (
            <div className="divide-y">
              {items.map((r) => (
                <RecordRow key={r.id} rec={r}>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-lg">{tracker.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", r.deletedAt && "line-through")}>{name(r.userId)} did their turn</p>
                    {r.note && <p className="truncate text-xs text-muted-foreground">{r.note}</p>}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(r.givenAt), "d MMM yyyy")}
                      {!r.deletedAt && st.entryCycle[r.id] && ` · cycle ${st.entryCycle[r.id]}`} <RecordMeta rec={r} />
                    </p>
                  </div>
                  <RecordActions kind="rice" rec={r} onEdit={() => (setEdit(r), setOpen(true))} />
                </RecordRow>
              ))}
            </div>
          )}
          <LoadMore query={entries} />
        </TabsContent>

        <TabsContent value="cycles" className="space-y-2">
          {st.cycles.map((c) => (
            <div key={c.no} className="rounded-xl border p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">Cycle {c.no}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(c.startedAt), "d MMM")} – {c.endedAt ? format(new Date(c.endedAt), "d MMM yyyy") : "now"}
                </span>
              </div>
              <p className="mt-1 text-xs">
                <span className="text-positive">Done:</span> {c.givers.map(name).join(", ") || "—"}
              </p>
              {c.endedAt && (
                <p className="text-xs">
                  <span className="text-negative">Skipped:</span> {c.skippers.map(name).join(", ") || "nobody 🎉"}
                </p>
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="rules">
          <div className="space-y-2 rounded-xl border p-4 text-sm text-muted-foreground">
            <p className="flex gap-2 font-medium text-foreground">
              <Info className="size-4 shrink-0" /> Rules (same for every tracker)
            </p>
            <p>• When a cycle starts, every participant&apos;s owed count goes up by 1.</p>
            <p>• Doing your turn lowers your owed count by 1.</p>
            <p>
              • If you already did your turn this cycle and owe nothing, doing it again starts a <b>new cycle</b>.
              Everyone gets +1, and your turn counts toward it.
            </p>
            <p>• Anyone who didn&apos;t do their turn before a cycle ended is marked as having skipped it.</p>
            <p>• Turns are tracked separately and never affect money balances.</p>
          </div>
        </TabsContent>
      </Tabs>

      <RiceForm open={open} onOpenChange={setOpen} entry={edit} trackerId={tracker.id} />
      <TrackerForm
        open={trackerForm.open}
        tracker={trackerForm.tracker}
        onOpenChange={(o) => setTrackerForm((s) => ({ ...s, open: o }))}
        onSaved={(id) => setChosen(id)}
      />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {tracker.emoji} {tracker.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from Turns for everyone. Its history stays in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={removeTracker}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
