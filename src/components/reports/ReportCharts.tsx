"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

// Categorical palette in fixed slot order (validated for colour-blind separation) — a series
// keeps its slot regardless of which other series are shown.
export const SERIES_COLORS = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
} as const;

export type TrendPoint = ChartRow & {
  sales: number;
  purchases: number;
  expenses: number;
  received: number;
  paid: number;
  cogs: number;
  netProfit: number;
};

// Any period-bucketed row: { period: "yyyy-mm-dd", <seriesKey>: number, ... }
export type ChartRow = { period: string } & Record<string, number | string>;

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

// Buckets dated rows into day/month periods client-side — used where the chart must reflect the
// same filters as the table under it (customer, status, method...).
export function bucketByPeriod<T>(
  rows: T[],
  date: (row: T) => string,
  values: Record<string, (row: T) => number>,
  grouping: "day" | "month"
): ChartRow[] {
  const map = new Map<string, ChartRow>();
  for (const row of rows) {
    const iso = date(row).slice(0, 10);
    const period = grouping === "month" ? `${iso.slice(0, 7)}-01` : iso;
    let bucket = map.get(period);
    if (!bucket) {
      bucket = { period };
      for (const k of Object.keys(values)) bucket[k] = 0;
      map.set(period, bucket);
    }
    for (const [k, fn] of Object.entries(values)) bucket[k] = (bucket[k] as number) + fn(row);
  }
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
}

function compactRupees(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n.toFixed(0)}`;
}

function periodLabel(period: string, grouping: "day" | "month"): string {
  const d = new Date(`${period}T00:00:00`);
  return grouping === "month"
    ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ChartEmpty() {
  return <div className="flex h-60 items-center justify-center text-sm text-slate-400">No data in this period.</div>;
}

export function TrendChart({
  data,
  series,
  grouping,
  kind = "bar",
  height = 260,
  xLabel,
}: {
  data: ChartRow[];
  series: TrendSeries[];
  grouping: "day" | "month";
  kind?: "bar" | "line";
  height?: number;
  /** Custom x-axis label when `period` isn't a date (e.g. weekday names). */
  xLabel?: (period: string) => string;
}) {
  if (data.length === 0 || data.every((d) => series.every((s) => !d[s.key]))) return <ChartEmpty />;

  const rows = data.map((d) => ({ ...d, label: xLabel ? xLabel(d.period) : periodLabel(d.period, grouping) }));
  const axisProps = {
    tick: { fontSize: 11, fill: "#64748b" },
    tickLine: false,
    axisLine: false,
  };
  const tooltip = (
    <Tooltip
      formatter={(value) => formatCurrency(Number(value))}
      cursor={{ fill: "rgba(148,163,184,0.12)" }}
      contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#e2e8f0" }}
    />
  );
  const legend = series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      {kind === "line" ? (
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef2f6" />
          <XAxis dataKey="label" {...axisProps} minTickGap={16} />
          <YAxis {...axisProps} tickFormatter={compactRupees} width={56} />
          {tooltip}
          {legend}
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={rows.length <= 31 ? { r: 3 } : false} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      ) : (
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#eef2f6" />
          <XAxis dataKey="label" {...axisProps} minTickGap={16} />
          <YAxis {...axisProps} tickFormatter={compactRupees} width={56} />
          {tooltip}
          {legend}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

// Ranked horizontal bars with direct labels — used for top products / suppliers / categories.
export function RankedBars({
  items,
  color = SERIES_COLORS.blue,
  valueLabel = (n: number) => formatCurrency(n),
  limit = 8,
}: {
  items: { name: string; amount: number; hint?: string }[];
  color?: string;
  valueLabel?: (n: number) => string;
  limit?: number;
}) {
  const shown = items.slice(0, limit);
  if (shown.length === 0) return <ChartEmpty />;
  const max = Math.max(...shown.map((i) => i.amount), 1);

  return (
    <ul className="flex flex-col gap-2.5">
      {shown.map((item) => (
        <li key={item.name} className="group" title={`${item.name}: ${valueLabel(item.amount)}${item.hint ? ` · ${item.hint}` : ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-slate-700">{item.name}</span>
            <span className="shrink-0 font-medium tabular-nums text-slate-900">{valueLabel(item.amount)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full transition-[width] group-hover:opacity-80"
              style={{ width: `${Math.max(2, (item.amount / max) * 100)}%`, backgroundColor: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
