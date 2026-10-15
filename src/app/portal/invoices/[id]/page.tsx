"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { UpiQr, upiQrDataUrl } from "@/components/invoice/UpiQr";
import { portalFetch, type PortalInvoice, type PortalSummary } from "@/lib/portal";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { amountInWords } from "@/lib/gst";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function PortalInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<PortalInvoice | null>(null);
  const [business, setBusiness] = useState<PortalSummary["business"]>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([portalFetch<PortalInvoice>(`/api/portal/invoices/${Number(id)}`), portalFetch<PortalSummary>("/api/portal/summary")])
      .then(([inv, summary]) => {
        setInvoice(inv);
        setBusiness(summary.business);
        document.title = `${inv.invoiceNumber} — Customer Portal`;
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <div className="p-8 text-center text-sm">
        <p className="text-red-600">{error}</p>
        <Link href="/portal" className="mt-2 inline-block text-blue-600 hover:underline">
          Back to my account
        </Link>
      </div>
    );
  if (!invoice) return <div className="p-8 text-center text-sm text-slate-400">Loading…</div>;

  const showQr = Boolean(business?.upiId) && invoice.status !== "CANCELLED" && invoice.dueAmount > 0;

  async function downloadPdf() {
    if (!invoice) return;
    generateInvoicePdf({
      title: "TAX INVOICE",
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      business,
      customer: invoice.customer,
      items: invoice.items,
      subtotal: invoice.subtotal,
      discount: invoice.discount,
      cgst: invoice.cgst,
      sgst: invoice.sgst,
      igst: invoice.igst,
      grandTotal: invoice.grandTotal,
      paidAmount: invoice.paidAmount,
      dueAmount: invoice.dueAmount,
      paymentStatus: invoice.paymentStatus,
      upiQr: showQr
        ? { dataUrl: await upiQrDataUrl(business!.upiId!, business!.name, invoice.dueAmount, `Invoice ${invoice.invoiceNumber}`), caption: `Scan to pay via UPI: ${business!.upiId}` }
        : null,
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <div className="app-chrome flex flex-wrap items-center justify-between gap-2">
          <Link href="/portal" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> My account
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button size="sm" onClick={downloadPdf}>
              <Download className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-center">
            <h1 className="text-lg font-bold text-slate-900">{business?.name}</h1>
            {business?.address && <p className="text-sm text-slate-500">{business.address}</p>}
            {business?.gstin && <p className="text-sm text-slate-500">GSTIN: {business.gstin}</p>}
            <p className="mt-2 text-sm font-bold tracking-wide">TAX INVOICE</p>
          </div>
          <div className="my-4 flex justify-between gap-3 border-y border-slate-100 py-3 text-sm">
            <div>
              <p className="font-semibold">Bill to</p>
              <p>{invoice.customer?.name}</p>
              {invoice.customer?.gstin && <p className="text-xs">GSTIN: {invoice.customer.gstin}</p>}
            </div>
            <div className="text-right">
              <p>
                <span className="font-semibold">Invoice:</span> {invoice.invoiceNumber}
              </p>
              <p>
                <span className="font-semibold">Date:</span> {formatDate(invoice.invoiceDate)}
              </p>
              {invoice.status === "CANCELLED" ? (
                <Badge tone="red">Cancelled</Badge>
              ) : (
                <Badge tone={invoice.paymentStatus === "PAID" ? "green" : invoice.paymentStatus === "PARTIAL" ? "yellow" : "red"}>{invoice.paymentStatus}</Badge>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Rate</th>
                  <th className="py-2 text-right">GST</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((it, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2">
                      {it.productName}
                      {it.hsnCode && <span className="block text-xs text-slate-400">HSN {it.hsnCode}</span>}
                    </td>
                    <td className="py-2 text-right">{it.quantity}</td>
                    <td className="py-2 text-right">{formatCurrency(it.rate)}</td>
                    <td className="py-2 text-right">{it.gstRate}%</td>
                    <td className="py-2 text-right">{formatCurrency(it.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 ml-auto w-64 text-sm">
            {[
              ["Subtotal", invoice.subtotal],
              ["Discount", -invoice.discount],
              ["CGST", invoice.cgst],
              ["SGST", invoice.sgst],
              ["IGST", invoice.igst],
            ]
              .filter(([, v]) => Number(v) !== 0)
              .map(([label, v]) => (
                <div key={String(label)} className="flex justify-between py-0.5 text-slate-600">
                  <span>{label}</span>
                  <span>{formatCurrency(Number(v))}</span>
                </div>
              ))}
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-bold">
              <span>Total</span>
              <span>{formatCurrency(invoice.grandTotal)}</span>
            </div>
            <div className="flex justify-between py-0.5 text-slate-600">
              <span>Paid</span>
              <span>{formatCurrency(invoice.paidAmount)}</span>
            </div>
            <div className="flex justify-between py-0.5 font-semibold text-red-600">
              <span>Due</span>
              <span>{formatCurrency(invoice.dueAmount)}</span>
            </div>
          </div>
          <p className="mt-3 text-xs italic text-slate-500">Amount in words: {amountInWords(invoice.grandTotal)}</p>
          {showQr && (
            <div className="mt-4">
              <UpiQr vpa={business!.upiId!} payeeName={business!.name} amount={invoice.dueAmount} note={`Invoice ${invoice.invoiceNumber}`} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
