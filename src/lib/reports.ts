// Report types + fetchers + export-document builders, shared by every report page and by the
// "Download all reports" hub so a report looks identical whichever screen exported it.
import type { TrendPoint } from "@/components/reports/ReportCharts";
import { formatDate } from "@/lib/utils";
import { money, type ReportDocument } from "@/lib/reportExport";
import type { DateRange } from "@/lib/dateRanges";
import type { Customer, Supplier } from "@/types/party";
import type { StockRow } from "@/types/inventory";

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface TopItem {
  name: string;
  quantity: number;
  amount: number;
}

// ---------- Sales ----------
export interface SalesRow {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  customer: { name: string } | null;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  status: string;
}
export interface SalesReport {
  summary: { totalInvoices: number; totalSales: number; totalDiscount: number; taxableAmount: number; totalGst: number; totalPaid: number; totalDue: number };
  rows: SalesRow[];
  topItems: TopItem[];
}
export function salesDocument(r: SalesReport, subtitle: string): ReportDocument {
  const s = r.summary;
  return {
    title: "Sales Report",
    subtitle,
    summary: [
      { label: "Invoices", value: s.totalInvoices },
      { label: "Total Sales", value: money(s.totalSales) },
      { label: "Discount", value: money(s.totalDiscount) },
      { label: "Taxable Amount", value: money(s.taxableAmount) },
      { label: "GST", value: money(s.totalGst) },
      { label: "Received", value: money(s.totalPaid) },
      { label: "Due", value: money(s.totalDue) },
    ],
    sections: [
      {
        title: "Invoices",
        columns: ["Invoice No", "Date", "Customer", "Taxable", "GST", "Amount", "Paid", "Due", "Payment", "Status"],
        rows: r.rows.map((x) => [
          x.invoiceNumber, formatDate(x.invoiceDate), x.customer?.name ?? "Walk-in", x.taxableAmount,
          x.cgst + x.sgst + x.igst, x.grandTotal, x.paidAmount, x.dueAmount, x.paymentStatus, x.status,
        ]),
      },
      {
        title: "Top Selling Products",
        columns: ["Product", "Quantity", "Amount"],
        rows: r.topItems.map((t) => [t.name, t.quantity, t.amount]),
      },
    ],
  };
}

// ---------- Purchase ----------
export interface PurchaseRow {
  id: number;
  purchaseNumber: string;
  supplierInvoiceNumber: string | null;
  purchaseDate: string;
  supplier: { name: string };
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: string;
  status: string;
}
export interface PurchaseReport {
  summary: { totalPurchases: number; totalAmount: number; taxableAmount: number; totalGst: number; totalDiscount: number; totalPaid: number; totalDue: number };
  rows: PurchaseRow[];
  topSuppliers: TopItem[];
}
export function purchaseDocument(r: PurchaseReport, subtitle: string): ReportDocument {
  const s = r.summary;
  return {
    title: "Purchase Report",
    subtitle,
    summary: [
      { label: "Purchases", value: s.totalPurchases },
      { label: "Total Amount", value: money(s.totalAmount) },
      { label: "Taxable Amount", value: money(s.taxableAmount) },
      { label: "GST (Input)", value: money(s.totalGst) },
      { label: "Paid", value: money(s.totalPaid) },
      { label: "Due", value: money(s.totalDue) },
    ],
    sections: [
      {
        title: "Purchases",
        columns: ["Purchase No", "Supplier Inv", "Date", "Supplier", "Taxable", "GST", "Amount", "Paid", "Due", "Payment"],
        rows: r.rows.map((x) => [
          x.purchaseNumber, x.supplierInvoiceNumber ?? "", formatDate(x.purchaseDate), x.supplier.name, x.taxableAmount,
          x.cgst + x.sgst + x.igst, x.grandTotal, x.paidAmount, x.dueAmount, x.paymentStatus,
        ]),
      },
      {
        title: "Top Suppliers",
        columns: ["Supplier", "Bills", "Amount"],
        rows: r.topSuppliers.map((t) => [t.name, t.quantity, t.amount]),
      },
    ],
  };
}

