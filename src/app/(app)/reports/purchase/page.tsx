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
import { purchaseDocument, type PurchaseReport, type PurchaseRow } from "@/lib/reports";
import { useFilterOptions, useReportData } from "@/lib/useReportData";
import { trendGrouping } from "@/lib/dateRanges";
import { formatCurrency, formatDate } from "@/lib/utils";

const PAYMENT_STATUS_OPTIONS = [
  { value: "PAID", label: "Paid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "DUE", label: "Unpaid" },
];

export default function PurchaseReportPage() {
  useDocumentTitle("Purchase Report");
  const [filters, setFilters] = useState(initialFilterState);
  const supplierOptions = useFilterOptions("/api/suppliers");
  const fields: FilterField[] = [
    { key: "supplierId", label: "Supplier", options: supplierOptions },
    { key: "paymentStatus", label: "Payment Status", options: PAYMENT_STATUS_OPTIONS },
  ];
  const { data, loading, error } = useReportData<PurchaseReport>(`/api/reports/purchase?${filterQuery(filters)}`);
  const grouping = trendGrouping(filters.range);

  const trend = useMemo(
    () =>
      bucketByPeriod(
        (data?.rows ?? []).filter((r) => r.status === "CONFIRMED"),
        (r) => r.purchaseDate,
        { purchases: (r) => r.grandTotal, paid: (r) => r.paidAmount },
        grouping
      ),
    [data, grouping]
  );

  const columns: Column<PurchaseRow>[] = [
    {
      key: "purchaseNumber",
      header: "Purchase No",
      sortable: true,
      render: (r) => (
        <Link href={`/purchase/invoices/${r.id}`} className="font-medium text-blue-600 hover:underline">
          {r.purchaseNumber}
        </Link>
      ),
      exportValue: (r) => r.purchaseNumber,
    },
    { key: "supplierInvoiceNumber", header: "Supplier Inv", render: (r) => r.supplierInvoiceNumber ?? "-", exportValue: (r) => r.supplierInvoiceNumber ?? "" },
    { key: "purchaseDate", header: "Date", sortable: true, render: (r) => formatDate(r.purchaseDate), exportValue: (r) => formatDate(r.purchaseDate) },
    { key: "supplier", header: "Supplier", render: (r) => r.supplier.name, exportValue: (r) => r.supplier.name },
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
  ];

  const summary = data?.summary;

  return (
    <div className="flex flex-col gap-4">
      <ReportPageHeader
        title="Purchase Report"
        description="Purchase bills, supplier payments and top suppliers for the selected period."
        actions={
          <ReportActions
            filename={`purchase-report-${filters.range.from}-to-${filters.range.to}`}
            disabled={!data}
            getDocument={() => purchaseDocument(data!, describeFilters(filters, fields))}
          />
        }
      />
      <ReportFilterBar state={filters} onChange={setFilters} fields={fields} />

      {error && <ReportError message={error} />}

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Purchases" value={String(summary.totalPurchases)} />
          <StatCard label="Total Amount" value={formatCurrency(summary.totalAmount)} />
          <StatCard label="Taxable Amount" value={formatCurrency(summary.taxableAmount)} />
          <StatCard label="GST (Input)" value={formatCurrency(summary.totalGst)} />
          <StatCard label="Paid" value={formatCurrency(summary.totalPaid)} />
          <StatCard label="Due" value={formatCurrency(summary.totalDue)} />
        </div>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Purchases vs Paid" subtitle={grouping === "day" ? "Daily" : "Monthly"}>
              <TrendChart
                data={trend}
                grouping={grouping}
                series={[
                  { key: "purchases", label: "Purchases", color: SERIES_COLORS.blue },
                  { key: "paid", label: "Paid", color: SERIES_COLORS.orange },
                ]}
              />
            </ChartCard>
          </div>
          <ChartCard title="Top Suppliers" subtitle="By purchase amount">
            <RankedBars items={data.topSuppliers.map((t) => ({ ...t, hint: `${t.quantity} bills` }))} />
          </ChartCard>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        loading={loading}
        searchKeys={["purchaseNumber", "supplierInvoiceNumber"]}
        searchPlaceholder="Search purchase / supplier inv no..."
        exportFilename="purchase-report"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
