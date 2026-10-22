"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { History, Pencil, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { markSeen } from "@/lib/seen";
import { byDay, dayLabel } from "@/lib/dates";
import type { AuditEntry, Page } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLookups } from "@/hooks/use-data";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, HistoryDialog, LoadMore } from "@/components/records";

const ICON = { create: Plus, update: Pencil, delete: Trash2, restore: RotateCcw, import: Upload };
const TONE = {
  create: "bg-positive/15 text-positive",
  update: "bg-chart-1/15 text-chart-1",
  delete: "bg-negative/15 text-negative",
  restore: "bg-chart-4/15 text-chart-4",
  import: "bg-chart-7/15 text-chart-7",
};
const VERB = { create: "added", update: "edited", delete: "deleted", restore: "restored", import: "imported a backup" };
const WHAT: Record<string, string> = {
  expense: "an expense",
  transfer: "a transfer",
  rice: "a rice entry",
  category: "a category",
  user: "",
  backup: "",
};

export default function ActivityPage() {
  const { name } = useLookups();
  const [open, setOpen] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ["activity"],
    queryFn: ({ pageParam }) => api<Page<AuditEntry>>(`/api/activity${pageParam ? `?cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (l) => (l.nextCursor ? String(l.nextCursor) : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const newest = items[0]?.id;
  useEffect(() => markSeen("activity", newest), [newest]);

  if (q.isLoading && !q.data) return <Skeleton className="h-64" />;
  if (!items.length) return <EmptyState icon={History} text="Nothing has happened yet." />;

  return (
    <div>
      <p className="pb-3 text-sm text-muted-foreground">
        A permanent record of every change. It can&apos;t be edited or erased. Tap an entry to see what changed.
      </p>
      {byDay(items, (a) => a.createdAt).map((g) => (
        <section key={g.day} className="mb-3">
          <p className="py-1 text-xs font-medium text-muted-foreground">{dayLabel(g.items[0].createdAt)}</p>
          <ul className="space-y-1">
            {g.items.map((a) => {
              const Icon = ICON[a.action];
              const tappable = a.entityId && !["user", "backup"].includes(a.entity);
              return (
                <li key={a.id}>
                  <button
                    disabled={!tappable}
                    onClick={() => setOpen(a.entityId)}
                    className="rise flex w-full items-start gap-3 rounded-xl p-2 text-left transition enabled:active:bg-muted"
                  >
                    <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", TONE[a.action])}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{name(a.actorId)}</span> {VERB[a.action]} {WHAT[a.entity]}
                      <span className="block truncate text-xs text-muted-foreground">{a.summary}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{format(new Date(a.createdAt), "h:mm a")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <LoadMore query={q} />
      <HistoryDialog entityId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
