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
  initialFilterState,
  type FilterField,
  type ReportFilterState,
} from "@/components/reports/ReportFilterBar";
import { ReportActions } from "@/components/reports/ReportActions";
import { ReportError, ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { DAY_BOOK_TYPE_LABEL, dayBookDocument, type DayBookReport, type DayBookRow } from "@/lib/reports";
import { useReportData } from "@/lib/useReportData";
import { rangeForPreset } from "@/lib/dateRanges";
import { formatCurrency, formatDate } from "@/lib/utils";

const LINKS: Record<string, string> = {
  SALE: "/sales/invoices/",
  PURCHASE: "/purchase/invoices/",
  ESTIMATE: "/sales/estimates/",
  SALE_ORDER: "/sales/orders/",
  DELIVERY_CHALLAN: "/sales/challans/",
};

const TONE: Record<string, "green" | "red" | "blue" | "yellow" | "slate"> = {
  SALE: "blue",
  PURCHASE: "yellow",
  PAYMENT_IN: "green",
  PAYMENT_OUT: "red",
  EXPENSE: "red",
  SALE_REFUND: "red",
  CREDIT_NOTE: "yellow",
  DEBIT_NOTE: "yellow",
};

const GROUP_OPTIONS = [
  { value: "documents", label: "Documents (sale, purchase, notes, quotes)" },
  { value: "money", label: "Money movements (payments, expenses, transfers)" },
];

export default function DayBookPage() {
  useDocumentTitle("Day Book");
  // A day book is read one day at a time by default.
  const [filters, setFilters] = useState<ReportFilterState>(() => ({ ...initialFilterState(), preset: "today", range: rangeForPreset("today") }));
  const fields: FilterField[] = [{ key: "group", label: "Show", options: GROUP_OPTIONS }];
  const { data, loading, error } = useReportData<DayBookReport>(`/api/reports/day-book?from=${filters.range.from}&to=${filters.range.to}`);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (filters.values.group === "documents") return all.filter((r) => r.moneyIn === 0 && r.moneyOut === 0);
    if (filters.values.group === "money") return all.filter((r) => r.moneyIn > 0 || r.moneyOut > 0);
    return all;
  }, [data, filters.values.group]);

  const columns: Column<DayBookRow>[] = [
    { key: "date", header: "Date", sortable: true, render: (r) => formatDate(r.date), exportValue: (r) => formatDate(r.date) },
    {
      key: "type",
      header: "Type",
      render: (r) => <Badge tone={TONE[r.type] ?? "slate"}>{DAY_BOOK_TYPE_LABEL[r.type] ?? r.type}</Badge>,
      exportValue: (r) => DAY_BOOK_TYPE_LABEL[r.type] ?? r.type,
    },
    {
      key: "refNumber",
      header: "Ref No",
      render: (r) =>
        LINKS[r.type] ? (
          <Link href={`${LINKS[r.type]}${r.refId}`} className="font-medium text-blue-600 hover:underline">
            {r.refNumber}
          </Link>
        ) : (
          r.refNumber
        ),
      exportValue: (r) => r.refNumber,
    },
    { key: "partyName", header: "Party", render: (r) => r.partyName ?? "-", exportValue: (r) => r.partyName ?? "" },
    { key: "description", header: "Description", className: "max-w-xs truncate" },
    { key: "total", header: "Total", render: (r) => (r.total ? formatCurrency(r.total) : ""), exportValue: (r) => r.total || "" },
    {
      key: "moneyIn",
      header: "Money In",
      render: (r) => (r.moneyIn ? <span className="text-green-700">{formatCurrency(r.moneyIn)}</span> : ""),
      exportValue: (r) => r.moneyIn || "",
    },
    {
      key: "moneyOut",
      header: "Money Out",
      render: (r) => (r.moneyOut ? <span className="text-red-600">{formatCurrency(r.moneyOut)}</span> : ""),
      exportValue: (r) => r.moneyOut || "",
    },
  ];

  const s = data?.summary;

  return (
    <div className="flex flex-col gap-4">
      <ReportPageHeader
        title="Day Book"
        description="Every transaction of the day in one place — sales, purchases, payments, expenses, returns and transfers."
        actions={
          <ReportActions
            filename={`day-book-${filters.range.from}-to-${filters.range.to}`}
            disabled={!data}
            getDocument={() => dayBookDocument({ summary: data!.summary, rows }, describeFilters(filters, fields))}
          />
        }
      />
      <ReportFilterBar state={filters} onChange={setFilters} fields={fields} />
      {error && <ReportError message={error} />}

      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Money In" value={formatCurrency(s.moneyIn)} />
          <StatCard label="Money Out" value={formatCurrency(s.moneyOut)} />
          <StatCard label="Net Cash Flow" value={formatCurrency(s.net)} />
          <StatCard label="Sales" value={formatCurrency(s.salesTotal)} />
          <StatCard label="Purchases" value={formatCurrency(s.purchaseTotal)} />
          <StatCard label="Expenses" value={formatCurrency(s.expenseTotal)} />
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        searchKeys={["refNumber", "partyName", "description"]}
        searchPlaceholder="Search ref no, party, description..."
        exportFilename="day-book"
        rowKey={(r) => r.key}
        pageSize={50}
        emptyTitle="No transactions in this period."
      />
    </div>
  );
}
