"use client";

import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Check, Info, Plus, Wheat } from "lucide-react";
import { useLookups, useRecords, useSummary } from "@/hooks/use-data";
import type { RiceEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberAvatar } from "@/components/member-avatar";
import { EmptyState, LoadMore, RecordActions, RecordMeta, RecordRow } from "@/components/records";
import { RiceForm } from "@/components/forms/rice-form";

export default function RicePage() {
  const { data } = useSummary();
  const { users, name, meId } = useLookups();
  const entries = useRecords<RiceEntry>("rice");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<RiceEntry>();

  if (!data) return <Skeleton className="h-64" />;
  const rice = data.rice;
  const givenCount = users.filter((u) => rice.members[u.id]?.gaveThisCycle).length;
  const items = entries.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <Card className="rise">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Cycle {rice.cycleNo}</span>
            <Badge variant="secondary">
              {givenCount}/{users.length} given
            </Badge>
          </CardTitle>
          <CardDescription>Everyone gives rice once per cycle, in any order.</CardDescription>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${users.length ? (givenCount / users.length) * 100 : 0}%` }}
            />
          </div>
        </CardHeader>
        <CardContent className="divide-y">
          {users.map((u) => {
            const s = rice.members[u.id];
            if (!s) return null;
            return (
              <div key={u.id} className="flex items-center gap-3 py-2.5">
                <MemberAvatar name={u.name} color={u.color} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {u.name}
                    {u.id === meId && <span className="text-muted-foreground"> (me)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Given {s.totalGiven}× · Skipped {s.skips} cycle{s.skips === 1 ? "" : "s"}
                    {s.lastGivenAt && ` · last ${formatDistanceToNow(new Date(s.lastGivenAt), { addSuffix: true })}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {s.gaveThisCycle ? (
                    <Badge className="bg-positive/15 text-positive">
                      <Check /> Given
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
      </Card>

      <Tabs defaultValue="log">
        <TabsList className="w-full">
          <TabsTrigger value="log">Log</TabsTrigger>
          <TabsTrigger value="cycles">Cycles</TabsTrigger>
          <TabsTrigger value="rules">How it works</TabsTrigger>
        </TabsList>

        <TabsContent value="log">
          {items.length === 0 && !entries.isLoading ? (
            <EmptyState icon={Wheat} text="No rice given yet." />
          ) : (
            <div className="divide-y">
              {items.map((r) => (
                <RecordRow key={r.id} rec={r}>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-lg">🍚</div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", r.deletedAt && "line-through")}>{name(r.userId)} gave rice</p>
                    {r.note && <p className="truncate text-xs text-muted-foreground">{r.note}</p>}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(r.givenAt), "d MMM yyyy")}
                      {!r.deletedAt && rice.entryCycle[r.id] && ` · cycle ${rice.entryCycle[r.id]}`} <RecordMeta rec={r} />
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
          {rice.cycles.map((c) => (
            <div key={c.no} className="rounded-xl border p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">Cycle {c.no}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(c.startedAt), "d MMM")} – {c.endedAt ? format(new Date(c.endedAt), "d MMM yyyy") : "now"}
                </span>
              </div>
              <p className="mt-1 text-xs">
                <span className="text-positive">Gave:</span> {c.givers.map(name).join(", ") || "—"}
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
              <Info className="size-4 shrink-0" /> Rules
            </p>
            <p>• When a cycle starts, everyone&apos;s owed count goes up by 1.</p>
            <p>• Giving rice lowers your owed count by 1.</p>
            <p>
              • If you already gave this cycle and owe nothing, giving again starts a <b>new cycle</b>. Everyone gets +1
              and your gift counts toward it.
            </p>
            <p>• Anyone who didn&apos;t give before a cycle ended is marked as having skipped it.</p>
            <p>• Rice is tracked separately and never affects money balances.</p>
          </div>
        </TabsContent>
      </Tabs>

      <Button
        size="lg"
        className="fixed right-4 bottom-20 z-20 size-14 rounded-full shadow-xl"
        onClick={() => (setEdit(undefined), setOpen(true))}
        aria-label="Record rice given"
      >
        <Plus className="size-6" />
      </Button>
      <RiceForm open={open} onOpenChange={setOpen} entry={edit} />
    </div>
  );
}
