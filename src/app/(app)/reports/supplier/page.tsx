"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { StatCard } from "@/components/reports/StatCard";
import { ReportFilterBar, initialFilterState, type FilterField } from "@/components/reports/ReportFilterBar";
import { ReportActions } from "@/components/reports/ReportActions";
import { ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { ChartCard, RankedBars, SERIES_COLORS } from "@/components/reports/ReportCharts";
import { useCrud } from "@/lib/useCrud";
import { supplierDocument } from "@/lib/reports";
import { formatCurrency } from "@/lib/utils";
import type { Supplier } from "@/types/party";

const BALANCE_OPTIONS = [
  { value: "due", label: "With outstanding due" },
  { value: "clear", label: "No due" },
];

export default function SupplierReportPage() {
  useDocumentTitle("Supplier Report");
  const { items, loading } = useCrud<Supplier>("/api/suppliers");
  const [filters, setFilters] = useState(initialFilterState);

  const stateOptions = useMemo(
    () => [...new Set(items.map((c) => c.state).filter((s): s is string => !!s))].sort().map((s) => ({ value: s, label: s })),
    [items]
  );
  const fields: FilterField[] = [
    { key: "state", label: "State", options: stateOptions },
    { key: "balance", label: "Balance", options: BALANCE_OPTIONS },
  ];

  const rows = useMemo(
    () =>
      items.filter((s) => {
        if (filters.values.state && s.state !== filters.values.state) return false;
        if (filters.values.balance === "due" && !((s.due ?? 0) > 0)) return false;
        if (filters.values.balance === "clear" && (s.due ?? 0) > 0) return false;
        return true;
      }),
    [items, filters.values]
  );

  const totalPurchase = rows.reduce((s, c) => s + (c.totalPurchase ?? 0), 0);
  const totalDue = rows.reduce((s, c) => s + (c.due ?? 0), 0);

  const columns: Column<Supplier>[] = [
    {
      key: "name",
      header: "Supplier",
      sortable: true,
      render: (r) => (
        <Link href={`/suppliers/${r.id}/ledger`} className="font-medium text-blue-600 hover:underline">
          {r.name}
        </Link>
      ),
      exportValue: (r) => r.name,
    },
    { key: "mobile", header: "Mobile" },
    { key: "state", header: "State", render: (r) => r.state ?? "-", exportValue: (r) => r.state ?? "" },
    { key: "totalPurchase", header: "Total Purchase", sortable: true, render: (r) => formatCurrency(r.totalPurchase ?? 0), exportValue: (r) => r.totalPurchase ?? 0 },
    { key: "paid", header: "Paid", render: (r) => formatCurrency(r.paid ?? 0), exportValue: (r) => r.paid ?? 0 },
    {
      key: "due",
      header: "Due",
      sortable: true,
      render: (r) => <span className={(r.due ?? 0) > 0 ? "font-medium text-red-600" : ""}>{formatCurrency(r.due ?? 0)}</span>,
      exportValue: (r) => r.due ?? 0,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ReportPageHeader
        title="Supplier Report"
        description="Lifetime purchases, payments and outstanding payables per supplier."
        actions={<ReportActions filename="supplier-report" disabled={loading} getDocument={() => supplierDocument(rows)} />}
      />
      <ReportFilterBar state={filters} onChange={setFilters} fields={fields} showDates={false} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Suppliers" value={String(rows.length)} />
        <StatCard label="Total Purchase" value={formatCurrency(totalPurchase)} />
        <StatCard label="Payable" value={formatCurrency(totalDue)} />
        <StatCard label="Suppliers with Due" value={String(rows.filter((c) => (c.due ?? 0) > 0).length)} />
      </div>

      {!loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Top Suppliers" subtitle="By lifetime purchase">
            <RankedBars items={[...rows].sort((a, b) => (b.totalPurchase ?? 0) - (a.totalPurchase ?? 0)).map((c) => ({ name: c.name, amount: c.totalPurchase ?? 0 }))} />
          </ChartCard>
          <ChartCard title="Highest Payables" subtitle="Who you owe the most">
            <RankedBars
              color={SERIES_COLORS.orange}
              items={rows.filter((c) => (c.due ?? 0) > 0).sort((a, b) => (b.due ?? 0) - (a.due ?? 0)).map((c) => ({ name: c.name, amount: c.due ?? 0 }))}
            />
          </ChartCard>
        </div>
      )}

      <DataTable columns={columns} data={rows} loading={loading} searchKeys={["name", "mobile"]} exportFilename="supplier-report" rowKey={(r) => r.id} />
    </div>
  );
}
