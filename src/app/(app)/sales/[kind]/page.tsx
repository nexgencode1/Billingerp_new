"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ArrowRightLeft, Eye, Plus } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { StatCard } from "@/components/reports/StatCard";
import {
  ReportFilterBar,
  filterQuery,
  initialFilterState,
  type FilterField,
  type ReportFilterState,
} from "@/components/reports/ReportFilterBar";
import { useFilterOptions, useReportData } from "@/lib/useReportData";
import { DOC_STATUS_TONE, salesDocConfig, type SalesDocListRow } from "@/lib/salesDocs";
import { rangeForPreset } from "@/lib/dateRanges";
import { formatCurrency, formatDate } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "CONVERTED", label: "Converted" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function SalesDocumentListPage() {
  const { kind } = useParams<{ kind: string }>();
  const config = salesDocConfig(kind);
  useDocumentTitle(config?.title ?? "Sales");
  // Documents default to the current financial year so older open quotes don't vanish.
  const [filters, setFilters] = useState<ReportFilterState>(() => ({ ...initialFilterState(), preset: "thisFy", range: rangeForPreset("thisFy") }));
  const customerOptions = useFilterOptions("/api/customers");
  const { data, loading, error } = useReportData<SalesDocListRow[]>(
    config ? `/api/sales-documents?type=${config.docType}&${filterQuery(filters)}` : null
  );

  if (!config) notFound();

  const fields: FilterField[] = [
    { key: "status", label: "Status", options: STATUS_OPTIONS },
    { key: "customerId", label: "Customer", options: customerOptions },
  ];

  const rows = data ?? [];
  const open = rows.filter((r) => r.status === "OPEN");
  const converted = rows.filter((r) => r.status === "CONVERTED");
  const nonCancelled = rows.filter((r) => r.status !== "CANCELLED").length;
  const conversionRate = nonCancelled > 0 ? (converted.length / nonCancelled) * 100 : 0;

  const columns: Column<SalesDocListRow>[] = [
    {
      key: "docNumber",
      header: `${config.singular} No`,
      sortable: true,
      render: (r) => (
        <Link href={`/sales/${kind}/${r.id}`} className="font-medium text-blue-600 hover:underline">
          {r.docNumber}
        </Link>
      ),
      exportValue: (r) => r.docNumber,
    },
    { key: "docDate", header: "Date", sortable: true, render: (r) => formatDate(r.docDate), exportValue: (r) => formatDate(r.docDate) },
    { key: "customer", header: "Customer", render: (r) => r.customer?.name ?? "Walk-in", exportValue: (r) => r.customer?.name ?? "Walk-in" },
    { key: "itemCount", header: "Items" },
    { key: "grandTotal", header: "Amount", sortable: true, render: (r) => formatCurrency(r.grandTotal), exportValue: (r) => r.grandTotal },
    {
      key: "dueDate",
      header: config.dueDateLabel,
      render: (r) => {
        if (!r.dueDate) return "-";
        const overdue = r.status === "OPEN" && new Date(r.dueDate) < new Date(new Date().toDateString());
        return <span className={overdue ? "font-medium text-red-600" : ""}>{formatDate(r.dueDate)}</span>;
      },
      exportValue: (r) => (r.dueDate ? formatDate(r.dueDate) : ""),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={DOC_STATUS_TONE[r.status]}>{r.status}</Badge>
          {r.convertedSaleId && (
            <Link href={`/sales/invoices/${r.convertedSaleId}`} className="text-xs text-blue-600 hover:underline">
              {r.convertedInvoiceNumber}
            </Link>
          )}
        </span>
      ),
      exportValue: (r) => (r.convertedInvoiceNumber ? `${r.status} (${r.convertedInvoiceNumber})` : r.status),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{config.title}</h1>
          <p className="text-sm text-slate-500">{config.description}</p>
        </div>
        <Link href={`/sales/${kind}/new`} data-tour="new-sales-document">
          <Button>
            <Plus className="h-4 w-4" /> New {config.singular}
          </Button>
        </Link>
      </div>

      <ReportFilterBar state={filters} onChange={setFilters} fields={fields} />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={`Total ${config.title}`} value={String(rows.length)} />
        <StatCard label="Open" value={`${open.length} · ${formatCurrency(open.reduce((s, r) => s + r.grandTotal, 0))}`} />
        <StatCard label="Converted to Invoice" value={`${converted.length} · ${formatCurrency(converted.reduce((s, r) => s + r.grandTotal, 0))}`} />
        <StatCard label="Conversion Rate" value={`${conversionRate.toFixed(0)}%`} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        searchKeys={["docNumber"]}
        searchPlaceholder={`Search ${config.singular.toLowerCase()} no...`}
        exportFilename={config.kind}
        title={config.title}
        rowKey={(r) => r.id}
        emptyTitle={`No ${config.title.toLowerCase()} in this period.`}
        rowActions={(r) => (
          <>
            <Link href={`/sales/${kind}/${r.id}`} title="View">
              <Button variant="ghost" size="sm" aria-label={`View ${r.docNumber}`}>
                <Eye className="h-4 w-4" />
              </Button>
            </Link>
            {r.status === "OPEN" && (
              <Link href={`/sales/new?fromDocument=${r.id}`} title="Convert to Invoice">
                <Button variant="outline" size="sm">
                  <ArrowRightLeft className="h-4 w-4" /> Invoice
                </Button>
              </Link>
            )}
          </>
        )}
      />
    </div>
  );
}
