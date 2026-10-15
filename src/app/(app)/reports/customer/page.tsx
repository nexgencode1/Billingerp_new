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
import { customerDocument } from "@/lib/reports";
import { formatCurrency } from "@/lib/utils";
import type { Customer } from "@/types/party";

const BALANCE_OPTIONS = [
  { value: "due", label: "With outstanding due" },
  { value: "clear", label: "No due" },
];

export default function CustomerReportPage() {
  useDocumentTitle("Customer Report");
  const { items, loading } = useCrud<Customer>("/api/customers");
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
      items.filter((c) => {
        if (filters.values.state && c.state !== filters.values.state) return false;
        if (filters.values.balance === "due" && !((c.due ?? 0) > 0)) return false;
        if (filters.values.balance === "clear" && (c.due ?? 0) > 0) return false;
        return true;
      }),
    [items, filters.values]
  );

  const totalSales = rows.reduce((s, c) => s + (c.totalSales ?? 0), 0);
  const totalDue = rows.reduce((s, c) => s + (c.due ?? 0), 0);

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      sortable: true,
      render: (r) => (
        <Link href={`/customers/${r.id}/ledger`} className="font-medium text-blue-600 hover:underline">
          {r.name}
        </Link>
      ),
      exportValue: (r) => r.name,
    },
    { key: "mobile", header: "Mobile" },
    { key: "state", header: "State", render: (r) => r.state ?? "-", exportValue: (r) => r.state ?? "" },
    { key: "totalSales", header: "Total Sales", sortable: true, render: (r) => formatCurrency(r.totalSales ?? 0), exportValue: (r) => r.totalSales ?? 0 },
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
        title="Customer Report"
        description="Lifetime sales, collections and outstanding receivables per customer."
        actions={<ReportActions filename="customer-report" disabled={loading} getDocument={() => customerDocument(rows)} />}
      />
      <ReportFilterBar state={filters} onChange={setFilters} fields={fields} showDates={false} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Customers" value={String(rows.length)} />
        <StatCard label="Total Sales" value={formatCurrency(totalSales)} />
        <StatCard label="Receivable" value={formatCurrency(totalDue)} />
        <StatCard label="Customers with Due" value={String(rows.filter((c) => (c.due ?? 0) > 0).length)} />
      </div>

      {!loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Top Customers" subtitle="By lifetime sales">
            <RankedBars items={[...rows].sort((a, b) => (b.totalSales ?? 0) - (a.totalSales ?? 0)).map((c) => ({ name: c.name, amount: c.totalSales ?? 0 }))} />
          </ChartCard>
          <ChartCard title="Highest Receivables" subtitle="Who owes you the most">
            <RankedBars
              color={SERIES_COLORS.orange}
              items={rows.filter((c) => (c.due ?? 0) > 0).sort((a, b) => (b.due ?? 0) - (a.due ?? 0)).map((c) => ({ name: c.name, amount: c.due ?? 0 }))}
            />
          </ChartCard>
        </div>
      )}

      <DataTable columns={columns} data={rows} loading={loading} searchKeys={["name", "mobile"]} exportFilename="customer-report" rowKey={(r) => r.id} />
    </div>
  );
}
