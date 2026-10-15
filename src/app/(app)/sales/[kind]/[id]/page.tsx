"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Ban, Copy, Download, Printer } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ShareButtons } from "@/components/invoice/ShareButtons";
import { toast } from "@/lib/toast-store";
import { fetchJson } from "@/lib/reports";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { amountInWords } from "@/lib/gst";
import { DOC_STATUS_TONE, salesDocConfig, type SalesDocDetail } from "@/lib/salesDocs";
import { formatCurrency, formatDate } from "@/lib/utils";

interface BusinessProfile {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  termsText: string | null;
}

export default function SalesDocumentViewPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const config = salesDocConfig(kind);
  const [doc, setDoc] = useState<SalesDocDetail | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  useDocumentTitle(doc ? doc.docNumber : config?.singular ?? "Document");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchJson<SalesDocDetail>(`/api/sales-documents/${Number(id)}`), fetchJson<BusinessProfile>("/api/business")])
      .then(([d, b]) => {
        if (cancelled) return;
        setDoc(d);
        setBusiness(b);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!config) notFound();
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!doc) return <div className="p-8 text-center text-sm text-slate-400">Loading...</div>;

  const metaLines = doc.dueDate ? [`${config.dueDateLabel}: ${formatDate(doc.dueDate)}`] : [];

  function downloadPdf() {
    if (!doc || !config) return;
    generateInvoicePdf({
      title: config.pdfTitle,
      numberLabel: config.numberLabel,
      invoiceNumber: doc.docNumber,
      invoiceDate: doc.docDate,
      metaLines,
      business,
      customer: doc.customer,
      items: doc.items,
      subtotal: doc.subtotal,
      discount: doc.discount,
      cgst: doc.cgst,
      sgst: doc.sgst,
      igst: doc.igst,
      grandTotal: doc.grandTotal,
      notes: doc.notes,
      hidePayment: true,
    });
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/sales-documents/${doc!.id}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not cancel.");
        return;
      }
      setDoc(data);
      toast.success(`${config!.singular} cancelled.`);
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="app-chrome flex flex-wrap items-center justify-between gap-3">
        <Link href={`/sales/${kind}`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to {config.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {doc.status === "OPEN" && (
            <Link href={`/sales/new?fromDocument=${doc.id}`} data-tour="convert-to-invoice">
              <Button size="sm">
                <ArrowRightLeft className="h-4 w-4" /> Convert to Invoice
              </Button>
            </Link>
          )}
          {doc.convertedSaleId && (
            <Link href={`/sales/invoices/${doc.convertedSaleId}`}>
              <Button size="sm" variant="outline">
                View Invoice {doc.convertedInvoiceNumber}
              </Button>
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            <Download className="h-4 w-4" /> PDF
          </Button>
          <ShareButtons
            mobile={doc.customer?.mobile}
            email={doc.customer?.email}
            doc={{
              label: config.singular,
              number: doc.docNumber,
              date: formatDate(doc.docDate),
              customerName: doc.customer?.name ?? null,
              grandTotal: doc.grandTotal,
              businessName: business?.name ?? "",
              extraLine: metaLines[0],
            }}
          />
          <Link href={`/sales/${kind}/new`} title={`New ${config.singular}`}>
            <Button variant="ghost" size="sm">
              <Copy className="h-4 w-4" /> New
            </Button>
          </Link>
          {doc.status === "OPEN" && (
            <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
              <Ban className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-8">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">{business?.name ?? "Business"}</h1>
          {business?.address && <p className="text-sm text-slate-500">{business.address}</p>}
          <p className="text-sm text-slate-500">{[business?.phone, business?.email].filter(Boolean).join(" · ")}</p>
          {business?.gstin && <p className="text-sm text-slate-500">GSTIN: {business.gstin}</p>}
          <p className="mt-3 text-sm font-bold tracking-wide text-slate-800">{config.pdfTitle}</p>
        </div>

        <div className="my-4 border-t border-slate-200" />

        <div className="flex items-start justify-between gap-4 text-sm">
          <div>
            <p className="font-semibold text-slate-700">To:</p>
            {doc.customer ? (
              <>
                <p>{doc.customer.name}</p>
                <p>{doc.customer.mobile}</p>
                {doc.customer.address && <p>{doc.customer.address}</p>}
                {doc.customer.state && <p>{[doc.customer.city, doc.customer.state].filter(Boolean).join(", ")}</p>}
                {doc.customer.gstin && <p>GSTIN: {doc.customer.gstin}</p>}
              </>
            ) : (
              <p>Walk-in Customer</p>
            )}
          </div>
          <div className="text-right">
            <p>
              <span className="font-semibold">{config.numberLabel}:</span> {doc.docNumber}
            </p>
            <p>
              <span className="font-semibold">Date:</span> {formatDate(doc.docDate)}
            </p>
            {doc.dueDate && (
              <p>
                <span className="font-semibold">{config.dueDateLabel}:</span> {formatDate(doc.dueDate)}
              </p>
            )}
            <Badge tone={DOC_STATUS_TONE[doc.status]} className="mt-1">
              {doc.status}
            </Badge>
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="py-2">Item</th>
              <th className="py-2">HSN</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">GST %</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-2">{item.productName}</td>
                <td className="py-2 text-slate-500">{item.hsnCode ?? "-"}</td>
                <td className="py-2 text-right">
                  {item.quantity} {item.unitLabel}
                </td>
                <td className="py-2 text-right">{formatCurrency(item.rate)}</td>
                <td className="py-2 text-right">{item.gstRate}%</td>
                <td className="py-2 text-right">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-64 text-sm">
            <Line label="Subtotal" value={doc.subtotal} />
            {doc.discount > 0 && <Line label="Discount" value={-doc.discount} />}
            {doc.cgst > 0 && <Line label="CGST" value={doc.cgst} />}
            {doc.sgst > 0 && <Line label="SGST" value={doc.sgst} />}
            {doc.igst > 0 && <Line label="IGST" value={doc.igst} />}
            <div className="mt-1 flex justify-between border-t border-slate-300 pt-1 text-base font-bold">
              <span>Grand Total</span>
              <span>{formatCurrency(doc.grandTotal)}</span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm italic text-slate-500">Amount in Words: {amountInWords(doc.grandTotal)}</p>

        {doc.notes && (
          <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-semibold">Notes</p>
            <p className="whitespace-pre-line">{doc.notes}</p>
          </div>
        )}

        {business?.termsText && (
          <div className="mt-6 border-t border-slate-200 pt-3 text-xs text-slate-500">
            <p className="font-semibold">Terms &amp; Conditions</p>
            <p>{business.termsText}</p>
          </div>
        )}

        <div className="mt-10 flex justify-between text-sm text-slate-500">
          <p>Prepared by {doc.createdBy.name}</p>
          <p>Authorized Signature</p>
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        title={`Cancel ${config.singular}?`}
        description={`${doc.docNumber} will be marked cancelled and can no longer be converted to an invoice.`}
        confirmLabel="Cancel Document"
        loading={cancelling}
        onConfirm={handleCancel}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-500">{label}</span>
      <span>{value < 0 ? `-${formatCurrency(-value)}` : formatCurrency(value)}</span>
    </div>
  );
}
