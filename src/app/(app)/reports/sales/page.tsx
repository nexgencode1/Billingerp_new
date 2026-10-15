"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { StatCard } from "@/components/reports/StatCard";
import { Badge } from "@/components/common/Badge";
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
import { salesDocument, type SalesReport, type SalesRow } from "@/lib/reports";
import { useFilterOptions, useReportData } from "@/lib/useReportData";
import { trendGrouping } from "@/lib/dateRanges";
import { formatCurrency, formatDate } from "@/lib/utils";

const PAYMENT_STATUS_OPTIONS = [
  { value: "PAID", label: "Paid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "DUE", label: "Unpaid" },
];

export default function SalesReportPage() {
  useDocumentTitle("Sales Report");
  const [filters, setFilters] = useState(initialFilterState);
  const customerOptions = useFilterOptions("/api/customers");
  const fields: FilterField[] = [
    { key: "customerId", label: "Customer", options: customerOptions },
    { key: "paymentStatus", label: "Payment Status", options: PAYMENT_STATUS_OPTIONS },
  ];
  const { data, loading, error } = useReportData<SalesReport>(`/api/reports/sales?${filterQuery(filters)}`);
  const grouping = trendGrouping(filters.range);

  const trend = useMemo(
    () =>
      bucketByPeriod(
        (data?.rows ?? []).filter((r) => r.status === "CONFIRMED"),
        (r) => r.invoiceDate,
        { sales: (r) => r.grandTotal, received: (r) => r.paidAmount },
        grouping
      ),
    [data, grouping]
  );

  const columns: Column<SalesRow>[] = [
    {
      key: "invoiceNumber",
      header: "Invoice No",
      sortable: true,
      render: (r) => (
        <Link href={`/sales/invoices/${r.id}`} className="font-medium text-blue-600 hover:underline">
          {r.invoiceNumber}
        </Link>
      ),
      exportValue: (r) => r.invoiceNumber,
    },
    { key: "invoiceDate", header: "Date", sortable: true, render: (r) => formatDate(r.invoiceDate), exportValue: (r) => formatDate(r.invoiceDate) },
    { key: "customer", header: "Customer", render: (r) => r.customer?.name ?? "Walk-in", exportValue: (r) => r.customer?.name ?? "Walk-in" },
    { key: "grandTotal", header: "Amount", sortable: true, render: (r) => formatCurrency(r.grandTotal), exportValue: (r) => r.grandTotal },
    { key: "paidAmount", header: "Paid", render: (r) => formatCurrency(r.paidAmount), exportValue: (r) => r.paidAmount },
    { key: "dueAmount", header: "Due", sortable: true, render: (r) => formatCurrency(r.dueAmount), exportValue: (r) => r.dueAmount },
    {
      key: "paymentStatus",
      header: "Payment",
      render: (r) => (
        <Badge tone={r.paymentStatus === "PAID" ? "green" : r.paymentStatus === "PARTIAL" ? "yellow" : "red"}>{r.paymentStatus}</Badge>
      ),
      exportValue: (r) => r.paymentStatus,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={r.status === "CANCELLED" ? "red" : "slate"}>{r.status}</Badge>,
      exportValue: (r) => r.status,
    },
  ];

  const summary = data?.summary;

  return (
    <div className="flex flex-col gap-4">
      <ReportPageHeader
        title="Sales Report"
        description="Invoices, collections and top-selling products for the selected period."
        actions={
          <ReportActions
            filename={`sales-report-${filters.range.from}-to-${filters.range.to}`}
            disabled={!data}
            getDocument={() => salesDocument(data!, describeFilters(filters, fields))}
          />
        }
      />
      <ReportFilterBar state={filters} onChange={setFilters} fields={fields} />

      {error && <ReportError message={error} />}

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <StatCard label="Invoices" value={String(summary.totalInvoices)} />
          <StatCard label="Total Sales" value={formatCurrency(summary.totalSales)} />
          <StatCard label="Discount" value={formatCurrency(summary.totalDiscount)} />
          <StatCard label="Taxable Amount" value={formatCurrency(summary.taxableAmount)} />
          <StatCard label="GST" value={formatCurrency(summary.totalGst)} />
          <StatCard label="Received" value={formatCurrency(summary.totalPaid)} />
          <StatCard label="Due" value={formatCurrency(summary.totalDue)} />
        </div>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Sales vs Received" subtitle={grouping === "day" ? "Daily" : "Monthly"}>
              <TrendChart
                data={trend}
                grouping={grouping}
                series={[
                  { key: "sales", label: "Sales", color: SERIES_COLORS.blue },
                  { key: "received", label: "Received", color: SERIES_COLORS.aqua },
                ]}
              />
            </ChartCard>
          </div>
          <ChartCard title="Top Selling Products" subtitle="By sales amount">
            <RankedBars items={data.topItems.map((t) => ({ ...t, hint: `${t.quantity} sold` }))} />
          </ChartCard>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        loading={loading}
        searchKeys={["invoiceNumber"]}
        searchPlaceholder="Search invoice no..."
        exportFilename="sales-report"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
