import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Receipt,
  Package,
  Warehouse,
  Users,
  Wallet,
  BarChart3,
  Contact,
  UserCog,
  Factory,
  ShieldCheck,
  FileSpreadsheet,
  Percent,
  Check,
  TrendingUp,
} from "lucide-react";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Billing ERP — Billing, Inventory, Accounting, CRM, HR & Manufacturing",
  description:
    "One system for your whole business — GST-ready billing, inventory, accounting, CRM, HR & payroll, and manufacturing. Role-based access, real-time stock, built-in reports.",
  robots: { index: true, follow: true },
};

const MODULES = [
  {
    icon: Receipt,
    title: "Billing & GST Invoicing",
    description:
      "GST-compliant invoices with automatic CGST/SGST or IGST split, sales returns, and print/PDF-ready formats.",
  },
  {
    icon: Package,
    title: "Purchase Management",
    description: "Record purchases from suppliers, manage purchase returns, and keep stock in sync automatically.",
  },
  {
    icon: Warehouse,
    title: "Inventory & Stock Ledger",
    description:
      "A running, auditable stock ledger for every product — adjustments, low-stock alerts, full transaction history.",
  },
  {
    icon: Users,
    title: "Customers & Suppliers",
    description: "Party master data with running ledgers, credit limits, and outstanding balances at a glance.",
  },
  {
    icon: Wallet,
    title: "Payments & Expenses",
    description: "Track receipts, payments, and business expenses by category — all tied back to your accounts.",
  },
  {
    icon: BarChart3,
    title: "Reports & Analytics",
    description: "Sales, purchase, stock, GST, profit, and party-wise reports — export to Excel or PDF, or print.",
  },
  {
    icon: Contact,
    title: "CRM",
    description: "Track leads through your pipeline with a follow-up activity timeline for every prospect.",
  },
  {
    icon: UserCog,
    title: "HR & Payroll",
    description: "Employee records, daily attendance, and monthly payroll — generate, edit, and mark as paid.",
  },
  {
    icon: Factory,
    title: "Manufacturing",
    description: "Define a Bill of Materials per product and run production orders that consume and produce stock.",
  },
];

const HIGHLIGHTS = [
  { icon: Percent, label: "GST-ready by default" },
  { icon: ShieldCheck, label: "Role-based permissions, enforced end-to-end" },
  { icon: Warehouse, label: "Real-time, auditable stock ledger" },
  { icon: FileSpreadsheet, label: "Bulk import from Excel" },
];

const WHY_US = [
  "One database for billing, inventory, accounting, CRM, HR, and manufacturing — no juggling separate tools.",
  "Every stock movement is logged as an immutable transaction, so your stock numbers are always explainable.",
  "Fine-grained roles and permissions, checked on every request — not just hidden menu items.",
  "Built-in Excel import and Excel/PDF export across products, parties, and every report.",
];

function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm shadow-blue-200">
        <Receipt className="h-5 w-5" />
      </span>
      <span className="text-lg font-bold tracking-tight text-slate-900">Billing ERP</span>
    </span>
  );
}

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-full flex-col overflow-x-hidden bg-white text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <BrandMark />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 sm:flex">
            <a href="#modules" className="transition-colors hover:text-slate-900">
              Modules
            </a>
            <a href="#why-us" className="transition-colors hover:text-slate-900">
              Why us
            </a>
          </nav>
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Login
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[36rem] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(37,99,235,0.14),transparent)]"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-2 lg:gap-8 lg:pb-28 lg:pt-24">
          <div className="flex flex-col items-start gap-6 text-left">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Billing &middot; Inventory &middot; Accounting &middot; CRM &middot; HR &middot; Manufacturing
            </span>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Run your entire business from one system
            </h1>
            <p className="max-w-xl text-lg text-slate-600">
              GST-ready invoicing, a real-time stock ledger, party ledgers, payroll, and production —
              all in one place, with role-based access enforced on every action.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-md bg-blue-600 px-6 text-base font-medium text-white shadow-sm shadow-blue-200 transition-colors hover:bg-blue-700"
              >
                Login to your account
              </Link>
              <a
                href="#modules"
                className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 px-6 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                See what&apos;s inside
              </a>
            </div>
          </div>

          {/* Illustrative dashboard preview (mock UI, not a real screenshot) */}
          <div className="relative">
            <div className="rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40">
              <div className="flex items-center gap-1.5 rounded-t-xl border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              </div>
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Today's Sales", value: "₹48,250", tone: "text-emerald-600" },
                    { label: "Receivable", value: "₹1,12,400", tone: "text-amber-600" },
                    { label: "Low Stock", value: "6 items", tone: "text-red-600" },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[11px] font-medium text-slate-500">{kpi.label}</p>
                      <p className={`mt-1 text-sm font-bold ${kpi.tone}`}>{kpi.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600">Sales Trend</p>
                    <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <div className="flex h-20 items-end gap-2">
                    {[40, 65, 50, 80, 60, 95, 70].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t bg-blue-500/80" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {["Invoice #INV-0248 created", "Stock updated — Product A", "Payment received from Customer B"].map(
                    (row) => (
                      <div key={row} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        {row}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
            <div
              aria-hidden
              className="absolute -right-6 -top-6 -z-10 h-40 w-40 rounded-full bg-blue-200/40 blur-3xl"
            />
            <div
              aria-hidden
              className="absolute -bottom-8 -left-8 -z-10 h-40 w-40 rounded-full bg-emerald-200/30 blur-3xl"
            />
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-center transition-shadow hover:shadow-sm"
              >
                <Icon className="h-5 w-5 text-blue-600" />
                <span className="text-xs font-medium text-slate-600">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="border-t border-slate-200 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900">Everything your business needs</h2>
            <p className="mt-3 text-slate-600">Nine modules, one database, no re-entering the same data twice.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 font-semibold text-slate-900">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section id="why-us" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900">Why teams choose it</h2>
          </div>
          <div className="mx-auto grid max-w-3xl gap-4">
            {WHY_US.map((point) => (
              <div
                key={point}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <p className="text-slate-700">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-t border-slate-200 bg-blue-600 py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_100%,rgba(255,255,255,0.12),transparent)]"
        />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 text-center">
          <h2 className="text-3xl font-bold text-white">Ready to get started?</h2>
          <p className="max-w-xl text-blue-100">
            Log in with your account to access your dashboard, invoices, inventory, and reports.
          </p>
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-md bg-white px-6 text-base font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-50"
          >
            Login now
          </Link>
        </div>
      </section>

      <footer className="py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-500 sm:flex-row">
          <BrandMark className="scale-90" />
          <p>&copy; {new Date().getFullYear()} Billing ERP. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
