"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  IndianRupee,
  ShoppingCart,
  Wallet,
  AlertTriangle,
  Package,
  Users,
  TrendingUp,
  ReceiptText,
  Plus,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { BusinessInsights } from "@/components/dashboard/BusinessInsights";
import { Button } from "@/components/common/Button";
import { Select } from "@/components/common/Select";
import { Skeleton } from "@/components/common/Skeleton";
import { formatCurrency } from "@/lib/utils";

interface SummaryResponse {
  kpis: {
    todaySales: number;
    todayPurchase: number;
    totalReceivable: number;
    totalPayable: number;
    totalProducts: number;
    totalCustomers: number;
    lowStockCount: number;
    todayProfit: number;
    monthlySales: number;
    monthlyExpenses: number;
  };
  trend: { date: string; sales: number; purchase: number }[];
  paymentBreakdown: { method: string; amount: number }[];
}

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
];

const QUICK_ACTIONS = [
  { label: "New Invoice", href: "/sales/new" },
  { label: "Add Product", href: "/products/new" },
  { label: "Add Customer", href: "/customers/new" },
  { label: "New Purchase", href: "/purchase/new" },
  { label: "Add Expense", href: "/expenses" },
  { label: "Receive Payment", href: "/payments" },
];

export default function DashboardPage() {
  useDocumentTitle("Dashboard");
  const [range, setRange] = useState("30d");
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/summary?range=${range}`)
      .then((res) => res.json())
      .then((json) => setData(json))
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        <div data-tour="dashboard-quick-actions" className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.href} href={action.href}>
              <Button variant="outline" size="sm">
                <Plus className="h-3.5 w-3.5" /> {action.label}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div data-tour="dashboard-kpis" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Today's Sales" value={formatCurrency(data.kpis.todaySales)} icon={IndianRupee} tone="blue" />
          <KpiCard label="Today's Purchase" value={formatCurrency(data.kpis.todayPurchase)} icon={ShoppingCart} tone="purple" />
          <KpiCard label="Total Receivable" value={formatCurrency(data.kpis.totalReceivable)} icon={ReceiptText} tone="green" />
          <KpiCard label="Total Payable" value={formatCurrency(data.kpis.totalPayable)} icon={Wallet} tone="red" />
          <KpiCard label="Today's Profit" value={formatCurrency(data.kpis.todayProfit)} icon={TrendingUp} tone="green" />
          <KpiCard label="Total Products" value={String(data.kpis.totalProducts)} icon={Package} tone="blue" />
          <KpiCard label="Total Customers" value={String(data.kpis.totalCustomers)} icon={Users} tone="blue" />
          <KpiCard label="Low Stock Products" value={String(data.kpis.lowStockCount)} icon={AlertTriangle} tone="amber" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Sales &amp; Purchase Trend</h2>
            <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-36">
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          {loading || !data ? (
            <Skeleton className="h-72 w-full" />
          ) : data.trend.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-slate-400">
              No sales/purchase data in this range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={288}>
              <AreaChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Area type="monotone" dataKey="sales" name="Sales" stroke="#2563eb" fill="#bfdbfe" />
                <Area type="monotone" dataKey="purchase" name="Purchase" stroke="#9333ea" fill="#e9d5ff" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Payments Received by Method</h2>
          {loading || !data ? (
            <Skeleton className="h-72 w-full" />
          ) : data.paymentBreakdown.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-slate-400">
              No payments in this range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={288}>
              <BarChart data={data.paymentBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="method" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {!loading && data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Monthly Sales</p>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(data.kpis.monthlySales)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Monthly Expenses</p>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(data.kpis.monthlyExpenses)}</p>
          </div>
        </div>
      )}

      <BusinessInsights />
    </div>
  );
}
