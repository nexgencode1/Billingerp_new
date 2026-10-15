"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Boxes,
  FileSpreadsheet,
  FileText,
  Loader2,
  Percent,
  Printer,
  Receipt,
  Scale,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/common/Button";
import { StatCard } from "@/components/reports/StatCard";
import { ReportFilterBar, describeFilters, initialFilterState } from "@/components/reports/ReportFilterBar";
import { ChartCard, SERIES_COLORS, TrendChart, type TrendPoint } from "@/components/reports/ReportCharts";
import { useReportData } from "@/lib/useReportData";
import { trendGrouping } from "@/lib/dateRanges";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/toast-store";
import { exportReportsToExcel, exportReportsToPdf, printReports, type ReportDocument } from "@/lib/reportExport";
import {
  balanceSheetDocument,
  customerDocument,
  dayBookDocument,
  expenseDocument,
  fetchJson,
  gstDocument,
  paymentDocument,
  profitDocument,
  purchaseDocument,
  salesDocument,
  stockDocument,
  supplierDocument,
  type BalanceSheet,
  type DayBookReport,
  type ExpenseReport,
  type GstReport,
  type PaymentReport,
  type ProfitReport,
  type PurchaseReport,
  type SalesReport,
} from "@/lib/reports";
import type { Customer, Supplier } from "@/types/party";
import type { StockRow } from "@/types/inventory";

const REPORTS = [
  { href: "/reports/sales", title: "Sales Report", description: "Invoices, collections, top products", icon: Receipt },
  { href: "/reports/purchase", title: "Purchase Report", description: "Bills, supplier payments, top suppliers", icon: ShoppingCart },
  { href: "/reports/profit", title: "Profit & Loss", description: "Gross & net profit, item-wise margin", icon: TrendingUp },
  { href: "/reports/gst", title: "GST Report", description: "CGST / SGST / IGST, rate-wise summary", icon: Percent },
  { href: "/reports/payment", title: "Payment Report", description: "Money in vs out, by method", icon: Wallet },
  { href: "/reports/expense", title: "Expense Report", description: "Spend by category and method", icon: FileText },
  { href: "/reports/stock", title: "Stock Report", description: "Closing stock, valuation, low stock", icon: Boxes },
  { href: "/reports/customer", title: "Customer Report", description: "Sales and receivables per customer", icon: Users },
  { href: "/reports/supplier", title: "Supplier Report", description: "Purchases and payables per supplier", icon: Truck },
  { href: "/reports/ask", title: "Ask Your Business", description: "Type a question in Hindi / English, get the answer", icon: TrendingUp },
  { href: "/reports/gstr", title: "GSTR-1 / GSTR-3B", description: "GST return data, JSON & Excel", icon: Percent },
  { href: "/reports/day-book", title: "Day Book", description: "Every transaction of the day, money in & out", icon: BookOpen },
  { href: "/reports/balance-sheet", title: "Balance Sheet", description: "Assets, liabilities and owner's equity", icon: Scale },
];

type Format = "excel" | "pdf" | "print";

