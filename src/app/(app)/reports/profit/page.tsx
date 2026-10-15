"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useState } from "react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { ReportFilterBar, describeFilters, initialFilterState } from "@/components/reports/ReportFilterBar";
import { ReportActions } from "@/components/reports/ReportActions";
import { ReportError, ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { ChartCard, SERIES_COLORS, TrendChart, type TrendPoint } from "@/components/reports/ReportCharts";
import { profitDocument, type ProfitItem, type ProfitReport } from "@/lib/reports";
import { useReportData } from "@/lib/useReportData";
import { trendGrouping } from "@/lib/dateRanges";
import { formatCurrency } from "@/lib/utils";

export default function ProfitReportPage() {
  useDocumentTitle("Profit Report");
  const [filters, setFilters] = useState(initialFilterState);
  const { from, to } = filters.range;
  const grouping = trendGrouping(filters.range);
  const { data, loading, error } = useReportData<ProfitReport>(`/api/reports/profit?from=${from}&to=${to}`);
  const trend = useReportData<TrendPoint[]>(`/api/reports/trend?from=${from}&to=${to}&groupBy=${grouping}`);

  const summary = data?.summary;

  const columns: Column<ProfitItem>[] = [
    { key: "name", header: "Product", sortable: true },
    { key: "quantity", header: "Qty Sold", sortable: true },
    { key: "salesAmount", header: "Sales (Taxable)", sortable: true, render: (r) => formatCurrency(r.salesAmount), exportValue: (r) => r.salesAmount },
    { key: "costAmount", header: "Cost", render: (r) => formatCurrency(r.costAmount), exportValue: (r) => r.costAmount },
    {
      key: "profit",
      header: "Profit",
      sortable: true,
      render: (r) => <span className={r.profit < 0 ? "text-red-600" : "text-green-700"}>{formatCurrency(r.profit)}</span>,
      exportValue: (r) => r.profit,
    },
    {
      key: "margin",
      header: "Margin %",
      render: (r) => (r.salesAmount > 0 ? `${((r.profit / r.salesAmount) * 100).toFixed(1)}%` : "-"),
      exportValue: (r) => (r.salesAmount > 0 ? Number(((r.profit / r.salesAmount) * 100).toFixed(1)) : 0),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ReportPageHeader
        title="Profit & Loss"
        description="Sales minus cost of goods sold minus expenses, with item-wise margins."
        actions={
          <ReportActions
            filename={`profit-report-${from}-to-${to}`}
            disabled={!data}
            getDocument={() => profitDocument(data!, describeFilters(filters))}
          />
        }
      />
      <ReportFilterBar state={filters} onChange={setFilters} />

      {error && <ReportError message={error} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">P&amp;L Statement</h3>
          {loading || !summary ? (
            <div className="py-10 text-center text-sm text-slate-400">Loading...</div>
          ) : (
            <div className="flex flex-col gap-2.5 text-sm">
              <PlRow label="Gross Sales (Taxable)" value={summary.grossSales} />
              <PlRow label="Cost of Goods Sold" value={-summary.cost} />
              <div className="border-t border-slate-200 pt-2">
                <PlRow label="Gross Profit" value={summary.grossProfit} bold />
              </div>
              <PlRow label="Expenses" value={-summary.expenses} />
              <div className="border-t border-slate-300 pt-2">
                <PlRow label="Net Profit" value={summary.netProfit} bold large />
              </div>
              <div className="mt-1 flex justify-between text-slate-600">
                <span>Net Margin</span>
                <span className="font-semibold">{summary.profitPercent.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Gross Margin</span>
                <span className="font-semibold">
                  {summary.grossSales > 0 ? ((summary.grossProfit / summary.grossSales) * 100).toFixed(2) : "0.00"}%
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="lg:col-span-2">
          <ChartCard title="Net Profit Trend" subtitle="Taxable sales − COGS − expenses, per period">
            <TrendChart
              data={trend.data ?? []}
              grouping={grouping}
              kind="line"
              series={[{ key: "netProfit", label: "Net Profit", color: SERIES_COLORS.blue }]}
            />
          </ChartCard>
        </div>
      </div>

      <ChartCard title="Sales, Cost & Expenses" subtitle={grouping === "day" ? "Daily" : "Monthly"}>
        <TrendChart
          data={trend.data ?? []}
          grouping={grouping}
          series={[
            { key: "sales", label: "Sales", color: SERIES_COLORS.blue },
            { key: "cogs", label: "Cost of Goods", color: SERIES_COLORS.orange },
            { key: "expenses", label: "Expenses", color: SERIES_COLORS.aqua },
          ]}
        />
      </ChartCard>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Item-wise Profit</h2>
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          loading={loading}
          searchKeys={["name"]}
          searchPlaceholder="Search product..."
          exportFilename="item-wise-profit"
          rowKey={(r) => r.productId}
        />
      </div>
    </div>
  );
}

function PlRow({ label, value, bold, large }: { label: string; value: number; bold?: boolean; large?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""} ${large ? "text-lg" : ""}`}>
      <span className={bold ? "" : "text-slate-600"}>{label}</span>
      <span className={`tabular-nums ${value < 0 ? "text-red-600" : ""}`}>{formatCurrency(value)}</span>
    </div>
  );
}
