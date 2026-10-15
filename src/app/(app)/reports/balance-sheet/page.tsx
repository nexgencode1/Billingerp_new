"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { Info } from "lucide-react";
import { ReportActions } from "@/components/reports/ReportActions";
import { ReportError, ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { StatCard } from "@/components/reports/StatCard";
import { balanceSheetDocument, type BalanceLine, type BalanceSheet } from "@/lib/reports";
import { useReportData } from "@/lib/useReportData";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function BalanceSheetPage() {
  useDocumentTitle("Balance Sheet");
  const { data, loading, error } = useReportData<BalanceSheet>("/api/reports/balance-sheet");

  return (
    <div className="flex flex-col gap-4">
      <ReportPageHeader
        title="Balance Sheet"
        description={data ? `As of ${formatDate(data.asOf)}` : "What the business owns and owes, as of today."}
        actions={<ReportActions filename="balance-sheet" disabled={!data} getDocument={() => balanceSheetDocument(data!)} />}
      />

      {error && <ReportError message={error} />}
      {loading && !data && <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Loading...</div>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Total Assets" value={formatCurrency(data.totalAssets)} />
            <StatCard label="Total Liabilities" value={formatCurrency(data.totalLiabilities)} />
            <StatCard label="Owner's Equity" value={formatCurrency(data.totalEquity)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Statement title="Assets" lines={data.assets} totalLabel="Total Assets" total={data.totalAssets} />
            <div className="flex flex-col gap-4">
              <Statement title="Liabilities" lines={data.liabilities} totalLabel="Total Liabilities" total={data.totalLiabilities} />
              <Statement title="Owner's Equity" lines={data.equity} totalLabel="Total Equity" total={data.totalEquity} />
              <div className="flex justify-between rounded-lg border-2 border-slate-300 bg-white px-5 py-3 text-sm font-bold">
                <span>Liabilities + Equity</span>
                <span className="tabular-nums">{formatCurrency(data.totalLiabilities + data.totalEquity)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Cash &amp; Bank Accounts</h3>
            <ul className="divide-y divide-slate-100 text-sm">
              {data.accounts.map((a) => (
                <li key={a.name} className="flex justify-between py-1.5">
                  <span className="text-slate-600">
                    {a.name} <span className="text-xs text-slate-400">({a.kind === "CASH" ? "Cash" : "Bank"})</span>
                  </span>
                  <span className={`tabular-nums ${a.balance < 0 ? "text-red-600" : ""}`}>{formatCurrency(a.balance)}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Simplified statement built from this app&apos;s own records: stock is valued at current purchase price, GST payable is
            output minus input GST without deducting GST already paid to the government (that payment isn&apos;t recorded here),
            and owner&apos;s capital is the balancing figure. Have your accountant verify before using it for filing or loans.
          </p>
        </>
      )}
    </div>
  );
}

function Statement({ title, lines, totalLabel, total }: { title: string; lines: BalanceLine[]; totalLabel: string; total: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="flex flex-col gap-2 text-sm">
        {lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-4">
            <span className="text-slate-700">{l.label}</span>
            <span className={`tabular-nums ${l.amount < 0 ? "text-red-600" : ""}`}>{formatCurrency(l.amount)}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 font-bold">
          <span>{totalLabel}</span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
