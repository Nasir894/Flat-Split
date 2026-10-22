"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, startOfDay, subDays } from "date-fns";
import { CalendarDays, ChartPie, TrendingDown, TrendingUp, Trophy, Users } from "lucide-react";
import { useLookups } from "@/hooks/use-data";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import type { Analytics } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/member-avatar";
import { Amount } from "@/components/amount";
import type { Slice } from "@/components/analytics-charts";

// Recharts is only downloaded when this page opens.
const chartFallback = () => <Skeleton className="h-52 w-full" />;
const TrendChart = dynamic(() => import("@/components/analytics-charts").then((m) => m.TrendChart), { ssr: false, loading: chartFallback });
const CategoryDonut = dynamic(() => import("@/components/analytics-charts").then((m) => m.CategoryDonut), { ssr: false, loading: chartFallback });
const WeekdayChart = dynamic(() => import("@/components/analytics-charts").then((m) => m.WeekdayChart), { ssr: false, loading: chartFallback });

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";
const PRESETS: { id: Preset; label: string; prev: string }[] = [
  { id: "today", label: "Today", prev: "yesterday" },
  { id: "yesterday", label: "Yesterday", prev: "the day before" },
  { id: "7d", label: "7 days", prev: "the previous 7 days" },
  { id: "30d", label: "30 days", prev: "the previous 30 days" },
  { id: "custom", label: "Custom", prev: "the previous period" },
];
// Color follows the category (by its fixed position in the category list), never its rank.
const PALETTE = Array.from({ length: 7 }, (_, i) => `var(--chart-${i + 1})`);
const OTHER_COLOR = "var(--chart-8)";
const ALL = "all";

function rangeFor(p: Preset, from: string, to: string): [Date, Date] {
  const today = startOfDay(new Date());
  switch (p) {
    case "today":
      return [today, addDays(today, 1)];
    case "yesterday":
      return [subDays(today, 1), today];
    case "7d":
      return [subDays(today, 6), addDays(today, 1)];
    case "30d":
      return [subDays(today, 29), addDays(today, 1)];
    case "custom": {
      const a = startOfDay(new Date(from + "T00:00:00"));
      const b = startOfDay(new Date(to + "T00:00:00"));
      return a <= b ? [a, addDays(b, 1)] : [b, addDays(a, 1)];
    }
  }
}

