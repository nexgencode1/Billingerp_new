"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, MessageCircle, Phone } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { UpiQr } from "@/components/invoice/UpiQr";
import { portalFetch, portalLogout, type PortalSummary } from "@/lib/portal";
import { whatsAppUrl } from "@/lib/share";
import { formatCurrency, formatDate } from "@/lib/utils";

type Tab = "invoices" | "payments" | "credits";

export default function PortalHomePage() {
  const [data, setData] = useState<PortalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("invoices");
  const [onlyOpen, setOnlyOpen] = useState(false);

  useEffect(() => {
    document.title = "My Account — Customer Portal";
    portalFetch<PortalSummary>("/api/portal/summary")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="p-8 text-center text-sm text-red-600">{error}</div>;
  if (!data) return <div className="p-8 text-center text-sm text-slate-400">Loading your account…</div>;

  const invoices = onlyOpen ? data.invoices.filter((i) => i.status === "CONFIRMED" && i.dueAmount > 0) : data.invoices;
  const tabClass = (t: Tab) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-slate-900">{data.business?.name ?? "Customer Portal"}</p>
            <p className="text-xs text-slate-500">Welcome, {data.customer.name}</p>
          </div>
          <button onClick={portalLogout} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Total billed</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(data.totals.totalBilled)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Paid</p>
            <p className="text-xl font-bold text-green-700">{formatCurrency(data.totals.totalPaid)}</p>
          </div>
          <div className={`rounded-lg border p-4 ${data.totals.totalDue > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
            <p className="text-xs text-slate-500">Balance due ({data.totals.openInvoices} bills)</p>
            <p className={`text-xl font-bold ${data.totals.totalDue > 0 ? "text-red-600" : "text-slate-900"}`}>{formatCurrency(data.totals.totalDue)}</p>
          </div>
        </div>

        {data.totals.totalDue > 0 && data.business?.upiId && (
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Pay your balance by UPI</p>
              <p className="text-xs text-slate-500">After paying, the shop will confirm and your balance will update.</p>
            </div>
            <UpiQr vpa={data.business.upiId} payeeName={data.business.name} amount={data.totals.totalDue} note={`Balance - ${data.customer.name}`} />
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-2" role="tablist">
            <div className="flex gap-1">
              <button role="tab" aria-selected={tab === "invoices"} className={tabClass("invoices")} onClick={() => setTab("invoices")}>
                Bills ({data.invoices.length})
              </button>
              <button role="tab" aria-selected={tab === "payments"} className={tabClass("payments")} onClick={() => setTab("payments")}>
                Payments ({data.payments.length})
              </button>
              {data.creditNotes.length > 0 && (
                <button role="tab" aria-selected={tab === "credits"} className={tabClass("credits")} onClick={() => setTab("credits")}>
                  Returns ({data.creditNotes.length})
                </button>
              )}
            </div>
            {tab === "invoices" && (
              <label className="flex items-center gap-1.5 px-2 text-xs text-slate-600">
                <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Unpaid only
              </label>
            )}
          </div>

          {tab === "invoices" && (
            <ul className="divide-y divide-slate-100">
              {invoices.map((i) => (
                <li key={i.id}>
                  <Link href={`/portal/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <span>
                      <span className="block text-sm font-medium text-slate-900">{i.invoiceNumber}</span>
                      <span className="block text-xs text-slate-500">{formatDate(i.invoiceDate)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">{formatCurrency(i.grandTotal)}</span>
                      {i.status === "CANCELLED" ? (
                        <Badge tone="slate">Cancelled</Badge>
                      ) : i.dueAmount > 0 ? (
                        <span className="text-xs font-medium text-red-600">Due {formatCurrency(i.dueAmount)}</span>
                      ) : (
                        <Badge tone="green">Paid</Badge>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
              {invoices.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400">No bills to show.</li>}
            </ul>
          )}

          {tab === "payments" && (
            <ul className="divide-y divide-slate-100">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="block font-medium text-slate-900">{p.paymentNumber}</span>
                    <span className="block text-xs text-slate-500">
                      {formatDate(p.date)} · {p.method}
                      {p.invoiceNumber ? ` · for ${p.invoiceNumber}` : ""}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-green-700">{formatCurrency(p.amount)}</span>
                </li>
              ))}
              {data.payments.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400">No payments yet.</li>}
            </ul>
          )}

          {tab === "credits" && (
            <ul className="divide-y divide-slate-100">
              {data.creditNotes.map((c) => (
                <li key={c.returnNumber} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="block font-medium text-slate-900">{c.returnNumber}</span>
                    <span className="block text-xs text-slate-500">
                      {formatDate(c.returnDate)} · against {c.invoiceNumber} · {c.refundMethod}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(c.totalAmount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {data.business && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="text-slate-600">
              <p className="font-semibold text-slate-800">{data.business.name}</p>
              {data.business.address && <p>{data.business.address}</p>}
              {data.business.gstin && <p className="text-xs">GSTIN: {data.business.gstin}</p>}
            </div>
            {data.business.phone && (
              <div className="flex gap-2">
                <a href={`tel:${data.business.phone}`} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                  <Phone className="h-4 w-4" /> Call
                </a>
                <a
                  href={whatsAppUrl(data.business.phone, `Hello, this is ${data.customer.name}. I have a question about my account.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                >
                  <MessageCircle className="h-4 w-4 text-green-600" /> WhatsApp
                </a>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
