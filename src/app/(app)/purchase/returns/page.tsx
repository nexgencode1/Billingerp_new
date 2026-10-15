"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { Button, Select } from "@/components/common";
import { toast } from "@/lib/toast-store";
import { formatCurrency, formatDate } from "@/lib/utils";

const REASONS = ["Damaged", "Wrong Item Received", "Excess Quantity", "Quality Issue", "Other"];

interface PurchaseOption {
  id: number;
  purchaseNumber: string;
  supplier: { name: string };
}

interface PurchaseItem {
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
  purchase: { purchaseNumber: string };
  supplier: { name: string } | null;
}

export default function PurchaseReturnPage() {
  useDocumentTitle("Debit Note / Purchase Return");
  const [query, setQuery] = useState("");
  const [purchases, setPurchases] = useState<PurchaseOption[]>([]);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(null);
  const [items, setItems] = useState<(PurchaseItem & { returnQty: number; selected: boolean })[]>([]);
  const [reason, setReason] = useState(REASONS[0]);
  const [saving, setSaving] = useState(false);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(true);

  useEffect(() => {
    fetch("/api/purchases")
      .then((r) => r.json())
      .then(setPurchases);
    refreshReturns();
  }, []);

  function refreshReturns() {
    setLoadingReturns(true);
    fetch("/api/purchases/returns")
      .then((r) => r.json())
      .then(setReturns)
      .finally(() => setLoadingReturns(false));
  }

  const filtered = purchases.filter((p) => !query || p.purchaseNumber.toLowerCase().includes(query.toLowerCase()));

  async function selectPurchase(id: number) {
    setSelectedPurchaseId(id);
    const res = await fetch(`/api/purchases/${id}`);
    const data = await res.json();
    setItems(
      data.items.map((i: PurchaseItem) => ({
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
    if (!selectedPurchaseId || selectedItems.length === 0) {
      toast.error("Select a purchase and at least one product to return.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/purchases/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purchaseId: selectedPurchaseId,
        reason,
        items: selectedItems.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.returnQty, rate: i.rate })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      toast.error(data.error ?? "Failed to process return.");
      return;
    }
    toast.success(`Return ${data.returnNumber} recorded. Stock updated.`);
    setSelectedPurchaseId(null);
    setItems([]);
    refreshReturns();
  }

  const columns: Column<ReturnRow>[] = [
    { key: "returnNumber", header: "Return No", sortable: true },
    { key: "returnDate", header: "Date", render: (r) => formatDate(r.returnDate), exportValue: (r) => formatDate(r.returnDate) },
    { key: "purchase", header: "Purchase No", render: (r) => r.purchase.purchaseNumber, exportValue: (r) => r.purchase.purchaseNumber },
    { key: "supplier", header: "Supplier", render: (r) => r.supplier?.name ?? "-", exportValue: (r) => r.supplier?.name ?? "" },
    { key: "reason", header: "Reason" },
    { key: "totalAmount", header: "Amount", render: (r) => formatCurrency(r.totalAmount), exportValue: (r) => r.totalAmount },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="mb-3 text-lg font-bold text-slate-900">Debit Note / Purchase Return</h1>

        {!selectedPurchaseId ? (
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search purchase number..."
              className="h-9 w-full rounded-md border border-slate-300 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {query && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {filtered.slice(0, 20).map((p) => (
                  <button key={p.id} onClick={() => selectPurchase(p.id)} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                    {p.purchaseNumber} — {p.supplier.name}
                  </button>
                ))}
                {filtered.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No purchases found.</p>}
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
                  <th className="py-2">Purchased Qty</th>
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
                        onChange={(e) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, selected: e.target.checked } : it)))}
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
                          setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, returnQty: Number(e.target.value) } : it)))
                        }
                        className="h-8 w-20 rounded border border-slate-300 px-2"
                      />
                    </td>
                    <td className="py-2 text-right">{formatCurrency(item.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Select label="Return Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-xs">
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedPurchaseId(null)}>
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
        exportFilename="purchase-returns"
        rowKey={(r) => r.id}
      />
    </div>
  );
}
