"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, startOfDay, subDays } from "date-fns";
import { useLookups } from "@/hooks/use-data";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import type { Analytics } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/chip";
import type { Slice } from "@/components/analytics-charts";

// Recharts is only downloaded when this page opens.
const chartFallback = () => <Skeleton className="h-52 w-full" />;
const DailyChart = dynamic(() => import("@/components/analytics-charts").then((m) => m.DailyChart), { ssr: false, loading: chartFallback });
const CategoryDonut = dynamic(() => import("@/components/analytics-charts").then((m) => m.CategoryDonut), { ssr: false, loading: chartFallback });
const PeopleChart = dynamic(() => import("@/components/analytics-charts").then((m) => m.PeopleChart), { ssr: false, loading: chartFallback });

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
];
const PALETTE = Array.from({ length: 7 }, (_, i) => `var(--chart-${i + 1})`);
const OTHER_COLOR = "var(--chart-8)";

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
  const { activeCategories, catById, users } = useLookups();
  const [preset, setPreset] = useState<Preset>("7d");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 13), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [category, setCategory] = useState<string | null>(null);

  const [from, to] = rangeFor(preset, customFrom, customTo);
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  if (category) params.set("category", category);

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", params.toString()],
    queryFn: () => api<Analytics>(`/api/analytics?${params}`),
    placeholderData: (prev) => prev,
  });

  const days = Math.max(1, differenceInCalendarDays(to, from));
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const daily = useMemo(() => {
    if (!data) return [];
    const map = new Map(data.daily.map((d) => [d.day, d.total]));
    return eachDayOfInterval({ start: fromMs, end: subDays(toMs, 1) }).map((d) => {
      const day = format(d, "yyyy-MM-dd");
      return { day, total: map.get(day) ?? 0 };
    });
  }, [data, fromMs, toMs]);

  // Color follows the category (by its position in the full list), never its rank.
  const slices: Slice[] = useMemo(() => {
    if (!data) return [];
    const colorOf = new Map(activeCategories.map((c, i) => [c.id, PALETTE[i % PALETTE.length]]));
    const rows = data.byCategory.map((r) => {
      const c = r.categoryId ? catById.get(r.categoryId) : undefined;
      return {
        key: r.categoryId ?? "none",
        label: c ? `${c.emoji} ${c.name}` : "Uncategorized",
        total: r.total,
        color: (r.categoryId && colorOf.get(r.categoryId)) || OTHER_COLOR,
      };
    });
    if (rows.length <= 7) return rows;
    const other = rows.slice(6).reduce((s, r) => s + r.total, 0);
    return [...rows.slice(0, 6), { key: "other", label: "Other", total: other, color: OTHER_COLOR }];
  }, [data, activeCategories, catById]);

  const people = useMemo(
    () =>
      users.map((u) => ({
        name: u.name,
        paid: data?.byPayer.find((p) => p.userId === u.id)?.total ?? 0,
        consumed: data?.byConsumer.find((p) => p.userId === u.id)?.total ?? 0,
      })),
    [users, data],
  );

  const total = data?.totals.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {PRESETS.map((p) => (
          <Chip key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>
            {p.label}
          </Chip>
        ))}
      </div>
      {preset === "custom" && (
        <div className="rise grid grid-cols-2 gap-2">
          <Input type="date" aria-label="From" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <Input type="date" aria-label="To" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        <Chip active={!category} onClick={() => setCategory(null)}>
          All categories
        </Chip>
        {activeCategories.map((c) => (
          <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
            {c.emoji} {c.name}
          </Chip>
        ))}
      </div>

      {isLoading && !data ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Total spent" value={formatTaka(total)} big />
            <Stat label="Expenses" value={String(data?.totals.count ?? 0)} />
            <Stat label="Average / day" value={formatTaka(Math.round(total / days))} />
            <Stat label="Largest" value={formatTaka(data?.totals.largest ?? 0)} />
          </div>

          {days > 1 && (
            <Card className="rise">
              <CardHeader>
                <CardTitle className="text-base">Daily spending</CardTitle>
              </CardHeader>
              <CardContent>
                <DailyChart data={daily} />
              </CardContent>
            </Card>
          )}

          {!category && slices.length > 0 && (
            <Card className="rise">
              <CardHeader>
                <CardTitle className="text-base">By category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <CategoryDonut data={slices} onPick={(k) => k !== "other" && k !== "none" && setCategory(k)} />
                <ul className="space-y-1.5 text-sm">
                  {slices.map((s) => (
                    <li key={s.key}>
                      <button
                        className="flex w-full items-center gap-2 text-left"
                        onClick={() => s.key !== "other" && s.key !== "none" && setCategory(s.key)}
                      >
                        <span className="size-3 rounded-sm" style={{ background: s.color }} />
                        <span className="flex-1 truncate">{s.label}</span>
                        <span className="text-muted-foreground tabular">{total ? Math.round((s.total / total) * 100) : 0}%</span>
                        <span className="w-24 text-right font-medium tabular">{formatTaka(s.total)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {total > 0 && (
            <Card className="rise">
              <CardHeader>
                <CardTitle className="text-base">Who paid vs. who consumed</CardTitle>
              </CardHeader>
              <CardContent>
                <PeopleChart data={people} />
                <table className="mt-3 w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left font-normal">Member</th>
                      <th className="text-right font-normal">Paid</th>
                      <th className="text-right font-normal">Consumed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="text-right tabular">{formatTaka(p.paid)}</td>
                        <td className="text-right tabular">{formatTaka(p.consumed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {total === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No spending{category ? ` on ${catById.get(category)?.name ?? "this category"}` : ""} for this period.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <Card className="rise gap-1 py-3">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={big ? "text-2xl font-bold tabular" : "text-lg font-semibold tabular"}>{value}</p>
      </CardContent>
    </Card>
  );
}
