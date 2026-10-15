"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell, CalendarClock, PackageX } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface AlertsResponse {
  total: number;
  overdueDays: number;
  lowStock: {
    count: number;
    outOfStock: number;
    items: { id: number; name: string; balance: number; minimumStock: number; unit: string }[];
  };
  overdueInvoices: {
    count: number;
    amount: number;
    items: { id: number; invoiceNumber: string; dueAmount: number; customerName: string | null; daysOld: number }[];
  };
  expiredDocuments: {
    count: number;
    items: { id: number; route: string; docNumber: string; dueDate: string; customerName: string | null }[];
  };
}

const REFRESH_MS = 5 * 60 * 1000;

// Header bell: low / out-of-stock products, overdue receivables and expired open quotes/orders.
// Refreshes every 5 minutes and on navigation (so it updates right after a sale or purchase).
export function AlertsBell() {
  const pathname = usePathname();
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/alerts")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => !cancelled && d && setData(d))
        .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const total = data?.total ?? 0;

  return (
    <div className="relative" ref={ref} data-tour="header-alerts">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100"
        aria-label={total > 0 ? `${total} alerts` : "Alerts"}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl sm:w-96">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Alerts</p>
            <p className="text-xs text-slate-500">{total === 0 ? "All clear — nothing needs attention." : `${total} items need attention`}</p>
          </div>

          {data && data.lowStock.count > 0 && (
            <Section
              icon={<PackageX className="h-4 w-4 text-red-600" />}
              title={`Low stock (${data.lowStock.count}${data.lowStock.outOfStock ? `, ${data.lowStock.outOfStock} out of stock` : ""})`}
              href="/inventory/low-stock"
              onNavigate={() => setOpen(false)}
            >
              {data.lowStock.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span className="truncate text-slate-700">{i.name}</span>
                  <span className={`shrink-0 tabular-nums ${i.balance <= 0 ? "font-semibold text-red-600" : "text-amber-700"}`}>
                    {i.balance} / min {i.minimumStock} {i.unit}
                  </span>
                </li>
              ))}
            </Section>
          )}

          {data && data.overdueInvoices.count > 0 && (
            <Section
              icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
              title={`Overdue > ${data.overdueDays} days (${data.overdueInvoices.count}) · ${formatCurrency(data.overdueInvoices.amount)}`}
              href="/reports/customer"
              onNavigate={() => setOpen(false)}
            >
              {data.overdueInvoices.items.map((i) => (
                <li key={i.id}>
                  <Link href={`/sales/invoices/${i.id}`} onClick={() => setOpen(false)} className="flex justify-between gap-2 hover:text-blue-600">
                    <span className="truncate text-slate-700">
                      {i.invoiceNumber} · {i.customerName ?? "Walk-in"}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-900">
                      {formatCurrency(i.dueAmount)} <span className="text-xs text-slate-400">{i.daysOld}d</span>
                    </span>
                  </Link>
                </li>
              ))}
            </Section>
          )}

          {data && data.expiredDocuments.count > 0 && (
            <Section
              icon={<CalendarClock className="h-4 w-4 text-blue-600" />}
              title={`Expired open quotes / orders (${data.expiredDocuments.count})`}
              href="/sales/estimates"
              onNavigate={() => setOpen(false)}
            >
              {data.expiredDocuments.items.map((d) => (
                <li key={d.id}>
                  <Link href={`/sales/${d.route}/${d.id}`} onClick={() => setOpen(false)} className="flex justify-between gap-2 hover:text-blue-600">
                    <span className="truncate text-slate-700">
                      {d.docNumber} · {d.customerName ?? "Walk-in"}
                    </span>
                    <span className="shrink-0 text-xs text-red-600">since {formatDate(d.dueDate)}</span>
                  </Link>
                </li>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  href,
  onNavigate,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          {icon} {title}
        </p>
        <Link href={href} onClick={onNavigate} className="shrink-0 text-xs text-blue-600 hover:underline">
          View all
        </Link>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs">{children}</ul>
    </div>
  );
}