// ---------- GST ----------
export interface GstRow {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  customer: { name: string; gstin: string | null } | null;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
}
export interface GstReport {
  summary: { taxableValue: number; cgst: number; sgst: number; igst: number; totalGst: number };
  rows: GstRow[];
  byRate: { gstRate: number; taxableValue: number; gstAmount: number }[];
}
export function gstDocument(r: GstReport, subtitle: string): ReportDocument {
  const s = r.summary;
  return {
    title: "GST Report",
    subtitle,
    summary: [
      { label: "Taxable Value", value: money(s.taxableValue) },
      { label: "CGST", value: money(s.cgst) },
      { label: "SGST", value: money(s.sgst) },
      { label: "IGST", value: money(s.igst) },
      { label: "Total GST", value: money(s.totalGst) },
    ],
    sections: [
      {
        title: "Rate-wise Summary",
        columns: ["GST Rate", "Taxable Value", "Tax Amount"],
        rows: r.byRate.map((b) => [`${b.gstRate}%`, b.taxableValue, b.gstAmount]),
      },
      {
        title: "Invoice-wise Details",
        columns: ["Invoice", "Date", "Customer", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "Total GST", "Invoice Total"],
        rows: r.rows.map((x) => [
          x.invoiceNumber, formatDate(x.invoiceDate), x.customer?.name ?? "Walk-in", x.customer?.gstin ?? "",
          x.taxableAmount, x.cgst, x.sgst, x.igst, x.cgst + x.sgst + x.igst, x.grandTotal,
        ]),
      },
    ],
  };
}

// ---------- Profit ----------
export interface ProfitItem {
  productId: number;
  name: string;
  quantity: number;
  salesAmount: number;
  costAmount: number;
  profit: number;
}
export interface ProfitReport {
  summary: { grossSales: number; cost: number; grossProfit: number; expenses: number; netProfit: number; profitPercent: number };
  items: ProfitItem[];
}
export function profitDocument(r: ProfitReport, subtitle: string): ReportDocument {
  const s = r.summary;
  return {
    title: "Profit & Loss Report",
    subtitle,
    summary: [
      { label: "Gross Sales (Taxable)", value: money(s.grossSales) },
      { label: "Cost of Goods Sold", value: money(-s.cost) },
      { label: "Gross Profit", value: money(s.grossProfit) },
      { label: "Expenses", value: money(-s.expenses) },
      { label: "Net Profit", value: money(s.netProfit) },
      { label: "Net Margin", value: `${s.profitPercent.toFixed(2)}%` },
    ],
    sections: [
      {
        title: "Item-wise Profit",
        columns: ["Product", "Qty Sold", "Sales (Taxable)", "Cost", "Profit", "Margin %"],
        rows: r.items.map((i) => [
          i.name, i.quantity, i.salesAmount, i.costAmount, i.profit,
          i.salesAmount > 0 ? `${((i.profit / i.salesAmount) * 100).toFixed(1)}%` : "-",
        ]),
      },
    ],
  };
}

// ---------- Payment ----------
export interface PaymentRow {
  id: number;
  paymentNumber: string;
  date: string;
  direction: string;
  amount: number;
  method: string;
  referenceNo: string | null;
  customer: { name: string } | null;
  supplier: { name: string } | null;
  sale: { invoiceNumber: string } | null;
  purchase: { purchaseNumber: string } | null;
}
export interface PaymentReport {
  summary: { totalReceived: number; totalPaid: number; byMethod: { method: string; amount: number }[] };
  rows: PaymentRow[];
}
export function paymentDocument(r: PaymentReport, subtitle: string): ReportDocument {
  const s = r.summary;
  return {
    title: "Payment Report",
    subtitle,
    summary: [
      { label: "Total Received", value: money(s.totalReceived) },
      { label: "Total Paid", value: money(s.totalPaid) },
      { label: "Net Cash Flow", value: money(s.totalReceived - s.totalPaid) },
      ...s.byMethod.map((m) => ({ label: `Via ${m.method}`, value: money(m.amount) })),
    ],
    sections: [
      {
        title: "Payments",
        columns: ["Payment No", "Date", "Type", "Party", "Against", "Method", "Reference", "Amount"],
        rows: r.rows.map((x) => [
          x.paymentNumber, formatDate(x.date), x.direction === "RECEIVE" ? "Received" : "Paid",
          x.customer?.name ?? x.supplier?.name ?? "-", x.sale?.invoiceNumber ?? x.purchase?.purchaseNumber ?? "-",
          x.method, x.referenceNo ?? "", x.amount,
        ]),
      },
    ],
  };
}

