"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/common";
import { toast } from "@/lib/toast-store";

const SERIES = [
  { prefixKey: "invoicePrefix", counterKey: "saleCounter", label: "Sales" },
  { prefixKey: "purchasePrefix", counterKey: "purchaseCounter", label: "Purchase" },
  { prefixKey: "paymentPrefix", counterKey: "paymentCounter", label: "Payment" },
  { prefixKey: "expensePrefix", counterKey: "expenseCounter", label: "Expense" },
  { prefixKey: "saleReturnPrefix", counterKey: "saleReturnCounter", label: "Credit Note (Sales Return)" },
  { prefixKey: "purchaseReturnPrefix", counterKey: "purchaseReturnCounter", label: "Debit Note (Purchase Return)" },
  { prefixKey: "productionPrefix", counterKey: "productionCounter", label: "Production Order" },
  { prefixKey: "estimatePrefix", counterKey: "estimateCounter", label: "Estimate / Quotation" },
  { prefixKey: "saleOrderPrefix", counterKey: "saleOrderCounter", label: "Sale Order" },
  { prefixKey: "challanPrefix", counterKey: "challanCounter", label: "Delivery Challan" },
] as const;

type FormState = Record<string, string | number>;

export default function NumberSeriesPage() {
  useDocumentTitle("Number Series");
  const [form, setForm] = useState<FormState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/business")
      .then((r) => r.json())
      .then((b) => {
        if (b) {
          const next: FormState = {};
          for (const s of SERIES) {
            next[s.prefixKey] = b[s.prefixKey] ?? "";
            next[s.counterKey] = b[s.counterKey] ?? 0;
          }
          setForm(next);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/business", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save number series.");
      return;
    }
    toast.success("Number series updated.");
  }

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">Number Series</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="py-2">Series</th>
              <th className="py-2">Prefix</th>
              <th className="py-2">Next Number</th>
              <th className="py-2">Preview</th>
            </tr>
          </thead>
          <tbody>
            {SERIES.map((s) => {
              const prefix = String(form[s.prefixKey] ?? "");
              const counter = Number(form[s.counterKey] ?? 0);
              return (
                <tr key={s.prefixKey} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-700">{s.label}</td>
                  <td className="py-2">
                    <Input value={prefix} onChange={(e) => setForm({ ...form, [s.prefixKey]: e.target.value })} className="w-28" />
                  </td>
                  <td className="py-2">
                    <Input
                      type="number"
                      value={counter + 1}
                      onChange={(e) => setForm({ ...form, [s.counterKey]: Number(e.target.value) - 1 })}
                      className="w-28"
                    />
                  </td>
                  <td className="py-2 text-slate-500">
                    {prefix}-{String(counter + 1).padStart(5, "0")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end">
          <Button onClick={handleSave} loading={saving}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