export default function AnalyticsPage() {
  const { activeCategories, catById, users, userById, name } = useLookups();
  const [preset, setPreset] = useState<Preset>("7d");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 13), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [category, setCategory] = useState<string>(ALL);

  const [from, to] = rangeFor(preset, customFrom, customTo);
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const days = Math.max(1, differenceInCalendarDays(to, from));
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  if (category !== ALL) params.set("category", category);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["analytics", params.toString()],
    queryFn: () => api<Analytics>(`/api/analytics?${params}`),
    placeholderData: (prev) => prev,
  });

  const total = data?.totals?.total ?? 0;
  const prevTotal = data?.previous?.total ?? 0;
  const change = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
  const average = Math.round(total / days);

  // Every day in the range, including days with no spending.
  const dailyMap = new Map((data?.daily ?? []).map((d) => [d.day, d.total]));
  const daily = eachDayOfInterval({ start: fromMs, end: subDays(toMs, 1) }).map((d) => {
    const day = format(d, "yyyy-MM-dd");
    return { day, total: dailyMap.get(day) ?? 0 };
  });

  const slices: (Slice & { count: number })[] = (() => {
    if (!data) return [];
    const colorOf = new Map(activeCategories.map((c, i) => [c.id, PALETTE[i % PALETTE.length]]));
    const rows = data.byCategory.map((r) => {
      const c = r.categoryId ? catById.get(r.categoryId) : undefined;
      return {
        key: r.categoryId ?? "none",
        label: c ? `${c.emoji} ${c.name}` : "🧾 Uncategorized",
        total: r.total,
        count: r.count,
        color: (r.categoryId && colorOf.get(r.categoryId)) || OTHER_COLOR,
      };
    });
    if (rows.length <= 7) return rows;
    const rest = rows.slice(6);
    return [
      ...rows.slice(0, 6),
      { key: "other", label: "📦 Other", total: rest.reduce((s, r) => s + r.total, 0), count: rest.reduce((s, r) => s + r.count, 0), color: OTHER_COLOR },
    ];
  })();

  const people = (() => {
    const rows = users.map((u) => {
      const paid = data?.byPayer.find((p) => p.userId === u.id)?.total ?? 0;
      const share = data?.byConsumer.find((p) => p.userId === u.id)?.total ?? 0;
      return { user: u, paid, share, net: paid - share };
    });
    return rows.sort((a, b) => b.share - a.share);
  })();
  const peopleMax = Math.max(1, ...people.flatMap((p) => [p.paid, p.share]));

  const presetInfo = PRESETS.find((p) => p.id === preset)!;
  const pick = (key: string) => key !== "other" && key !== "none" && setCategory(key);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-2">
        <div className="grid grid-cols-5 gap-1 rounded-xl bg-muted p-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={cn(
                "rounded-lg py-1.5 text-xs font-medium transition-all",
                preset === p.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="rise grid grid-cols-2 gap-2">
            <Input type="date" aria-label="From" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
            <Input type="date" aria-label="To" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {activeCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <div className={cn("space-y-4 transition-opacity", isFetching && "opacity-70")}>
          {/* Headline */}
          <Card className="rise border-0 bg-transparent py-2 shadow-none ring-0">
            <CardContent className="space-y-3 px-1">
              <div>
                <p className="text-sm text-foreground/65">
                  {category === ALL ? "Total spent" : `Spent on ${catById.get(category)?.name ?? "category"}`} ·{" "}
                  {preset === "custom"
                    ? `${format(from, "d MMM")} – ${format(subDays(to, 1), "d MMM")}`
                    : presetInfo.label.toLowerCase()}
                </p>
                <Amount poisha={total} className="block text-[2.9rem] leading-tight font-bold" />
                {change !== null ? (
                  <p className="glass mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs">
                    {change >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                    {Math.abs(change).toFixed(0)}% {change >= 0 ? "more" : "less"} than {presetInfo.prev}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-foreground/60">Nothing spent in {presetInfo.prev} to compare with</p>
                )}
              </div>
              <div className="glass grid grid-cols-3 gap-2 rounded-2xl py-3 text-center">
                <Stat label="Per day" value={formatTaka(average)} />
                <Stat label="Expenses" value={String(data?.totals?.count ?? 0)} />
                <Stat label="Days with spending" value={`${data?.totals?.activeDays ?? 0}/${days}`} />
              </div>
            </CardContent>
          </Card>

          {total === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No spending in this period.</p>
          ) : (
            <>
              {days > 1 && (
                <Section icon={TrendingUp} title="Spending over time" description="Daily total, with the average per day dashed">
                  <TrendChart data={daily} average={average} />
                </Section>
              )}

              {category === ALL && slices.length > 0 && (
                <Section icon={ChartPie} title="Where the money went" description="Tap a category to focus on it">
                  <CategoryDonut data={slices} total={total} onPick={pick} />
                  <ul className="mt-4 space-y-3">
                    {slices.map((s) => {
                      const pct = total ? (s.total / total) * 100 : 0;
                      return (
                        <li key={s.key}>
                          <button className="w-full text-left" onClick={() => pick(s.key)}>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                              <span className="flex-1 truncate">{s.label}</span>
                              <span className="text-xs text-muted-foreground">{s.count}×</span>
                              <span className="w-12 text-right text-xs text-muted-foreground tabular">{pct.toFixed(0)}%</span>
                              <span className="w-20 text-right font-semibold tabular">{formatTaka(s.total)}</span>
                            </div>
                            <div className="mt-1.5 ml-4.5 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: s.color }} />
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              )}

              <Section icon={Users} title="Who paid & who consumed" description="Paid = money spent · Share = their part of the bills">
                <ul className="space-y-4">
                  {people.map(({ user, paid, share, net }) => (
                    <li key={user.id} className="flex items-center gap-3">
                      <UserAvatar user={user} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{user.name}</span>
                          <span className={cn("text-xs font-semibold tabular", net > 0 ? "text-positive" : net < 0 ? "text-negative" : "text-muted-foreground")}>
                            {formatTaka(net, { sign: true })}
                          </span>
                        </div>
                        <Bar label="Paid" value={paid} max={peopleMax} className="bg-primary" />
                        <Bar label="Share" value={share} max={peopleMax} className="bg-chart-2" />
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>

              {days >= 7 && data?.byWeekday && (
                <Section icon={CalendarDays} title="By day of the week" description="Busiest day highlighted">
                  <WeekdayChart data={data.byWeekday} />
                </Section>
              )}

              {data?.top && data.top.length > 0 && (
                <Section icon={Trophy} title="Biggest expenses">
                  <ol className="divide-y">
                    {data.top.map((e, i) => {
                      const c = e.categoryId ? catById.get(e.categoryId) : undefined;
                      return (
                        <li key={e.id} className="flex items-center gap-3 py-2.5">
                          <span className="w-4 text-center text-xs font-semibold text-muted-foreground">{i + 1}</span>
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-lg">{c?.emoji ?? "🧾"}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{e.description || c?.name || "Expense"}</p>
                            <p className="text-xs text-muted-foreground">
                              {name(e.payerId)} · {format(new Date(e.spentAt), "d MMM")}
                            </p>
                          </div>
                          <span className="font-semibold tabular">{formatTaka(e.amount)}</span>
                          <span className="sr-only">{userById.get(e.payerId)?.name}</span>
                        </li>
                      );
                    })}
                  </ol>
                </Section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-base font-semibold tabular">{value}</p>
      <p className="text-[11px] text-foreground/60">{label}</p>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rise">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" /> {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Bar({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="w-9">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-700", className)} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-16 text-right tabular">{formatTaka(value)}</span>
    </div>
  );
}
