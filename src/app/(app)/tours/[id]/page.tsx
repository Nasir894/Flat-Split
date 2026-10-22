"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Flag, Loader2, Lock, MoreVertical, Pencil, Play, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import type { Expense, TourDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useInvalidateAll, useLookups, useRecords, useRespondTransfer } from "@/hooks/use-data";
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
import { Amount } from "@/components/amount";
import { UserAvatar } from "@/components/member-avatar";
import { ExpenseItem } from "@/components/expense-item";
import { EmptyState, LoadMore } from "@/components/records";
import { ExpenseForm } from "@/components/forms/expense-form";
import { TourForm } from "@/components/forms/tour-form";
import { TourStatusBadge, tourDates } from "@/components/tour-card";
import { TourDownloads } from "@/components/tour-downloads";

export default function TourPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const invalidate = useInvalidateAll();
  const { userById, isGuest, meId, catById } = useLookups();
  const { data, isLoading, error } = useQuery({ queryKey: ["tour", id], queryFn: () => api<TourDetail>(`/api/tours/${id}`) });
  const expenses = useRecords<Expense>("expenses", { tour: id });
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<Expense>();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<null | "start" | "close" | "delete">(null);
  const [busy, setBusy] = useState(false);

  if (isLoading && !data) return <Skeleton className="h-72 rounded-2xl" />;
  if (error || !data) return <EmptyState icon={Receipt} text={(error as Error)?.message ?? "Tour not found"} />;
  const { tour, plan, byCategory, nets, settlements, preview } = data;
  const items = expenses.data?.pages.flatMap((p) => p.items) ?? [];
  const over = tour.planned > 0 && tour.spent > tour.planned;
  const name = (uid: string) => userById.get(uid)?.name ?? "Unknown";
  const isGuestId = (uid: string) => userById.get(uid)?.role === "guest";

  const act = async (kind: "start" | "close" | "delete") => {
    setBusy(true);
    try {
      if (kind === "delete") {
        await api(`/api/tours/${id}`, { method: "DELETE" });
        toast.success("Tour plan deleted");
        invalidate();
        router.replace("/tours");
        return;
      }
      await api(`/api/tours/${id}/${kind}`, { method: "POST" });
      toast.success(kind === "start" ? `${tour.emoji} ${tour.name} has started!` : "Tour closed. Settlements created.");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  // Plan vs actual: plan lines with a category compare against that category's spending.
  const actualByCat = new Map(byCategory.map((c) => [c.categoryId ?? "none", c.total]));
  const plannedCats = new Set(plan.map((p) => p.categoryId).filter(Boolean));
  const unplanned = byCategory.filter((c) => !c.categoryId || !plannedCats.has(c.categoryId));

  return (
    <div className="space-y-4">
      {/* Headline on the page glow */}
      <section className="rise px-1 pt-1">
        <div className="flex items-start gap-3">
          <span className="glass flex size-14 shrink-0 items-center justify-center rounded-2xl text-3xl">{tour.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-bold">{tour.name}</h2>
              <TourStatusBadge status={tour.status} />
            </div>
            <p className="text-sm text-foreground/65">{tourDates(tour)}</p>
          </div>
          {!isGuest && tour.status !== "closed" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Tour options">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditing(true)}>
                  <Pencil /> Edit tour &amp; plan
                </DropdownMenuItem>
                {tour.status === "planned" && (
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}>
                    <Trash2 /> Delete plan
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <p className="mt-4 text-sm text-foreground/65">{tour.status === "planned" ? "Budget" : "Spent so far"}</p>
        <Amount poisha={tour.status === "planned" ? tour.planned : tour.spent} className="block text-[2.6rem] leading-tight font-bold" />
        {tour.status !== "planned" && tour.planned > 0 && (
          <div className="glass mt-3 rounded-2xl p-3">
            <div className="flex justify-between text-xs">
              <span className="text-foreground/65">Budget {formatTaka(tour.planned)}</span>
              <span className={cn("font-semibold", over ? "text-negative" : "text-positive")}>
                {over ? `${formatTaka(tour.spent - tour.planned)} over` : `${formatTaka(tour.planned - tour.spent)} left`}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10">
              <div className={cn("h-full rounded-full", over ? "bg-negative" : "bg-brand")} style={{ width: `${Math.min(100, (tour.spent / tour.planned) * 100)}%` }} />
            </div>
          </div>
        )}
      </section>

      {/* Lifecycle actions (home sharers) */}
      {!isGuest && tour.status === "planned" && (
        <Card className="rise border-brand/40">
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">This is still a plan. Start the tour when you set off, and expenses can be added to it from then on.</p>
            <Button className="w-full" onClick={() => setConfirm("start")}>
              <Play /> Start tour
            </Button>
          </CardContent>
        </Card>
      )}
      {tour.status === "active" && (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => (setEdit(undefined), setAdding(true))}>
            <Plus /> Add expense
          </Button>
          {!isGuest ? (
            <Button variant="outline" onClick={() => setConfirm("close")}>
              <Flag /> Close tour
            </Button>
          ) : (
            <p className="flex items-center justify-center text-center text-xs text-muted-foreground">Home sharers close the tour</p>
          )}
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="planner">Planner</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
        </TabsList>

        {/* Overview: who stands where, and how it will be / was settled */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Who paid &amp; who owes</CardTitle>
              <CardDescription>Net = paid − share of the tour&apos;s expenses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {nets
                .slice()
                .sort((a, b) => b.net - a.net)
                .map((n) => (
                  <div key={n.id} className="flex items-center gap-3">
                    <UserAvatar user={userById.get(n.id)} className="size-9 text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {name(n.id)}
                        {isGuestId(n.id) && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Guest</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Paid {formatTaka(n.paid)} · Share {formatTaka(n.consumed)}
                      </p>
                    </div>
                    <span className={cn("text-sm font-semibold tabular", n.net > 0 ? "text-positive" : n.net < 0 && "text-negative")}>
                      {formatTaka(n.net, { sign: true })}
                    </span>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {tour.status === "closed" ? <Lock className="size-4" /> : null} Settling with guests
              </CardTitle>
              <CardDescription>
                {tour.status === "closed"
                  ? "Each guest settles with one home sharer. Everything else was added to the home fund."
                  : "When the tour closes, each guest settles with one home sharer: the one with the most to receive (or who owes the most). The rest joins the home fund."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {tour.status === "closed" ? (
                settlements.length ? (
                  settlements.map((s) => <SettlementRow key={s.id} s={s} name={name} meId={meId} />)
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing to settle with guests 🎉</p>
                )
              ) : preview?.length ? (
                preview.map((p) => (
                  <div key={p.from + p.to} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{name(p.from)}</span>
                    <ArrowRight className="size-4 text-muted-foreground" />
                    <span className="flex-1 font-medium">{name(p.to)}</span>
                    <span className="font-semibold tabular">{formatTaka(p.amount)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No guest payments needed so far.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Download this tour</CardTitle>
            </CardHeader>
            <CardContent>
              <TourDownloads tourId={tour.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          {items.length === 0 && !expenses.isLoading ? (
            <EmptyState icon={Receipt} text={tour.status === "planned" ? "Start the tour to add expenses." : "No expenses on this tour yet."} />
          ) : (
            <div className="divide-y">
              {items.map((e) => (
                <ExpenseItem key={e.id} e={e} onEdit={() => (setEdit(e), setAdding(true))} readOnly={tour.status !== "active"} />
              ))}
            </div>
          )}
          <LoadMore query={expenses} />
        </TabsContent>

        {/* Planner: budget lines vs what was actually spent */}
        <TabsContent value="planner" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plan vs actual</CardTitle>
              <CardDescription>Lines with a category are compared with spending in that category.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.length === 0 && <p className="text-sm text-muted-foreground">No budget plan yet{!isGuest && tour.status !== "closed" ? " (Edit tour to add one)" : ""}.</p>}
              {plan.map((p) => {
                const actual = p.categoryId ? (actualByCat.get(p.categoryId) ?? 0) : null;
                const cat = p.categoryId ? catById.get(p.categoryId) : undefined;
                const pct = actual !== null && p.amount ? Math.min(100, (actual / p.amount) * 100) : 0;
                const overLine = actual !== null && actual > p.amount;
                return (
                  <div key={p.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">
                        {cat?.emoji} {p.label}
                      </span>
                      <span className="shrink-0 tabular">
                        {actual !== null && <span className={cn("font-semibold", overLine && "text-negative")}>{formatTaka(actual)} / </span>}
                        <span className="text-muted-foreground">{formatTaka(p.amount)}</span>
                      </span>
                    </div>
                    {actual !== null && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", overLine ? "bg-negative" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
              {unplanned.length > 0 && (
                <div className="space-y-1.5 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">Spent outside the plan</p>
                  {unplanned.map((c) => {
                    const cat = c.categoryId ? catById.get(c.categoryId) : undefined;
                    return (
                      <div key={c.categoryId ?? "none"} className="flex justify-between text-sm">
                        <span>{cat ? `${cat.emoji} ${cat.name}` : "🧾 Uncategorized"}</span>
                        <span className="font-medium tabular">{formatTaka(c.total)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-between border-t pt-3 text-sm font-semibold">
                <span>Total</span>
                <span className={cn("tabular", over && "text-negative")}>
                  {formatTaka(tour.spent)} / {formatTaka(tour.planned)}
                </span>
              </div>
            </CardContent>
          </Card>
          {tour.notes && (
            <Card>
              <CardContent className="text-sm whitespace-pre-wrap">{tour.notes}</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="people">
          <div className="divide-y rounded-2xl border bg-card">
            {tour.participantIds.map((uid) => (
              <div key={uid} className="flex items-center gap-3 p-3">
                <UserAvatar user={userById.get(uid)} />
                <span className="flex-1 text-sm font-medium">
                  {name(uid)}
                  {uid === meId && <span className="text-muted-foreground"> (me)</span>}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{isGuestId(uid) ? "Guest" : "Home sharer"}</span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <ExpenseForm open={adding} onOpenChange={setAdding} expense={edit} tourId={tour.id} />
      <TourForm open={editing} onOpenChange={setEditing} tour={tour} plan={plan} />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "start" ? `Start ${tour.name}?` : confirm === "close" ? `Close ${tour.name}?` : "Delete this tour plan?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {confirm === "start" && <p>Everyone on the tour can add expenses from now on.</p>}
                {confirm === "delete" && <p>The plan disappears. Nothing was spent on it yet.</p>}
                {confirm === "close" && (
                  <>
                    <p>No more expenses can be added. The settlement below is created, and home sharers&apos; shares join the home fund.</p>
                    {preview?.length ? (
                      <ul className="rounded-lg bg-muted p-2 text-foreground">
                        {preview.map((p) => (
                          <li key={p.from + p.to}>
                            {name(p.from)} → {name(p.to)}: <b>{formatTaka(p.amount)}</b>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No guest payments are needed.</p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "delete" ? "destructive" : "default"}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (confirm) act(confirm);
              }}
            >
              {busy && <Loader2 className="animate-spin" />}
              {confirm === "start" ? "Start tour" : confirm === "close" ? "Close tour" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** A settlement payment after closing; the receiver confirms it (guests can do this too). */
function SettlementRow({
  s,
  name,
  meId,
}: {
  s: TourDetail["settlements"][number];
  name: (id: string) => string;
  meId: string;
}) {
  const respond = useRespondTransfer();
  const mine = s.toUserId === meId && s.status === "pending";
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{name(s.fromUserId)}</span>
        <ArrowRight className="size-4 text-muted-foreground" />
        <span className="flex-1 font-medium">{name(s.toUserId)}</span>
        <span className="font-semibold tabular">{formatTaka(s.amount)}</span>
      </div>
      <p className={cn("mt-1 text-xs", s.status === "approved" ? "text-positive" : s.status === "declined" ? "text-negative" : "text-muted-foreground")}>
        {s.status === "approved" ? "✓ Received" : s.status === "declined" ? "Declined" : `Waiting for ${name(s.toUserId)} to confirm`}
      </p>
      {mine && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" disabled={respond.isPending} onClick={() => respond.mutate({ id: s.id, version: s.version, decision: "decline" })}>
            Not received
          </Button>
          <Button
            size="sm"
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={respond.isPending}
            onClick={() => respond.mutate({ id: s.id, version: s.version, decision: "approve" })}
          >
            I received it
          </Button>
        </div>
      )}
    </div>
  );
}
