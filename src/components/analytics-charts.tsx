"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatTaka } from "@/lib/money";

const taka = (v: unknown) => formatTaka(Number(v));
/** Short axis labels: 950, 1.2k, 15k, 1.5L (lakh). */
const compact = (poisha: number) => {
  const t = poisha / 100;
  if (t >= 100000) return `${(t / 100000).toFixed(1)}L`;
  if (t >= 1000) return `${(t / 1000).toFixed(t >= 10000 ? 0 : 1)}k`;
  return String(Math.round(t));
};

/** Daily spending as a smooth area with a dashed "average per day" line. */
export function TrendChart({ data, average }: { data: { day: string; total: number }[]; average: number }) {
  // Neon yellow line in dark mode (black in light), like the Aurex charts.
  const config = { total: { label: "Spent", color: "var(--primary)" } } satisfies ChartConfig;
  const long = data.length > 45;
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <AreaChart data={data} margin={{ left: -14, right: 8, top: 12 }}>
        <defs>
          <linearGradient id="fs-trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-total)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-total)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tickMargin={6}
          tickFormatter={(d: string) => format(new Date(d + "T00:00:00"), long ? "MMM d" : "d MMM")}
        />
        <YAxis tickLine={false} axisLine={false} width={46} tickFormatter={compact} />
        {average > 0 && (
          <ReferenceLine
            y={average}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{ value: `avg ${compact(average)}`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 10 }}
          />
        )}
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, p) => format(new Date(p[0]?.payload.day + "T00:00:00"), "EEE, d MMM yyyy")}
              formatter={(v) => <span className="font-semibold tabular">{taka(v)}</span>}
            />
          }
        />
        <Area
          dataKey="total"
          type="monotone"
          stroke="var(--color-total)"
          strokeWidth={2}
          fill="url(#fs-trend)"
          dot={data.length <= 14 ? { r: 3, strokeWidth: 2, fill: "var(--background)" } : false}
          activeDot={{ r: 5, strokeWidth: 2, fill: "var(--background)" }}
          animationDuration={700}
        />
      </AreaChart>
    </ChartContainer>
  );
}

export type Slice = { key: string; label: string; total: number; color: string };

/** Category share as a donut, with the period total in the middle. */
export function CategoryDonut({ data, total, onPick }: { data: Slice[]; total: number; onPick: (key: string) => void }) {
  const config = Object.fromEntries(data.map((d) => [d.key, { label: d.label, color: d.color }])) satisfies ChartConfig;
  return (
    <div className="relative mx-auto aspect-square h-52">
      <ChartContainer config={config} className="aspect-square h-52">
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                nameKey="key"
                hideLabel
                formatter={(v, _n, item) => (
                  <div className="flex w-full justify-between gap-3">
                    <span>{item.payload.label}</span>
                    <span className="font-semibold tabular">{taka(v)}</span>
                  </div>
                )}
              />
            }
          />
          <Pie
            data={data}
            dataKey="total"
            nameKey="key"
            innerRadius="64%"
            outerRadius="98%"
            paddingAngle={2}
            cornerRadius={4}
            stroke="var(--card)"
            strokeWidth={2}
            animationDuration={800}
            onClick={(d) => onPick((d as unknown as Slice).key)}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} className="cursor-pointer outline-none" />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">Total</span>
        <span className="text-lg font-bold tabular">{formatTaka(total)}</span>
      </div>
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Spending by day of the week; the busiest day is highlighted. */
export function WeekdayChart({ data }: { data: { dow: number; total: number }[] }) {
  const rows = DAYS.map((label, i) => ({ label, total: data.find((d) => d.dow === i + 1)?.total ?? 0 }));
  const max = Math.max(...rows.map((r) => r.total));
  const config = { total: { label: "Spent", color: "var(--primary)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-40 w-full">
      <BarChart data={rows} margin={{ left: -14, right: 4, top: 8 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} />
        <YAxis tickLine={false} axisLine={false} width={46} tickFormatter={compact} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={<ChartTooltipContent formatter={(v) => <span className="font-semibold tabular">{taka(v)}</span>} />}
        />
        <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={30} animationDuration={700}>
          {rows.map((r) => (
            <Cell key={r.label} fill={r.total === max && max > 0 ? "var(--color-total)" : "var(--muted-foreground)"} fillOpacity={r.total === max && max > 0 ? 1 : 0.25} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
