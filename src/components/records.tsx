"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { History, Loader2, MoreVertical, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import type { AuditEntry, Page } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type Kind, useLookups, useRecordMutation } from "@/hooks/use-data";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Rec = { id: string; version: number; deletedAt: string | null; deletedBy: string | null; updatedAt: string | null; updatedBy: string | null };

/** Row wrapper: deleted records stay visible but greyed out with who deleted them. */
export function RecordRow({ rec, children }: { rec: Rec; children: React.ReactNode }) {
  const { name } = useLookups();
  return (
    <div className={cn("rise flex items-start gap-3 py-3", rec.deletedAt && "opacity-45 grayscale")}>
      {children}
      {rec.deletedAt && <span className="sr-only">Deleted by {name(rec.deletedBy)}</span>}
    </div>
  );
}

export function RecordMeta({ rec }: { rec: Rec }) {
  const { name } = useLookups();
  if (rec.deletedAt)
    return (
      <span className="text-negative">
        Deleted by {name(rec.deletedBy)} · {formatDistanceToNow(new Date(rec.deletedAt), { addSuffix: true })}
      </span>
    );
  if (rec.updatedAt) return <span>edited by {name(rec.updatedBy)}</span>;
  return null;
}

export function RecordActions({ kind, rec, onEdit }: { kind: Kind; rec: Rec; onEdit: () => void }) {
  const mutation = useRecordMutation();
  const [confirm, setConfirm] = useState(false);
  const [history, setHistory] = useState(false);
  const deleted = Boolean(rec.deletedAt);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="-mr-2 size-8 grayscale-0" aria-label="Actions">
            {mutation.isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!deleted && (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setHistory(true)}>
            <History /> Change history
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {deleted ? (
            <DropdownMenuItem onClick={() => mutation.mutate({ op: "restore", kind, id: rec.id, version: rec.version })}>
              <RotateCcw /> Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              It will stop counting toward balances but stays in the list (greyed out) and can be restored. Everyone
              will see that you deleted it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => mutation.mutate({ op: "delete", kind, id: rec.id, version: rec.version })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HistoryDialog entityId={history ? rec.id : null} onClose={() => setHistory(false)} />
    </>
  );
}

const HIDDEN = new Set(["id", "version", "createdAt", "createdBy", "updatedAt", "updatedBy", "deletedBy"]);
const LABELS: Record<string, string> = {
  payerId: "Paid by",
  amount: "Amount",
  categoryId: "Category",
  description: "Description",
  spentAt: "Date",
  sentAt: "Date",
  givenAt: "Date",
  shares: "Split",
  fromUserId: "From",
  toUserId: "To",
  userId: "Given by",
  note: "Note",
  deletedAt: "Deleted",
};

export function HistoryDialog({ entityId, onClose }: { entityId: string | null; onClose: () => void }) {
  const { name, catById } = useLookups();
  const { data, isLoading } = useQuery({
    queryKey: ["history", entityId],
    queryFn: () => api<Page<AuditEntry>>(`/api/activity?entityId=${entityId}`),
    enabled: Boolean(entityId),
  });

  const show = (key: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (key === "amount") return formatTaka(Number(v));
    if (["payerId", "fromUserId", "toUserId", "userId"].includes(key)) return name(String(v));
    if (key === "categoryId") {
      const c = catById.get(String(v));
      return c ? `${c.emoji} ${c.name}` : "—";
    }
    if (key.endsWith("At")) return format(new Date(String(v)), "d MMM yyyy");
    if (key === "shares")
      return (v as { userId: string; amount: number }[]).map((s) => `${name(s.userId)} ${formatTaka(s.amount)}`).join(", ");
    return String(v);
  };

  const diff = (before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined) => {
    if (!before || !after) return [];
    return Object.keys(after)
      .filter((k) => !HIDDEN.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((k) => ({ key: k, from: show(k, before[k]), to: show(k, after[k]) }));
  };

  return (
    <Dialog open={Boolean(entityId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change history</DialogTitle>
          <DialogDescription>Every change is recorded with who made it and the previous values.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Loader2 className="mx-auto animate-spin" />
        ) : (
          <ol className="relative space-y-4 border-l pl-4">
            {data?.items.map((a) => {
              const changes = a.action === "update" ? diff(a.before as never, a.after as never) : [];
              return (
                <li key={a.id} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-background bg-primary" />
                  <p>
                    <span className="font-medium">{name(a.actorId)}</span>{" "}
                    {{ create: "created", update: "edited", delete: "deleted", restore: "restored", import: "imported" }[a.action]}{" "}
                    <span className="text-muted-foreground">· {format(new Date(a.createdAt), "d MMM yyyy, h:mm a")}</span>
                  </p>
                  {changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 rounded-lg bg-muted/60 p-2 text-xs">
                      {changes.map((c) => (
                        <li key={c.key}>
                          <span className="text-muted-foreground">{LABELS[c.key] ?? c.key}:</span>{" "}
                          <span className="text-negative line-through">{c.from}</span> → <span>{c.to}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {a.action === "create" && <p className="text-xs text-muted-foreground">{a.summary}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function LoadMore({ query }: { query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  if (!query.hasNextPage) return null;
  return (
    <Button variant="outline" className="mt-2 w-full" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
      {query.isFetchingNextPage && <Loader2 className="animate-spin" />} Load more
    </Button>
  );
}

export function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
      <Icon className="size-8 opacity-50" />
      {text}
    </div>
  );
}
