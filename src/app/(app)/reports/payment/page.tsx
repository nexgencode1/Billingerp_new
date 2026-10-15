"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useMemo, useState } from "react";
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
import { paymentDocument, type PaymentReport, type PaymentRow } from "@/lib/reports";
import { useReportData } from "@/lib/useReportData";
import { trendGrouping } from "@/lib/dateRanges";
import { formatCurrency, formatDate } from "@/lib/utils";

const DIRECTION_OPTIONS = [
  { value: "RECEIVE", label: "Received (from customers)" },
  { value: "PAY", label: "Paid (to suppliers)" },
];
const METHOD_OPTIONS = ["CASH", "UPI", "CARD", "BANK"].map((m) => ({ value: m, label: m }));

export default function PaymentReportPage() {
  useDocumentTitle("Payment Report");
  const [filters, setFilters] = useState(initialFilterState);
  const fields: FilterField[] = [
    { key: "direction", label: "Type", options: DIRECTION_OPTIONS },
    { key: "method", label: "Method", options: METHOD_OPTIONS },
  ];
  const { data, loading, error } = useReportData<PaymentReport>(`/api/reports/payment?${filterQuery(filters)}`);
  const grouping = trendGrouping(filters.range);

  const trend = useMemo(
    () =>
      bucketByPeriod(
        data?.rows ?? [],
        (r) => r.date,
        {
          received: (r) => (r.direction === "RECEIVE" ? r.amount : 0),
          paid: (r) => (r.direction === "PAY" ? r.amount : 0),
        },
        grouping
      ),
    [data, grouping]
  );

  const columns: Column<PaymentRow>[] = [
    { key: "paymentNumber", header: "Payment No", sortable: true },
    { key: "date", header: "Date", sortable: true, render: (r) => formatDate(r.date), exportValue: (r) => formatDate(r.date) },
    {
      key: "direction",
      header: "Type",
      render: (r) => <Badge tone={r.direction === "RECEIVE" ? "green" : "red"}>{r.direction === "RECEIVE" ? "Received" : "Paid"}</Badge>,
      exportValue: (r) => (r.direction === "RECEIVE" ? "Received" : "Paid"),
    },
    { key: "party", header: "Party", render: (r) => r.customer?.name ?? r.supplier?.name ?? "-", exportValue: (r) => r.customer?.name ?? r.supplier?.name ?? "" },
    {
      key: "against",
      header: "Against",
      render: (r) => r.sale?.invoiceNumber ?? r.purchase?.purchaseNumber ?? "-",
      exportValue: (r) => r.sale?.invoiceNumber ?? r.purchase?.purchaseNumber ?? "",
    },
    { key: "method", header: "Method" },
    { key: "amount", header: "Amount", sortable: true, render: (r) => formatCurrency(r.amount), exportValue: (r) => r.amount },
  ];

  const summary = data?.summary;

  return (
    <div className="flex flex-col gap-4">
      <ReportPageHeader
        title="Payment Report"
        description="Money received from customers and paid to suppliers, by method."
        actions={
          <ReportActions
            filename={`payment-report-${filters.range.from}-to-${filters.range.to}`}
            disabled={!data}
            getDocument={() => paymentDocument(data!, describeFilters(filters, fields))}
          />
        }
      />
      <ReportFilterBar state={filters} onChange={setFilters} fields={fields} />

      {error && <ReportError message={error} />}

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="Total Received" value={formatCurrency(summary.totalReceived)} />
          <StatCard label="Total Paid" value={formatCurrency(summary.totalPaid)} />
          <StatCard label="Net Cash Flow" value={formatCurrency(summary.totalReceived - summary.totalPaid)} />
        </div>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Money In vs Money Out" subtitle={grouping === "day" ? "Daily" : "Monthly"}>
              <TrendChart
                data={trend}
                grouping={grouping}
                series={[
                  { key: "received", label: "Received", color: SERIES_COLORS.aqua },
                  { key: "paid", label: "Paid", color: SERIES_COLORS.orange },
                ]}
              />
            </ChartCard>
          </div>
          <ChartCard title="By Payment Method" subtitle="Received + paid combined">
            <RankedBars
              items={[...summary!.byMethod].sort((a, b) => b.amount - a.amount).map((m) => ({ name: m.method, amount: m.amount }))}
            />
          </ChartCard>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        loading={loading}
        searchKeys={["paymentNumber", "referenceNo"]}
        searchPlaceholder="Search payment / reference no..."
        exportFilename="payment-report"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
