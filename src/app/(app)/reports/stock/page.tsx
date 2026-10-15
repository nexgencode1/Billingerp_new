"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { StatCard } from "@/components/reports/StatCard";
import { Badge } from "@/components/common/Badge";
import { ReportFilterBar, initialFilterState, type FilterField } from "@/components/reports/ReportFilterBar";
import { ReportActions } from "@/components/reports/ReportActions";
import { ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { ChartCard, RankedBars, SERIES_COLORS } from "@/components/reports/ReportCharts";
import { useCrud } from "@/lib/useCrud";
import { stockDocument } from "@/lib/reports";
import { formatCurrency } from "@/lib/utils";
import type { StockRow } from "@/types/inventory";

const STATUS_OPTIONS = [
  { value: "IN_STOCK", label: "In Stock" },
  { value: "LOW_STOCK", label: "Low Stock" },
  { value: "OUT_OF_STOCK", label: "Out of Stock" },
];
const STATUS_TONE = { IN_STOCK: "green", LOW_STOCK: "yellow", OUT_OF_STOCK: "red" } as const;
const STATUS_LABEL = { IN_STOCK: "In Stock", LOW_STOCK: "Low Stock", OUT_OF_STOCK: "Out of Stock" } as const;

export default function StockReportPage() {
  useDocumentTitle("Stock Report");
  const { items, loading } = useCrud<StockRow>("/api/inventory/stock");
  const [filters, setFilters] = useState(initialFilterState);

  const categoryOptions = useMemo(
    () =>
      [...new Set(items.map((r) => r.category?.name).filter((s): s is string => !!s))]
        .sort()
        .map((s) => ({ value: s, label: s })),
    [items]
  );
  const fields: FilterField[] = [
    { key: "category", label: "Category", options: categoryOptions },
    { key: "status", label: "Stock Status", options: STATUS_OPTIONS },
  ];

  const rows = useMemo(
    () =>
      items.filter((r) => {
        if (filters.values.category && r.category?.name !== filters.values.category) return false;
        if (filters.values.status && r.status !== filters.values.status) return false;
        return true;
      }),
    [items, filters.values]
  );

  const totalStockValue = rows.reduce((sum, r) => sum + r.stockValue, 0);
  const valueByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.category?.name ?? "Uncategorized", (map.get(r.category?.name ?? "Uncategorized") ?? 0) + r.stockValue);
    return [...map.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const columns: Column<StockRow>[] = [
    { key: "name", header: "Product", sortable: true },
    { key: "category", header: "Category", render: (r) => r.category?.name ?? "-", exportValue: (r) => r.category?.name ?? "" },
    { key: "openingStock", header: "Opening" },
    { key: "purchase", header: "Purchase" },
    { key: "sales", header: "Sales" },
    { key: "saleReturn", header: "Returns" },
    { key: "adjustment", header: "Adjust." },
    { key: "currentStock", header: "Closing", sortable: true },
    { key: "stockValue", header: "Stock Value", sortable: true, render: (r) => formatCurrency(r.stockValue), exportValue: (r) => r.stockValue },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
      exportValue: (r) => STATUS_LABEL[r.status],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ReportPageHeader
        title="Stock Report"
        description="Current stock, movement summary and valuation (at purchase price)."
        actions={<ReportActions filename="stock-report" disabled={loading} getDocument={() => stockDocument(rows)} />}
      />
      <ReportFilterBar state={filters} onChange={setFilters} fields={fields} showDates={false} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Products" value={String(rows.length)} />
        <StatCard label="Stock Value" value={formatCurrency(totalStockValue)} />
        <StatCard label="Low Stock" value={String(rows.filter((r) => r.status === "LOW_STOCK").length)} />
        <StatCard label="Out of Stock" value={String(rows.filter((r) => r.status === "OUT_OF_STOCK").length)} />
      </div>

      {!loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Stock Value by Category">
            <RankedBars items={valueByCategory} />
          </ChartCard>
          <ChartCard title="Fastest Moving Products" subtitle="By units sold (all time)">
            <RankedBars
              color={SERIES_COLORS.aqua}
              valueLabel={(n) => `${n.toLocaleString("en-IN")} units`}
              items={[...rows].sort((a, b) => b.sales - a.sales).map((r) => ({ name: r.name, amount: r.sales }))}
            />
          </ChartCard>
        </div>
      )}

      <DataTable columns={columns} data={rows} loading={loading} searchKeys={["name", "sku"]} exportFilename="stock-report" rowKey={(r) => r.id} />
    </div>
  );
}
