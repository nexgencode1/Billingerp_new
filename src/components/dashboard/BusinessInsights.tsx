"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Select } from "@/components/common/Select";
import { Skeleton } from "@/components/common/Skeleton";
import { ChartCard, RankedBars, SERIES_COLORS, TrendChart, type TrendPoint } from "@/components/reports/ReportCharts";
import { useReportData } from "@/lib/useReportData";
import { toIsoDate } from "@/lib/dateRanges";
import { formatCurrency } from "@/lib/utils";

interface PeriodStats {
  sales: number;
  invoices: number;
  avgBill: number;
  grossProfit: number;
  netProfit: number;
  expenses: number;
  received: number;
  purchases: number;
  newCustomers: number;
  grossMargin: number;
  netMargin: number;
}
interface Analytics {
  current: PeriodStats;
  previous: PeriodStats;
  topProducts: { productId: number; name: string; quantity: number; amount: number; profit: number }[];
  topCustomers: { customerId: number; name: string; invoices: number; amount: number; due: number }[];
  aging: { bucket: string; amount: number; invoices: number }[];
  categories: { category: string; amount: number }[];
  weekdays: { day: string; amount: number; invoices: number }[];
}

const RANGES = [
  { value: "7d", label: "Last 7 days", compare: "vs previous 7 days" },
  { value: "30d", label: "Last 30 days", compare: "vs previous 30 days" },
  { value: "month", label: "This month", compare: "vs same days last month" },
  { value: "year", label: "This year", compare: "vs same period last year" },
];

function Change({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  if (!before) return <span className="text-xs text-slate-400">no earlier data</span>;
  const pct = ((now - before) / Math.abs(before)) * 100;
  if (Math.abs(pct) < 0.5)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-slate-500">
        <Minus className="h-3 w-3" /> no change
      </span>
    );
  const good = invert ? pct < 0 : pct > 0;
  const Icon = pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? "text-green-700" : "text-red-600"}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {Math.abs(pct).toFixed(1)}%<span className="sr-only">{pct > 0 ? " increase" : " decrease"}</span>
    </span>
  );
}

function Metric({ label, value, now, before, invert }: { label: string; value: string; now: number; before: number; invert?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <Change now={now} before={before} invert={invert} />
    </div>
  );
}

// "Business Insights" block on the dashboard: period-over-period KPIs, 12-month trend, top
// products / customers, receivable aging, category mix and busiest weekdays.
export function BusinessInsights() {
  const [range, setRange] = useState("month");
  const { data, loading } = useReportData<Analytics>(`/api/dashboard/analytics?range=${range}`);
  const yearFrom = (() => {
    const d = new Date();
    return toIsoDate(new Date(d.getFullYear(), d.getMonth() - 11, 1));
  })();
  const trend = useReportData<TrendPoint[]>(`/api/reports/trend?from=${yearFrom}&to=${toIsoDate(new Date())}&groupBy=month`);
  const compareLabel = RANGES.find((r) => r.value === range)?.compare ?? "";

  return (
    <section className="flex flex-col gap-4" aria-labelledby="insights-heading" data-tour="dashboard-insights">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="insights-heading" className="text-base font-bold text-slate-900">
            Business Insights
          </h2>
          <p className="text-xs text-slate-500">{compareLabel}</p>
        </div>
        <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-40" aria-label="Insights period">
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>

      {loading || !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Sales" value={formatCurrency(data.current.sales)} now={data.current.sales} before={data.previous.sales} />
            <Metric label="Net Profit" value={formatCurrency(data.current.netProfit)} now={data.current.netProfit} before={data.previous.netProfit} />
            <Metric label="Net Margin" value={`${data.current.netMargin.toFixed(1)}%`} now={data.current.netMargin} before={data.previous.netMargin} />
            <Metric label="Gross Margin" value={`${data.current.grossMargin.toFixed(1)}%`} now={data.current.grossMargin} before={data.previous.grossMargin} />
            <Metric label="Bills" value={String(data.current.invoices)} now={data.current.invoices} before={data.previous.invoices} />
            <Metric label="Average Bill" value={formatCurrency(data.current.avgBill)} now={data.current.avgBill} before={data.previous.avgBill} />
            <Metric label="Money Received" value={formatCurrency(data.current.received)} now={data.current.received} before={data.previous.received} />
            <Metric label="Expenses" value={formatCurrency(data.current.expenses)} now={data.current.expenses} before={data.previous.expenses} invert />
          </div>

          {trend.data && (
            <ChartCard title="Last 12 Months" subtitle="Sales vs net profit, by month">
              <TrendChart
                data={trend.data}
                grouping="month"
                kind="line"
                series={[
                  { key: "sales", label: "Sales", color: SERIES_COLORS.blue },
                  { key: "netProfit", label: "Net Profit", color: SERIES_COLORS.aqua },
                ]}
              />
            </ChartCard>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Top Products" subtitle="By sales amount in this period">
              <RankedBars
                items={data.topProducts.map((p) => ({ name: p.name, amount: p.amount, hint: `${p.quantity} sold · profit ${formatCurrency(p.profit)}` }))}
              />
            </ChartCard>
            <ChartCard title="Top Customers" subtitle="By sales amount in this period">
              <RankedBars
                color={SERIES_COLORS.aqua}
                items={data.topCustomers.map((c) => ({ name: c.name, amount: c.amount, hint: `${c.invoices} bills · due ${formatCurrency(c.due)}` }))}
              />
            </ChartCard>
            <ChartCard title="Receivables Aging" subtitle="Unpaid customer dues by invoice age (all time)">
              <RankedBars
                color={SERIES_COLORS.orange}
                limit={4}
                items={data.aging.map((a) => ({ name: `${a.bucket} (${a.invoices} bills)`, amount: a.amount }))}
              />
              <Link href="/payments/reminders" className="mt-3 inline-block text-xs text-blue-600 hover:underline">
                Send payment reminders →
              </Link>
            </ChartCard>
            <ChartCard title="Sales by Category">
              <RankedBars items={data.categories.map((c) => ({ name: c.category, amount: c.amount }))} />
            </ChartCard>
          </div>

          <ChartCard title="Busiest Days of the Week" subtitle="Sales by weekday in this period">
            <TrendChart
              data={data.weekdays.map((w) => ({ period: w.day, sales: w.amount }))}
              grouping="day"
              series={[{ key: "sales", label: "Sales", color: SERIES_COLORS.blue }]}
              height={200}
              xLabel={(p) => p}
            />
          </ChartCard>
        </>
      )}
    </section>
  );
}
