"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { Button, Select } from "@/components/common";
import { toast } from "@/lib/toast-store";
import { formatCurrency, formatDate } from "@/lib/utils";

const REASONS = ["Damaged", "Wrong Product", "Customer Request", "Defective", "Other"];
const REFUND_METHODS = ["Cash", "UPI", "Card", "Bank", "Store Credit"];

interface SaleOption {
  id: number;
  invoiceNumber: string;
  customer: { name: string } | null;
}

interface SaleItem {
  productId: number;
  productName: string;
  quantity: number;
  rate: number;
}

interface ReturnRow {
  id: number;
  returnNumber: string;
  returnDate: string;
  reason: string;
  totalAmount: number;
  sale: { invoiceNumber: string };
  customer: { name: string } | null;
}

export default function SalesReturnPage() {
  useDocumentTitle("Credit Note / Sales Return");
  const [query, setQuery] = useState("");
  const [sales, setSales] = useState<SaleOption[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [items, setItems] = useState<(SaleItem & { returnQty: number; selected: boolean })[]>([]);
  const [reason, setReason] = useState(REASONS[0]);
  const [refundMethod, setRefundMethod] = useState(REFUND_METHODS[0]);
  const [saving, setSaving] = useState(false);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(true);

  useEffect(() => {
    fetch("/api/sales")
      .then((r) => r.json())
      .then(setSales);
    refreshReturns();
  }, []);

  function refreshReturns() {
    setLoadingReturns(true);
    fetch("/api/sales/returns")
      .then((r) => r.json())
      .then(setReturns)
      .finally(() => setLoadingReturns(false));
  }

  const filteredSales = sales.filter((s) => !query || s.invoiceNumber.toLowerCase().includes(query.toLowerCase()));

  async function selectSale(id: number) {
    setSelectedSaleId(id);
    const res = await fetch(`/api/sales/${id}`);
    const data = await res.json();
    setItems(
      data.items.map((i: SaleItem) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        rate: i.rate,
        returnQty: 0,
        selected: false,
      }))
    );
  }

  async function handleSubmit() {
    const selectedItems = items.filter((i) => i.selected && i.returnQty > 0);
    if (!selectedSaleId || selectedItems.length === 0) {
      toast.error("Select an invoice and at least one product to return.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/sales/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saleId: selectedSaleId,
        reason,
        refundMethod,
        items: selectedItems.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.returnQty,
          rate: i.rate,
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      toast.error(data.error ?? "Failed to process return.");
      return;
    }
    toast.success(`Return ${data.returnNumber} recorded. Stock updated.`);
    setSelectedSaleId(null);
    setItems([]);
    refreshReturns();
  }

  const columns: Column<ReturnRow>[] = [
    { key: "returnNumber", header: "Return No", sortable: true },
    { key: "returnDate", header: "Date", render: (r) => formatDate(r.returnDate), exportValue: (r) => formatDate(r.returnDate) },
    { key: "sale", header: "Invoice No", render: (r) => r.sale.invoiceNumber, exportValue: (r) => r.sale.invoiceNumber },
    { key: "customer", header: "Customer", render: (r) => r.customer?.name ?? "Walk-in", exportValue: (r) => r.customer?.name ?? "" },
    { key: "reason", header: "Reason" },
    { key: "totalAmount", header: "Amount", render: (r) => formatCurrency(r.totalAmount), exportValue: (r) => r.totalAmount },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="mb-3 text-lg font-bold text-slate-900">Credit Note / Sales Return</h1>

        {!selectedSaleId ? (
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search invoice number..."
              className="h-9 w-full rounded-md border border-slate-300 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {query && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {filteredSales.slice(0, 20).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectSale(s.id)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    {s.invoiceNumber} — {s.customer?.name ?? "Walk-in"}
                  </button>
                ))}
                {filteredSales.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No invoices found.</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="py-2">Select</th>
                  <th className="py-2">Product</th>
                  <th className="py-2">Sold Qty</th>
                  <th className="py-2">Return Qty</th>
                  <th className="py-2 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.productId} className="border-b border-slate-100">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) =>
                          setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, selected: e.target.checked } : it)))
                        }
                      />
                    </td>
                    <td className="py-2">{item.productName}</td>
                    <td className="py-2">{item.quantity}</td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={item.returnQty}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, returnQty: Number(e.target.value) } : it))
                          )
                        }
                        className="h-8 w-20 rounded border border-slate-300 px-2"
                      />
                    </td>
                    <td className="py-2 text-right">{formatCurrency(item.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select label="Return Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <Select label="Refund / Credit Method" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                {REFUND_METHODS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedSaleId(null)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} loading={saving}>
                Process Return
              </Button>
            </div>
          </div>
        )}
      </div>

      <DataTable
        title="Return History"
        columns={columns}
        data={returns}
        loading={loadingReturns}
        searchKeys={["returnNumber"]}
        exportFilename="sales-returns"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