export default function ReportsHubPage() {
  useDocumentTitle("Reports");
  const [filters, setFilters] = useState(initialFilterState);
  const [busy, setBusy] = useState<Format | null>(null);
  const { from, to } = filters.range;
  const grouping = trendGrouping(filters.range);
  const trend = useReportData<TrendPoint[]>(`/api/reports/trend?from=${from}&to=${to}&groupBy=${grouping}`);

  const totals = (trend.data ?? []).reduce(
    (acc, p) => ({
      sales: acc.sales + p.sales,
      purchases: acc.purchases + p.purchases,
      expenses: acc.expenses + p.expenses,
      netProfit: acc.netProfit + p.netProfit,
    }),
    { sales: 0, purchases: 0, expenses: 0, netProfit: 0 }
  );

  // Builds every report for the selected period. A report the current role can't access is
  // skipped (and reported) instead of failing the whole download.
  async function buildAllDocuments(): Promise<ReportDocument[]> {
    const q = `from=${from}&to=${to}`;
    const subtitle = describeFilters(filters);
    const jobs: { name: string; run: () => Promise<ReportDocument> }[] = [
      { name: "Sales", run: async () => salesDocument(await fetchJson<SalesReport>(`/api/reports/sales?${q}`), subtitle) },
      { name: "Purchase", run: async () => purchaseDocument(await fetchJson<PurchaseReport>(`/api/reports/purchase?${q}`), subtitle) },
      { name: "Profit", run: async () => profitDocument(await fetchJson<ProfitReport>(`/api/reports/profit?${q}`), subtitle) },
      { name: "GST", run: async () => gstDocument(await fetchJson<GstReport>(`/api/reports/gst?${q}`), subtitle) },
      { name: "Payment", run: async () => paymentDocument(await fetchJson<PaymentReport>(`/api/reports/payment?${q}`), subtitle) },
      { name: "Expense", run: async () => expenseDocument(await fetchJson<ExpenseReport>(`/api/reports/expense?${q}`), subtitle) },
      { name: "Stock", run: async () => stockDocument(await fetchJson<StockRow[]>("/api/inventory/stock")) },
      { name: "Customer", run: async () => customerDocument(await fetchJson<Customer[]>("/api/customers")) },
      { name: "Supplier", run: async () => supplierDocument(await fetchJson<Supplier[]>("/api/suppliers")) },
      { name: "Day Book", run: async () => dayBookDocument(await fetchJson<DayBookReport>(`/api/reports/day-book?${q}`), subtitle) },
      { name: "Balance Sheet", run: async () => balanceSheetDocument(await fetchJson<BalanceSheet>("/api/reports/balance-sheet")) },
    ];
    const results = await Promise.allSettled(jobs.map((j) => j.run()));
    const skipped = jobs.filter((_, i) => results[i].status === "rejected").map((j) => j.name);
    if (skipped.length > 0) toast.error(`Skipped (no access or error): ${skipped.join(", ")}`);
    return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  }

  async function handle(format: Format) {
    setBusy(format);
    try {
      const docs = await buildAllDocuments();
      if (docs.length === 0) return;
      const filename = `all-reports-${from}-to-${to}`;
      if (format === "excel") exportReportsToExcel(filename, docs);
      else if (format === "pdf") exportReportsToPdf(filename, docs);
      else printReports(docs);
      toast.success(`${docs.length} reports ready.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Business overview for the selected period, and every report in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-tour="reports-download-all">
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => handle("print")}>
            {busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print All
          </Button>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => handle("pdf")}>
            {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} All Reports PDF
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => handle("excel")}>
            {busy === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} All Reports Excel
          </Button>
        </div>
      </div>

      <ReportFilterBar state={filters} onChange={setFilters} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sales" value={formatCurrency(totals.sales)} />
        <StatCard label="Purchases" value={formatCurrency(totals.purchases)} />
        <StatCard label="Expenses" value={formatCurrency(totals.expenses)} />
        <StatCard label="Net Profit" value={formatCurrency(totals.netProfit)} />
      </div>

      <ChartCard title="Business Overview" subtitle={grouping === "day" ? "Daily" : "Monthly"}>
        <TrendChart
          data={trend.data ?? []}
          grouping={grouping}
          series={[
            { key: "sales", label: "Sales", color: SERIES_COLORS.blue },
            { key: "purchases", label: "Purchases", color: SERIES_COLORS.orange },
            { key: "expenses", label: "Expenses", color: SERIES_COLORS.aqua },
          ]}
        />
      </ChartCard>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <BarChart3 className="h-4 w-4 text-slate-400" /> All Reports
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
            >
              <span className="rounded-md bg-blue-50 p-2 text-blue-600 group-hover:bg-blue-100">
                <r.icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{r.title}</span>
                <span className="block text-xs text-slate-500">{r.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
