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
import { gstDocument, type GstReport, type GstRow } from "@/lib/reports";
import { useFilterOptions, useReportData } from "@/lib/useReportData";
import { trendGrouping } from "@/lib/dateRanges";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function GstReportPage() {
  useDocumentTitle("GST Report");
  const [filters, setFilters] = useState(initialFilterState);
  const customerOptions = useFilterOptions("/api/customers");
  const fields: FilterField[] = [{ key: "customerId", label: "Customer", options: customerOptions }];
  const { data, loading, error } = useReportData<GstReport>(`/api/reports/gst?${filterQuery(filters)}`);
  const grouping = trendGrouping(filters.range);

  const trend = useMemo(
    () =>
      bucketByPeriod(
        data?.rows ?? [],
        (r) => r.invoiceDate,
        { cgstSgst: (r) => r.cgst + r.sgst, igst: (r) => r.igst },
        grouping
      ),
    [data, grouping]
  );

  const columns: Column<GstRow>[] = [
    { key: "invoiceNumber", header: "Invoice", sortable: true },
    { key: "invoiceDate", header: "Date", sortable: true, render: (r) => formatDate(r.invoiceDate), exportValue: (r) => formatDate(r.invoiceDate) },
    { key: "customer", header: "Customer", render: (r) => r.customer?.name ?? "Walk-in", exportValue: (r) => r.customer?.name ?? "" },
    { key: "gstin", header: "GSTIN", render: (r) => r.customer?.gstin ?? "-", exportValue: (r) => r.customer?.gstin ?? "" },
    { key: "taxableAmount", header: "Taxable Value", render: (r) => formatCurrency(r.taxableAmount), exportValue: (r) => r.taxableAmount },
    { key: "cgst", header: "CGST", render: (r) => formatCurrency(r.cgst), exportValue: (r) => r.cgst },
    { key: "sgst", header: "SGST", render: (r) => formatCurrency(r.sgst), exportValue: (r) => r.sgst },
    { key: "igst", header: "IGST", render: (r) => formatCurrency(r.igst), exportValue: (r) => r.igst },
    {
      key: "totalGst",
      header: "Total GST",
      render: (r) => formatCurrency(r.cgst + r.sgst + r.igst),
      exportValue: (r) => r.cgst + r.sgst + r.igst,
    },
  ];

  const summary = data?.summary;

  return (
    <div className="flex flex-col gap-4">
      <ReportPageHeader
        title="GST Report"
        description="Output GST on confirmed sales — CGST/SGST for intra-state, IGST for inter-state."
        actions={
          <ReportActions
            filename={`gst-report-${filters.range.from}-to-${filters.range.to}`}
            disabled={!data}
            getDocument={() => gstDocument(data!, describeFilters(filters, fields))}
          />
        }
      />
      <ReportFilterBar state={filters} onChange={setFilters} fields={fields} />

      {error && <ReportError message={error} />}

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="Taxable Value" value={formatCurrency(summary.taxableValue)} />
          <StatCard label="CGST" value={formatCurrency(summary.cgst)} />
          <StatCard label="SGST" value={formatCurrency(summary.sgst)} />
          <StatCard label="IGST" value={formatCurrency(summary.igst)} />
          <StatCard label="Total GST" value={formatCurrency(summary.totalGst)} />
        </div>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="GST Collected" subtitle="Intra-state (CGST+SGST) vs inter-state (IGST)">
              <TrendChart
                data={trend}
                grouping={grouping}
                series={[
                  { key: "cgstSgst", label: "CGST + SGST", color: SERIES_COLORS.blue },
                  { key: "igst", label: "IGST", color: SERIES_COLORS.orange },
                ]}
              />
            </ChartCard>
          </div>
          <ChartCard title="Rate-wise Tax" subtitle="Tax amount per GST slab">
            <RankedBars
              items={data.byRate.map((b) => ({
                name: `${b.gstRate}% slab`,
                amount: b.gstAmount,
                hint: `Taxable ${formatCurrency(b.taxableValue)}`,
              }))}
            />
            {data.byRate.length > 0 && (
              <table className="mt-4 w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1 font-medium">Rate</th>
                    <th className="py-1 text-right font-medium">Taxable</th>
                    <th className="py-1 text-right font-medium">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byRate.map((b) => (
                    <tr key={b.gstRate} className="border-b border-slate-100 last:border-0">
                      <td className="py-1 text-slate-700">{b.gstRate}%</td>
                      <td className="py-1 text-right tabular-nums">{formatCurrency(b.taxableValue)}</td>
                      <td className="py-1 text-right tabular-nums">{formatCurrency(b.gstAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ChartCard>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        loading={loading}
        searchKeys={["invoiceNumber"]}
        searchPlaceholder="Search invoice no..."
        exportFilename="gst-report"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
