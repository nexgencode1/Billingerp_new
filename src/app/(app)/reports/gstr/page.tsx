"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useState } from "react";
import { AlertTriangle, FileJson, Info } from "lucide-react";
import { Button } from "@/components/common/Button";
import { StatCard } from "@/components/reports/StatCard";
import { ReportFilterBar, describeFilters, initialFilterState, type ReportFilterState } from "@/components/reports/ReportFilterBar";
import { ReportActions } from "@/components/reports/ReportActions";
import { ReportError, ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { useReportData } from "@/lib/useReportData";
import { rangeForPreset } from "@/lib/dateRanges";
import { money, type ReportDocument } from "@/lib/reportExport";
import { formatCurrency, formatDate } from "@/lib/utils";

interface RateItem {
  rate: number;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
}
interface InvoiceRow {
  saleId: number;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string | null;
  gstin: string | null;
  pos: string;
  invoiceValue: number;
  items: RateItem[];
}
interface Gstr1 {
  period: { fp: string };
  business: { name: string; gstin: string | null; state: string | null; stateCode: string | null };
  config: { b2clThreshold: number; jsonVersion: string };
  warnings: string[];
  summary: {
    b2bCount: number; b2bValue: number; b2clCount: number; b2clValue: number; b2csCount: number; b2csValue: number;
    taxableValue: number; igst: number; cgst: number; sgst: number;
  };
  b2b: InvoiceRow[];
  b2cl: InvoiceRow[];
  b2cs: { supplyType: string; pos: string; rate: number; taxableValue: number; igst: number; cgst: number; sgst: number }[];
  hsn: { hsnCode: string; description: string; uqc: string; rate: number; quantity: number; totalValue: number; taxableValue: number; igst: number; cgst: number; sgst: number }[];
  documents: { fromNumber: string | null; toNumber: string | null; total: number; cancelled: number; net: number };
  creditNotes: { returnNumber: string; returnDate: string; totalAmount: number; invoiceNumber: string; customerName: string | null; gstin: string | null }[];
  json: unknown;
}
interface HeadNet {
  output: number;
  credit: number;
  payable: number;
  carryForward: number;
}
interface Gstr3b {
  period: { fp: string };
  outward: { taxableValue: number; igst: number; cgst: number; sgst: number };
  nilRatedValue: number;
  interStateUnregistered: { state: string; pos: string | null; taxableValue: number; igst: number }[];
  itc: { taxableValue: number; igst: number; cgst: number; sgst: number };
  net: { igst: HeadNet; cgst: HeadNet; sgst: HeadNet };
}

const invoiceRows = (rows: InvoiceRow[]) =>
  rows.flatMap((r) =>
    r.items.map((i) => [r.gstin ?? "", r.customerName ?? "", r.invoiceNumber, formatDate(r.invoiceDate), r.invoiceValue, r.pos, i.rate, i.taxableValue, i.igst, i.cgst, i.sgst])
  );
const INVOICE_COLUMNS = ["GSTIN", "Customer", "Invoice", "Date", "Invoice Value", "POS", "Rate %", "Taxable", "IGST", "CGST", "SGST"];

function gstr1Documents(d: Gstr1, subtitle: string): ReportDocument[] {
  const s = d.summary;
  return [
    {
      title: "GSTR-1 Summary",
      subtitle: `${subtitle}  ·  GSTIN ${d.business.gstin ?? "-"}  ·  Period ${d.period.fp}`,
      summary: [
        { label: "B2B invoices", value: `${s.b2bCount} · ${money(s.b2bValue)}` },
        { label: "B2C Large invoices", value: `${s.b2clCount} · ${money(s.b2clValue)}` },
        { label: "B2C Small invoices", value: `${s.b2csCount} · ${money(s.b2csValue)}` },
        { label: "Taxable value", value: money(s.taxableValue) },
        { label: "IGST", value: money(s.igst) },
        { label: "CGST", value: money(s.cgst) },
        { label: "SGST", value: money(s.sgst) },
      ],
      sections: [
        {
          title: "Documents issued",
          columns: ["From", "To", "Total", "Cancelled", "Net issued"],
          rows: [[d.documents.fromNumber ?? "", d.documents.toNumber ?? "", d.documents.total, d.documents.cancelled, d.documents.net]],
        },
        ...(d.warnings.length ? [{ title: "Warnings", columns: ["Check before filing"], rows: d.warnings.map((w) => [w]) }] : []),
      ],
    },
    { title: "B2B", summary: [], sections: [{ title: "B2B invoices (rate-wise)", columns: INVOICE_COLUMNS, rows: invoiceRows(d.b2b) }] },
    { title: "B2CL", summary: [], sections: [{ title: `B2C Large (inter-state > ${money(d.config.b2clThreshold)})`, columns: INVOICE_COLUMNS, rows: invoiceRows(d.b2cl) }] },
    {
      title: "B2CS",
      summary: [],
      sections: [
        {
          title: "B2C Small (aggregated)",
          columns: ["Supply Type", "POS", "Rate %", "Taxable", "IGST", "CGST", "SGST"],
          rows: d.b2cs.map((b) => [b.supplyType, b.pos, b.rate, b.taxableValue, b.igst, b.cgst, b.sgst]),
        },
      ],
    },
    {
      title: "HSN Summary",
      summary: [],
      sections: [
        {
          title: "HSN-wise summary of outward supplies",
          columns: ["HSN", "Description", "UQC", "Qty", "Rate %", "Total Value", "Taxable", "IGST", "CGST", "SGST"],
          rows: d.hsn.map((h) => [h.hsnCode, h.description, h.uqc, h.quantity, h.rate, h.totalValue, h.taxableValue, h.igst, h.cgst, h.sgst]),
        },
      ],
    },
    {
      title: "Credit Notes",
      summary: [],
      sections: [
        {
          title: "Credit notes (review manually — not in JSON)",
          columns: ["Credit Note", "Date", "Against Invoice", "Customer", "GSTIN", "Amount"],
          rows: d.creditNotes.map((c) => [c.returnNumber, formatDate(c.returnDate), c.invoiceNumber, c.customerName ?? "", c.gstin ?? "", c.totalAmount]),
        },
      ],
    },
  ];
}

function gstr3bDocument(d: Gstr3b, subtitle: string): ReportDocument {
  const heads = ["igst", "cgst", "sgst"] as const;
  return {
    title: "GSTR-3B Summary",
    subtitle: `${subtitle}  ·  Period ${d.period.fp}`,
    summary: [
      { label: "Outward taxable value", value: money(d.outward.taxableValue) },
      { label: "Nil / 0% rated value", value: money(d.nilRatedValue) },
      { label: "Total tax payable (after ITC)", value: money(heads.reduce((s, h) => s + d.net[h].payable, 0)) },
    ],
    sections: [
      {
        title: "3.1(a) Outward taxable supplies & 4. Eligible ITC",
        columns: ["Tax head", "Output tax", "Input tax credit", "Net payable", "Credit carried forward"],
        rows: heads.map((h) => [h.toUpperCase(), d.net[h].output, d.net[h].credit, d.net[h].payable, d.net[h].carryForward]),
      },
      {
        title: "3.2 Inter-state supplies to unregistered persons",
        columns: ["Place of supply", "State code", "Taxable value", "IGST"],
        rows: d.interStateUnregistered.map((i) => [i.state, i.pos ?? "?", i.taxableValue, i.igst]),
      },
    ],
  };
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function GstReturnsPage() {
  useDocumentTitle("GSTR-1 / GSTR-3B");
  const [tab, setTab] = useState<"gstr1" | "gstr3b">("gstr1");
  // Returns are filed for the previous month, so that's the default period.
  const [filters, setFilters] = useState<ReportFilterState>(() => ({ ...initialFilterState(), preset: "lastMonth", range: rangeForPreset("lastMonth") }));
  const q = `from=${filters.range.from}&to=${filters.range.to}`;
  const g1 = useReportData<Gstr1>(tab === "gstr1" ? `/api/gst/gstr1?${q}` : null);
  const g3 = useReportData<Gstr3b>(tab === "gstr3b" ? `/api/gst/gstr3b?${q}` : null);
  const subtitle = describeFilters(filters);

  const tabClass = (t: string) =>
    `rounded-md px-4 py-2 text-sm font-medium ${tab === t ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`;

  return (
    <div className="flex flex-col gap-4">
      <ReportPageHeader
        title="GST Returns (GSTR-1 / GSTR-3B)"
        description="Prepared from your confirmed sales and purchases. Verify with your accountant / the official offline tool before filing."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {tab === "gstr1" && (
              <Button
                variant="outline"
                size="sm"
                disabled={!g1.data}
                onClick={() => downloadJson(`GSTR1_${g1.data!.business.gstin ?? "NOGSTIN"}_${g1.data!.period.fp}.json`, g1.data!.json)}
                data-tour="gstr1-json"
              >
                <FileJson className="h-4 w-4" /> GSTR-1 JSON
              </Button>
            )}
            <ReportActions
              filename={`${tab}-${filters.range.from}-to-${filters.range.to}`}
              disabled={tab === "gstr1" ? !g1.data : !g3.data}
              getDocument={() => (tab === "gstr1" ? gstr1Documents(g1.data!, subtitle) : gstr3bDocument(g3.data!, subtitle))}
            />
          </div>
        }
      />

      <div className="flex gap-2 print:hidden" role="tablist">
        <button role="tab" aria-selected={tab === "gstr1"} className={tabClass("gstr1")} onClick={() => setTab("gstr1")}>
          GSTR-1 (Outward supplies)
        </button>
        <button role="tab" aria-selected={tab === "gstr3b"} className={tabClass("gstr3b")} onClick={() => setTab("gstr3b")}>
          GSTR-3B (Summary &amp; tax payable)
        </button>
      </div>

      <ReportFilterBar state={filters} onChange={setFilters} />

      <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        GST rules, thresholds, state codes and the JSON layout change over time. They are read from
        <code className="mx-1 rounded bg-amber-100 px-1">backend/BillingErp.Api/Config/gst.json</code>— confirm each value against the
        current GSTN notifications and validate the JSON in the official GSTR-1 offline tool before uploading.
      </p>

      {tab === "gstr1" && (
        <>
          {g1.error && <ReportError message={g1.error} />}
          {g1.loading && !g1.data && <div className="p-8 text-center text-sm text-slate-400">Loading...</div>}
          {g1.data && (
            <>
              {g1.data.warnings.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {g1.data.warnings.map((w) => (
                    <li key={w} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label={`B2B (${g1.data.summary.b2bCount})`} value={formatCurrency(g1.data.summary.b2bValue)} />
                <StatCard label={`B2C Large (${g1.data.summary.b2clCount})`} value={formatCurrency(g1.data.summary.b2clValue)} />
                <StatCard label={`B2C Small (${g1.data.summary.b2csCount})`} value={formatCurrency(g1.data.summary.b2csValue)} />
                <StatCard label="Taxable Value" value={formatCurrency(g1.data.summary.taxableValue)} />
                <StatCard label="IGST" value={formatCurrency(g1.data.summary.igst)} />
                <StatCard label="CGST" value={formatCurrency(g1.data.summary.cgst)} />
                <StatCard label="SGST" value={formatCurrency(g1.data.summary.sgst)} />
                <StatCard label="Invoices (net issued)" value={`${g1.data.documents.net} of ${g1.data.documents.total}`} />
              </div>
              <Table
                title={`B2B — registered customers (${g1.data.b2b.length})`}
                columns={["GSTIN", "Customer", "Invoice", "Date", "Value", "POS", "Rate", "Taxable", "IGST", "CGST", "SGST"]}
                rows={invoiceRows(g1.data.b2b)}
                empty="No sales to customers with a GSTIN in this period. Add the GSTIN on the customer to report a sale as B2B."
              />
              <Table title={`B2C Large (${g1.data.b2cl.length})`} columns={["GSTIN", "Customer", "Invoice", "Date", "Value", "POS", "Rate", "Taxable", "IGST", "CGST", "SGST"]} rows={invoiceRows(g1.data.b2cl)} />
              <Table
                title={`B2C Small — aggregated (${g1.data.b2cs.length} rows)`}
                columns={["Type", "POS", "Rate", "Taxable", "IGST", "CGST", "SGST"]}
                rows={g1.data.b2cs.map((b) => [b.supplyType, b.pos, b.rate, b.taxableValue, b.igst, b.cgst, b.sgst])}
              />
              <Table
                title={`HSN Summary (${g1.data.hsn.length})`}
                columns={["HSN", "Description", "UQC", "Qty", "Rate", "Taxable", "IGST", "CGST", "SGST"]}
                rows={g1.data.hsn.map((h) => [h.hsnCode, h.description, h.uqc, h.quantity, h.rate, h.taxableValue, h.igst, h.cgst, h.sgst])}
              />
              {g1.data.creditNotes.length > 0 && (
                <Table
                  title={`Credit Notes — review manually (${g1.data.creditNotes.length})`}
                  columns={["Credit Note", "Date", "Invoice", "Customer", "Amount"]}
                  rows={g1.data.creditNotes.map((c) => [c.returnNumber, formatDate(c.returnDate), c.invoiceNumber, c.customerName ?? "", c.totalAmount])}
                />
              )}
            </>
          )}
        </>
      )}

      {tab === "gstr3b" && (
        <>
          {g3.error && <ReportError message={g3.error} />}
          {g3.data && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Outward Taxable" value={formatCurrency(g3.data.outward.taxableValue)} />
                <StatCard label="Output Tax" value={formatCurrency(g3.data.outward.igst + g3.data.outward.cgst + g3.data.outward.sgst)} />
                <StatCard label="Input Tax Credit" value={formatCurrency(g3.data.itc.igst + g3.data.itc.cgst + g3.data.itc.sgst)} />
                <StatCard label="Net Payable" value={formatCurrency(g3.data.net.igst.payable + g3.data.net.cgst.payable + g3.data.net.sgst.payable)} />
              </div>
              <Table
                title="Tax liability vs ITC (head-wise, simplified)"
                columns={["Head", "Output tax", "ITC", "Payable", "Carry forward"]}
                rows={(["igst", "cgst", "sgst"] as const).map((h) => [h.toUpperCase(), g3.data!.net[h].output, g3.data!.net[h].credit, g3.data!.net[h].payable, g3.data!.net[h].carryForward])}
              />
              <p className="text-xs text-slate-500">
                Simplified: each head is netted against its own credit. The official set-off order (IGST credit first, cross-utilisation
                between heads) is not applied — compute the final challan on the portal. Nil / 0% rated outward value:{" "}
                {formatCurrency(g3.data.nilRatedValue)}.
              </p>
              <Table
                title="3.2 Inter-state supplies to unregistered persons"
                columns={["Place of supply", "Code", "Taxable", "IGST"]}
                rows={g3.data.interStateUnregistered.map((i) => [i.state, i.pos ?? "?", i.taxableValue, i.igst])}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Table({ title, columns, rows, empty }: { title: string; columns: string[]; rows: (string | number)[][]; empty?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <h3 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">{empty ?? "Nothing in this period."}</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase text-slate-500">
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  {r.map((cell, j) => (
                    <td key={j} className={`px-3 py-1.5 ${typeof cell === "number" ? "text-right tabular-nums" : ""}`}>
                      {typeof cell === "number" ? cell.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
