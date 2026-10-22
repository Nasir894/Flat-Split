"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatTaka } from "@/lib/money";

const taka = (v: unknown) => formatTaka(Number(v));
const compact = (poisha: number) => {
  const t = poisha / 100;
  return t >= 100000 ? `${(t / 100000).toFixed(1)}L` : t >= 1000 ? `${(t / 1000).toFixed(t >= 10000 ? 0 : 1)}k` : String(Math.round(t));
};

export function DailyChart({ data }: { data: { day: string; total: number }[] }) {
  const config = { total: { label: "Spent", color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-52 w-full">
      <BarChart data={data} margin={{ left: -12, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          minTickGap={16}
          tickFormatter={(d: string) => format(new Date(d + "T00:00:00"), data.length > 40 ? "MMM d" : "d MMM")}
        />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.5 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, p) => format(new Date(p[0]?.payload.day + "T00:00:00"), "EEE, d MMM yyyy")}
              formatter={(v) => <span className="font-medium tabular">{taka(v)}</span>}
            />
          }
        />
        <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={700} />
      </BarChart>
    </ChartContainer>
  );
}

export type Slice = { key: string; label: string; total: number; color: string };

export function CategoryDonut({ data, onPick }: { data: Slice[]; onPick: (key: string) => void }) {
  const config = Object.fromEntries(data.map((d) => [d.key, { label: d.label, color: d.color }])) satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-56">
      <PieChart>
        <ChartTooltip
          content={<ChartTooltipContent nameKey="key" hideLabel formatter={(v, _n, item) => (
            <div className="flex w-full justify-between gap-3">
              <span>{item.payload.label}</span>
              <span className="font-medium tabular">{taka(v)}</span>
            </div>
          )} />}
        />
        <Pie
          data={data}
          dataKey="total"
          nameKey="key"
          innerRadius="58%"
          outerRadius="95%"
          paddingAngle={1.5}
          stroke="var(--background)"
          strokeWidth={2}
          animationDuration={800}
          onClick={(d) => onPick((d as unknown as Slice).key)}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.color} className="cursor-pointer" />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

export function PeopleChart({ data }: { data: { name: string; paid: number; consumed: number }[] }) {
  const config = {
    paid: { label: "Paid", color: "var(--chart-1)" },
    consumed: { label: "Consumed", color: "var(--chart-2)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(140, data.length * 56 + 40) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }} barGap={2}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={compact} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={72} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => (
          <div className="flex w-full justify-between gap-3">
            <span className="text-muted-foreground">{config[n as keyof typeof config]?.label}</span>
            <span className="font-medium tabular">{taka(v)}</span>
          </div>
        )} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="paid" fill="var(--color-paid)" radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={700} />
        <Bar dataKey="consumed" fill="var(--color-consumed)" radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={700} />
      </BarChart>
    </ChartContainer>
  );
}
