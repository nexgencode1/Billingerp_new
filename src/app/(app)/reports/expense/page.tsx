"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { StatCard } from "@/components/reports/StatCard";
import {
  ReportFilterBar,
  describeFilters,
  filterQuery,
  initialFilterState,
  type FilterField,
} from "@/components/reports/ReportFilterBar";
import { ReportActions } from "@/components/reports/ReportActions";
import { ReportError, ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { ChartCard, RankedBars, SERIES_COLORS, TrendChart, bucketByPeriod } from "@/components/reports/ReportCharts";
import { expenseDocument, type ExpenseReport, type ExpenseRow } from "@/lib/reports";
import { useFilterOptions, useReportData } from "@/lib/useReportData";
import { trendGrouping } from "@/lib/dateRanges";
import { formatCurrency, formatDate } from "@/lib/utils";

const METHOD_OPTIONS = ["CASH", "UPI", "CARD", "BANK"].map((m) => ({ value: m, label: m }));

export default function ExpenseReportPage() {
  useDocumentTitle("Expense Report");
  const [filters, setFilters] = useState(initialFilterState);
  const categoryOptions = useFilterOptions("/api/expense-categories");
  const fields: FilterField[] = [
    { key: "categoryId", label: "Category", options: categoryOptions },
    { key: "paymentMethod", label: "Method", options: METHOD_OPTIONS },
  ];
  const { data, loading, error } = useReportData<ExpenseReport>(`/api/reports/expense?${filterQuery(filters)}`);
  const grouping = trendGrouping(filters.range);

  const trend = useMemo(
    () => bucketByPeriod(data?.rows ?? [], (r) => r.date, { expenses: (r) => r.amount }, grouping),
    [data, grouping]
  );

  const columns: Column<ExpenseRow>[] = [
    { key: "date", header: "Date", sortable: true, render: (r) => formatDate(r.date), exportValue: (r) => formatDate(r.date) },
    { key: "category", header: "Category", render: (r) => r.category.name, exportValue: (r) => r.category.name },
    { key: "description", header: "Description", render: (r) => r.description ?? "-", exportValue: (r) => r.description ?? "" },
    { key: "paymentMethod", header: "Method" },
    { key: "amount", header: "Amount", sortable: true, render: (r) => formatCurrency(r.amount), exportValue: (r) => r.amount },
  ];

  const summary = data?.summary;
  const days = Math.max(1, (new Date(filters.range.to).getTime() - new Date(filters.range.from).getTime()) / 86_400_000 + 1);

  return (
    <div className="flex flex-col gap-4">
      <ReportPageHeader
        title="Expense Report"
        description="Business expenses by category and payment method."
        actions={
          <ReportActions
            filename={`expense-report-${filters.range.from}-to-${filters.range.to}`}
            disabled={!data}
            getDocument={() => expenseDocument(data!, describeFilters(filters, fields))}
          />
        }
      />
      <ReportFilterBar state={filters} onChange={setFilters} fields={fields} />

      {error && <ReportError message={error} />}

      {summary && data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total Expenses" value={formatCurrency(summary.totalExpenses)} />
          <StatCard label="Entries" value={String(data.rows.length)} />
          <StatCard label="Average / Day" value={formatCurrency(summary.totalExpenses / days)} />
          <StatCard label="Top Category" value={summary.byCategory[0]?.category ?? "-"} />
        </div>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Expenses Over Time" subtitle={grouping === "day" ? "Daily" : "Monthly"}>
              <TrendChart data={trend} grouping={grouping} series={[{ key: "expenses", label: "Expenses", color: SERIES_COLORS.orange }]} />
            </ChartCard>
          </div>
          <ChartCard title="By Category" subtitle="Where the money went">
            <RankedBars
              color={SERIES_COLORS.orange}
              items={summary!.byCategory.map((c) => ({
                name: c.category,
                amount: c.amount,
                hint: summary!.totalExpenses > 0 ? `${((c.amount / summary!.totalExpenses) * 100).toFixed(1)}%` : undefined,
              }))}
            />
          </ChartCard>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        loading={loading}
        searchKeys={["description"]}
        searchPlaceholder="Search description..."
        exportFilename="expense-report"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
