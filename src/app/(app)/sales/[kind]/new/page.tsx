"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CustomerPicker } from "@/components/invoice/CustomerPicker";
import { ProductSearchAdd } from "@/components/invoice/ProductSearchAdd";
import { LineItemsEditor, TotalsSummary, addToCart, type CartItem } from "@/components/invoice/LineItemsEditor";
import { Button } from "@/components/common";
import { toast } from "@/lib/toast-store";
import { computeInvoiceTotals } from "@/lib/gst";
import { toIsoDate } from "@/lib/dateRanges";
import { salesDocConfig } from "@/lib/salesDocs";
import type { Customer } from "@/types/party";

export default function NewSalesDocumentPage() {
  const { kind } = useParams<{ kind: string }>();
  const config = salesDocConfig(kind);
  useDocumentTitle(config ? `New ${config.singular}` : "New Document");
  const router = useRouter();

  const [docDate, setDocDate] = useState(() => toIsoDate(new Date()));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return toIsoDate(d);
  });
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [businessState, setBusinessState] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/business")
      .then((r) => r.json())
      .then((b) => setBusinessState(b?.state ?? null))
      .catch(() => {});
  }, []);

  const isInterstate = Boolean(businessState && customer?.state && businessState.toLowerCase() !== customer.state.toLowerCase());
  const totals = useMemo(
    () => computeInvoiceTotals(cart.map((i) => ({ quantity: i.quantity, rate: i.rate, discount: i.discount, gstRate: i.gstRate })), isInterstate),
    [cart, isInterstate]
  );

  if (!config) notFound();

  async function handleSave() {
    if (cart.length === 0) {
      toast.error("Add at least one product.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sales-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: config!.docType,
          docDate: `${docDate}T00:00:00`,
          dueDate: dueDate ? `${dueDate}T00:00:00` : null,
          customerId: customer?.id ?? null,
          notes: notes.trim() || null,
          items: cart.map((i) => ({
            productId: i.productId,
            productName: i.productName,
            quantity: i.quantity,
            rate: i.rate,
            discount: i.discount,
            gstRate: i.gstRate,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? `Failed to save ${config!.singular.toLowerCase()}.`);
        return;
      }
      toast.success(`${config!.singular} ${data.docNumber} saved.`);
      router.push(`/sales/${kind}/${data.id}`);
    } finally {
      setSaving(false);
    }
  }

  const dateInput = "h-9 rounded-md border border-slate-300 px-2 text-sm";

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/sales/${kind}`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to {config.title}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">New {config.singular}</h1>
          <p className="text-xs text-slate-500">No stock or payment is recorded until this is converted to an invoice.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Date
            <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={dateInput} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            {config.dueDateLabel}
            <input type="date" value={dueDate} min={docDate} onChange={(e) => setDueDate(e.target.value)} className={dateInput} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-700">Customer</p>
        <CustomerPicker customer={customer} onSelect={setCustomer} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-700">Products</p>
        <ProductSearchAdd onAdd={(p) => setCart((prev) => addToCart(prev, p))} />
        <LineItemsEditor items={cart} onChange={setCart} showStockWarning={config.docType !== "ESTIMATE"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <label htmlFor="doc-notes" className="mb-2 block text-sm font-semibold text-slate-700">
            Notes / Terms
          </label>
          <textarea
            id="doc-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder={config.docType === "ESTIMATE" ? "e.g. Prices valid for 15 days. Delivery within 3 days of confirmation." : "Any instructions for this document"}
            className="w-full rounded-md border border-slate-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-slate-700">Summary</p>
          <TotalsSummary totals={totals} isInterstate={isInterstate} />
          <Button className="mt-4 w-full" size="lg" loading={saving} onClick={handleSave}>
            Save {config.singular}
          </Button>
        </div>
      </div>
    </div>
  );
}