// ---------- Expense ----------
export interface ExpenseRow {
  id: number;
  date: string;
  category: { name: string };
  amount: number;
  paymentMethod: string;
  description: string | null;
}
export interface ExpenseReport {
  summary: { totalExpenses: number; byCategory: { category: string; amount: number }[] };
  rows: ExpenseRow[];
}
export function expenseDocument(r: ExpenseReport, subtitle: string): ReportDocument {
  return {
    title: "Expense Report",
    subtitle,
    summary: [
      { label: "Total Expenses", value: money(r.summary.totalExpenses) },
      { label: "Entries", value: r.rows.length },
    ],
    sections: [
      {
        title: "Category-wise",
        columns: ["Category", "Amount", "Share %"],
        rows: r.summary.byCategory.map((c) => [
          c.category, c.amount,
          r.summary.totalExpenses > 0 ? `${((c.amount / r.summary.totalExpenses) * 100).toFixed(1)}%` : "-",
        ]),
      },
      {
        title: "Expenses",
        columns: ["Date", "Category", "Description", "Method", "Amount"],
        rows: r.rows.map((x) => [formatDate(x.date), x.category.name, x.description ?? "", x.paymentMethod, x.amount]),
      },
    ],
  };
}

// ---------- Party / stock (point-in-time, not date-filtered) ----------
export function customerDocument(rows: Customer[]): ReportDocument {
  const total = (k: "totalSales" | "paid" | "due") => rows.reduce((sum, r) => sum + (r[k] ?? 0), 0);
  return {
    title: "Customer Report",
    subtitle: `As of ${formatDate(new Date())}`,
    summary: [
      { label: "Customers", value: rows.length },
      { label: "Total Sales", value: money(total("totalSales")) },
      { label: "Received", value: money(total("paid")) },
      { label: "Receivable (Due)", value: money(total("due")) },
    ],
    sections: [
      {
        title: "Customers",
        columns: ["Customer", "Mobile", "City", "State", "Total Sales", "Paid", "Due"],
        rows: rows.map((r) => [r.name, r.mobile, r.city ?? "", r.state ?? "", r.totalSales ?? 0, r.paid ?? 0, r.due ?? 0]),
      },
    ],
  };
}

export function supplierDocument(rows: Supplier[]): ReportDocument {
  const total = (k: "totalPurchase" | "paid" | "due") => rows.reduce((sum, r) => sum + (r[k] ?? 0), 0);
  return {
    title: "Supplier Report",
    subtitle: `As of ${formatDate(new Date())}`,
    summary: [
      { label: "Suppliers", value: rows.length },
      { label: "Total Purchase", value: money(total("totalPurchase")) },
      { label: "Paid", value: money(total("paid")) },
      { label: "Payable (Due)", value: money(total("due")) },
    ],
    sections: [
      {
        title: "Suppliers",
        columns: ["Supplier", "Mobile", "City", "State", "Total Purchase", "Paid", "Due"],
        rows: rows.map((r) => [r.name, r.mobile, r.city ?? "", r.state ?? "", r.totalPurchase ?? 0, r.paid ?? 0, r.due ?? 0]),
      },
    ],
  };
}

export function stockDocument(rows: StockRow[]): ReportDocument {
  const value = rows.reduce((sum, r) => sum + r.stockValue, 0);
  const low = rows.filter((r) => r.status !== "IN_STOCK").length;
  return {
    title: "Stock Report",
    subtitle: `As of ${formatDate(new Date())}`,
    summary: [
      { label: "Products", value: rows.length },
      { label: "Stock Value", value: money(value) },
      { label: "Low / Out of Stock", value: low },
    ],
    sections: [
      {
        title: "Stock Summary",
        columns: ["Product", "Opening", "Purchase", "Sales", "Returns", "Adjustment", "Closing", "Min Level", "Value"],
        rows: rows.map((r) => [r.name, r.openingStock, r.purchase, r.sales, r.saleReturn, r.adjustment, r.currentStock, r.minimumStock, r.stockValue]),
      },
    ],
  };
}

// ---------- Trend ----------
export function fetchTrend(range: DateRange, grouping: "day" | "month") {
  return fetchJson<TrendPoint[]>(`/api/reports/trend?from=${range.from}&to=${range.to}&groupBy=${grouping}`);
}

// ---------- Day Book ----------
export const DAY_BOOK_TYPE_LABEL: Record<string, string> = {
  SALE: "Sale",
  PURCHASE: "Purchase",
  CREDIT_NOTE: "Credit Note",
  DEBIT_NOTE: "Debit Note",
  ESTIMATE: "Estimate",
  SALE_ORDER: "Sale Order",
  DELIVERY_CHALLAN: "Delivery Challan",
  PAYMENT_IN: "Payment In",
  PAYMENT_OUT: "Payment Out",
  EXPENSE: "Expense",
  SALE_REFUND: "Refund",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ADJUST_IN: "Balance Added",
  ADJUST_OUT: "Balance Reduced",
};

