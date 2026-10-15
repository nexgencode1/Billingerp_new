"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useMemo, useState } from "react";
import { Badge } from "@/components/common/Badge";
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
import { ChartCard, RankedBars } from "@/components/reports/ReportCharts";
import { useFilterOptions, useReportData } from "@/lib/useReportData";
import type { ReportDocument } from "@/lib/reportExport";

interface AuditRow {
  id: number;
  createdAt: string;
  userId: number | null;
  userName: string;
  userEmail: string | null;
  action: string;
  module: string;
  recordId: number | null;
  recordLabel: string | null;
  ipAddress: string | null;
}

interface AuditResponse {
  truncated: boolean;
  modules: string[];
  actions: string[];
  rows: AuditRow[];
}

const ACTION_TONE: Record<string, "green" | "blue" | "red" | "yellow" | "slate"> = {
  CREATE: "green",
  UPDATE: "blue",
  DELETE: "red",
  CANCEL: "red",
  LOGIN: "slate",
  RESTORE: "yellow",
  EXPORT: "slate",
};

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AuditLogPage() {
  useDocumentTitle("Audit Log");
  const [filters, setFilters] = useState(initialFilterState);
  const userOptions = useFilterOptions("/api/users");
  const { data, loading, error } = useReportData<AuditResponse>(`/api/audit-logs?${filterQuery(filters)}`);

  const fields: FilterField[] = [
    { key: "module", label: "Module", options: (data?.modules ?? []).map((m) => ({ value: m, label: m })) },
    { key: "action", label: "Action", options: (data?.actions ?? []).map((a) => ({ value: a, label: a })) },
    { key: "userId", label: "User", options: userOptions },
  ];

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const byUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.userName, (m.get(r.userName) ?? 0) + 1);
    return [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [rows]);
  const byModule = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.module, (m.get(r.module) ?? 0) + 1);
    return [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const columns: Column<AuditRow>[] = [
    { key: "createdAt", header: "When", sortable: true, render: (r) => dateTime(r.createdAt), exportValue: (r) => dateTime(r.createdAt) },
    {
      key: "userName",
      header: "User",
      sortable: true,
      render: (r) => (
        <span>
          <span className="font-medium text-slate-800">{r.userName}</span>
          {r.userEmail && <span className="block text-xs text-slate-400">{r.userEmail}</span>}
        </span>
      ),
      exportValue: (r) => r.userName,
    },
    { key: "action", header: "Action", render: (r) => <Badge tone={ACTION_TONE[r.action] ?? "slate"}>{r.action}</Badge>, exportValue: (r) => r.action },
    { key: "module", header: "Module", sortable: true },
    { key: "recordLabel", header: "Record", render: (r) => r.recordLabel ?? (r.recordId ? `#${r.recordId}` : "-"), exportValue: (r) => r.recordLabel ?? (r.recordId ? `#${r.recordId}` : "") },
    { key: "ipAddress", header: "IP", render: (r) => r.ipAddress ?? "-", exportValue: (r) => r.ipAddress ?? "" },
  ];

  const toDocument = (): ReportDocument => ({
    title: "Audit Log",
    subtitle: describeFilters(filters, fields),
    summary: [
      { label: "Entries", value: rows.length },
      { label: "Users", value: byUser.length },
    ],
    sections: [
      {
        title: "Activity",
        columns: ["When", "User", "Action", "Module", "Record", "IP"],
        rows: rows.map((r) => [dateTime(r.createdAt), r.userName, r.action, r.module, r.recordLabel ?? (r.recordId ? `#${r.recordId}` : ""), r.ipAddress ?? ""]),
      },
    ],
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500">Who created, changed, cancelled or deleted what — and when.</p>
        </div>
        <ReportActions filename={`audit-log-${filters.range.from}-to-${filters.range.to}`} disabled={!data} getDocument={toDocument} />
      </div>

      <ReportFilterBar state={filters} onChange={setFilters} fields={fields} />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {data?.truncated && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Showing the latest 2,000 entries — narrow the period or filters to see older activity.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Entries" value={String(rows.length)} />
        <StatCard label="Active Users" value={String(byUser.length)} />
        <StatCard label="Creates" value={String(rows.filter((r) => r.action === "CREATE").length)} />
        <StatCard label="Cancels / Deletes" value={String(rows.filter((r) => r.action === "CANCEL" || r.action === "DELETE").length)} />
      </div>

      {rows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Activity by User">
            <RankedBars items={byUser} valueLabel={(n) => `${n} actions`} />
          </ChartCard>
          <ChartCard title="Activity by Module">
            <RankedBars items={byModule} valueLabel={(n) => `${n} actions`} />
          </ChartCard>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        searchKeys={["userName", "recordLabel", "module"]}
        searchPlaceholder="Search user, record, module..."
        exportFilename="audit-log"
        rowKey={(r) => r.id}
        pageSize={50}
        emptyTitle="No activity in this period."
      />
    </div>
  );
}
