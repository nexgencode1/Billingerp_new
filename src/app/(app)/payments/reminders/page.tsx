"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, ChevronDown, ChevronRight, Mail, MessageCircle, Settings2 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { StatCard } from "@/components/reports/StatCard";
import { ReportActions } from "@/components/reports/ReportActions";
import { toast } from "@/lib/toast-store";
import { useCan } from "@/lib/permissions-context";
import { fetchJson } from "@/lib/reports";
import { whatsAppUrl } from "@/lib/share";
import type { ReportDocument } from "@/lib/reportExport";
import { formatCurrency, formatDate } from "@/lib/utils";

interface ReminderInvoice {
  saleId: number;
  invoiceNumber: string;
  invoiceDate: string;
  grandTotal: number;
  dueAmount: number;
  daysOld: number;
}
interface ReminderCustomer {
  customerId: number;
  name: string;
  mobile: string;
  email: string | null;
  invoiceCount: number;
  totalDue: number;
  oldestInvoiceDate: string;
  oldestDays: number;
  lastRemindedAt: string | null;
  lastChannel: string | null;
  message: string;
  invoices: ReminderInvoice[];
}
interface RemindersResponse {
  settings: { smtpConfigured: boolean; autoEmailEnabled: boolean; afterDays: number; minDaysBetween: number };
  businessName: string;
  totalDue: number;
  customers: ReminderCustomer[];
}

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export default function RemindersPage() {
  useDocumentTitle("Payment Reminders");
  const canSend = useCan("PAYMENTS", "CREATE");
  const [data, setData] = useState<RemindersResponse | null>(null);
  const [reload, setReload] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sending, setSending] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson<RemindersResponse>("/api/reminders")
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function logWhatsApp(c: ReminderCustomer) {
    // The message itself goes out from the user's WhatsApp; we only record that it was sent.
    await fetch(`/api/reminders/${c.customerId}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "WHATSAPP" }),
    }).catch(() => {});
    setReload((n) => n + 1);
  }

  async function email(c: ReminderCustomer) {
    setSending(c.customerId);
    try {
      const res = await fetch(`/api/reminders/${c.customerId}/email`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(body.error ?? "Email failed.");
      else toast.success(`Reminder emailed to ${c.name}.`);
      setReload((n) => n + 1);
    } finally {
      setSending(null);
    }
  }

  const customers = data?.customers ?? [];
  const toDocument = (): ReportDocument => ({
    title: "Payment Reminders — Outstanding Dues",
    subtitle: `Invoices unpaid for more than ${data?.settings.afterDays ?? 0} days`,
    summary: [
      { label: "Customers", value: customers.length },
      { label: "Total outstanding", value: formatCurrency(data?.totalDue ?? 0).replace("₹", "Rs. ") },
    ],
    sections: [
      {
        title: "Customers",
        columns: ["Customer", "Mobile", "Invoices", "Oldest (days)", "Due", "Last reminded"],
        rows: customers.map((c) => [c.name, c.mobile, c.invoiceCount, c.oldestDays, c.totalDue, c.lastRemindedAt ? formatDate(c.lastRemindedAt) : "never"]),
      },
    ],
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BellRing className="h-5 w-5 text-amber-600" /> Payment Reminders
          </h1>
          <p className="text-sm text-slate-500">
            Customers with invoices unpaid for more than {data?.settings.afterDays ?? "…"} days. Send a reminder on WhatsApp or email in one click.
          </p>
        </div>
        <ReportActions filename="payment-reminders" disabled={!data} getDocument={toDocument} />
      </div>

      {data && (
        <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${data.settings.smtpConfigured ? "border-green-200 bg-green-50 text-green-800" : "border-slate-200 bg-white text-slate-600"}`}>
          <Settings2 className="mt-0.5 h-4 w-4 shrink-0" />
          {data.settings.smtpConfigured ? (
            <span>
              Email is set up.{" "}
              {data.settings.autoEmailEnabled
                ? `Automatic reminders are ON — each customer with an email is reminded at most once every ${data.settings.minDaysBetween} days.`
                : "Automatic daily reminders are OFF (set Reminders:AutoEmailEnabled = true in the backend appsettings to turn them on)."}
            </span>
          ) : (
            <span>
              Email reminders need your own SMTP account (e.g. Gmail with an app password — free). Add it under <b>Smtp</b> in the
              backend&apos;s <code>appsettings.Development.json</code> (or environment variables like <code>Smtp__Password</code>), then
              restart the backend. WhatsApp reminders work right away.
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Customers to remind" value={String(customers.length)} />
        <StatCard label="Total outstanding" value={formatCurrency(data?.totalDue ?? 0)} />
        <StatCard label="Never reminded" value={String(customers.filter((c) => !c.lastRemindedAt).length)} />
        <StatCard label="Over 60 days" value={String(customers.filter((c) => c.oldestDays > 60).length)} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="px-3 py-2.5" />
              <th className="px-3 py-2.5">Customer</th>
              <th className="px-3 py-2.5 text-right">Invoices</th>
              <th className="px-3 py-2.5 text-right">Due</th>
              <th className="px-3 py-2.5">Oldest</th>
              <th className="px-3 py-2.5">Last reminded</th>
              <th className="px-3 py-2.5 text-right">Send reminder</th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {data && customers.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No overdue customer invoices. 🎉
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <Fragment key={c.customerId}>
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setExpanded(expanded === c.customerId ? null : c.customerId)}
                      aria-label={`Show invoices of ${c.name}`}
                      aria-expanded={expanded === c.customerId}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      {expanded === c.customerId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/customers/${c.customerId}/ledger`} className="font-medium text-blue-600 hover:underline">
                      {c.name}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {c.mobile}
                      {c.email ? ` · ${c.email}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{c.invoiceCount}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-red-600">{formatCurrency(c.totalDue)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={c.oldestDays > 60 ? "red" : c.oldestDays > 30 ? "yellow" : "slate"}>{c.oldestDays} days</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {c.lastRemindedAt ? `${ago(c.lastRemindedAt)} (${c.lastChannel?.toLowerCase()})` : "never"}
                  </td>
                  <td className="px-3 py-2">
                    {canSend && (
                      <div className="flex justify-end gap-2">
                        <a
                          href={whatsAppUrl(c.mobile, c.message)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => logWhatsApp(c)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <MessageCircle className="h-4 w-4 text-green-600" /> WhatsApp
                        </a>
                        <Button
                          variant="outline"
                          size="sm"
                          loading={sending === c.customerId}
                          disabled={!c.email || !data?.settings.smtpConfigured}
                          title={!c.email ? "No email on this customer" : !data?.settings.smtpConfigured ? "Email (SMTP) not configured" : "Send email now"}
                          onClick={() => email(c)}
                        >
                          <Mail className="h-4 w-4" /> Email
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
                {expanded === c.customerId && (
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td />
                    <td colSpan={6} className="px-3 py-2">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <ul className="flex flex-col gap-1 text-xs">
                          {c.invoices.map((i) => (
                            <li key={i.saleId} className="flex justify-between gap-3">
                              <Link href={`/sales/invoices/${i.saleId}`} className="text-blue-600 hover:underline">
                                {i.invoiceNumber} · {formatDate(i.invoiceDate)}
                              </Link>
                              <span className="tabular-nums">
                                {formatCurrency(i.dueAmount)} <span className="text-slate-400">({i.daysOld}d)</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                        <pre className="whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 font-sans text-xs text-slate-600">{c.message}</pre>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