export interface DayBookRow {
  key: string;
  date: string;
  type: string;
  refId: number;
  refNumber: string;
  partyName: string | null;
  description: string;
  total: number;
  moneyIn: number;
  moneyOut: number;
}
export interface DayBookReport {
  summary: { moneyIn: number; moneyOut: number; net: number; salesTotal: number; purchaseTotal: number; expenseTotal: number };
  rows: DayBookRow[];
}
export function dayBookDocument(r: DayBookReport, subtitle: string): ReportDocument {
  const s = r.summary;
  return {
    title: "Day Book",
    subtitle,
    summary: [
      { label: "Money In", value: money(s.moneyIn) },
      { label: "Money Out", value: money(s.moneyOut) },
      { label: "Net Cash Flow", value: money(s.net) },
      { label: "Sales", value: money(s.salesTotal) },
      { label: "Purchases", value: money(s.purchaseTotal) },
      { label: "Expenses", value: money(s.expenseTotal) },
    ],
    sections: [
      {
        title: "Transactions",
        columns: ["Date", "Type", "Ref No", "Party", "Description", "Total", "Money In", "Money Out"],
        rows: r.rows.map((x) => [
          formatDate(x.date), DAY_BOOK_TYPE_LABEL[x.type] ?? x.type, x.refNumber, x.partyName ?? "", x.description,
          x.total || "", x.moneyIn || "", x.moneyOut || "",
        ]),
      },
    ],
  };
}

// ---------- Balance Sheet ----------
export interface BalanceLine {
  label: string;
  amount: number;
}
export interface BalanceSheet {
  asOf: string;
  assets: BalanceLine[];
  totalAssets: number;
  liabilities: BalanceLine[];
  totalLiabilities: number;
  equity: BalanceLine[];
  totalEquity: number;
  accounts: { name: string; kind: string; balance: number }[];
}
export function balanceSheetDocument(b: BalanceSheet): ReportDocument {
  const lines = (items: BalanceLine[]) => items.map((i) => [i.label, i.amount]);
  return {
    title: "Balance Sheet",
    subtitle: `As of ${formatDate(b.asOf)} (simplified)`,
    summary: [
      { label: "Total Assets", value: money(b.totalAssets) },
      { label: "Total Liabilities", value: money(b.totalLiabilities) },
      { label: "Owner's Equity", value: money(b.totalEquity) },
    ],
    sections: [
      { title: "Assets", columns: ["Particulars", "Amount"], rows: [...lines(b.assets), ["Total Assets", b.totalAssets]] },
      {
        title: "Liabilities & Equity",
        columns: ["Particulars", "Amount"],
        rows: [...lines(b.liabilities), ["Total Liabilities", b.totalLiabilities], ...lines(b.equity), ["Total Liabilities + Equity", b.totalLiabilities + b.totalEquity]],
      },
      { title: "Cash & Bank Accounts", columns: ["Account", "Type", "Balance"], rows: b.accounts.map((a) => [a.name, a.kind, a.balance]) },
    ],
  };
}

// ---------- Cash & Bank ----------
export interface MoneyAccount {
  id: number;
  name: string;
  kind: "CASH" | "BANK";
  bankName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  openingBalance: number;
  isDefault: boolean;
  status: boolean;
  currentBalance: number;
  totalIn: number;
  totalOut: number;
}
export interface CashBankLedgerRow {
  key: string;
  date: string;
  source: string;
  refNumber: string;
  partyName: string | null;
  description: string;
  amountIn: number;
  amountOut: number;
  runningBalance: number;
}
export interface CashBankLedger {
  summary: { openingBalance: number; totalIn: number; totalOut: number; closingBalance: number };
  rows: CashBankLedgerRow[];
}
export function cashBankLedgerDocument(account: MoneyAccount, l: CashBankLedger, subtitle: string): ReportDocument {
  return {
    title: `${account.name} - Statement`,
    subtitle,
    summary: [
      { label: "Opening Balance", value: money(l.summary.openingBalance) },
      { label: "Money In", value: money(l.summary.totalIn) },
      { label: "Money Out", value: money(l.summary.totalOut) },
      { label: "Closing Balance", value: money(l.summary.closingBalance) },
    ],
    sections: [
      {
        title: "Transactions",
        columns: ["Date", "Type", "Ref No", "Party", "Description", "In", "Out", "Balance"],
        rows: l.rows.map((x) => [
          formatDate(x.date), DAY_BOOK_TYPE_LABEL[x.source] ?? x.source, x.refNumber, x.partyName ?? "", x.description,
          x.amountIn || "", x.amountOut || "", x.runningBalance,
        ]),
      },
    ],
  };
}
