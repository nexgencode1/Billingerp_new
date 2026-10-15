"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pause, Pencil, Play, Plus, Repeat, Trash2, Zap } from "lucide-react";
import { Button, Input, Modal, Select } from "@/components/common";
import { Badge } from "@/components/common/Badge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { StatCard } from "@/components/reports/StatCard";
import { CustomerPicker } from "@/components/invoice/CustomerPicker";
import { ProductSearchAdd } from "@/components/invoice/ProductSearchAdd";
import { LineItemsEditor, addToCart, type CartItem } from "@/components/invoice/LineItemsEditor";
import { toast } from "@/lib/toast-store";
import { useCan } from "@/lib/permissions-context";
import { fetchJson } from "@/lib/reports";
import { toIsoDate } from "@/lib/dateRanges";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Customer } from "@/types/party";
import type { Product } from "@/types/product";

type Frequency = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
const FREQUENCY_LABEL: Record<Frequency, string> = { WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly" };

interface RecurringItem {
  productId: number;
  productName: string;
  quantity: number;
  rate: number;
  discount: number;
  gstRate: number;
}
interface Recurring {
  id: number;
  name: string;
  customerId: number;
  customer: { id: number; name: string };
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  isActive: boolean;
  lastRunAt: string | null;
  lastSaleId: number | null;
  lastInvoiceNumber: string | null;
  lastError: string | null;
  runCount: number;
  notes: string | null;
  itemCount: number;
  taxableValue: number;
  items: RecurringItem[];
}

function saveBody(r: Recurring, patch: Partial<{ isActive: boolean }>) {
  return {
    name: r.name,
    customerId: r.customerId,
    frequency: r.frequency,
    startDate: r.startDate,
    endDate: r.endDate,
    isActive: patch.isActive ?? r.isActive,
    notes: r.notes,
    items: r.items,
  };
}

export default function RecurringInvoicesPage() {
  useDocumentTitle("Recurring Invoices");
  const canCreate = useCan("SALES", "CREATE");
  const canEdit = useCan("SALES", "EDIT");
  const canDelete = useCan("SALES", "DELETE");
  const [rows, setRows] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Recurring | "new" | null>(null);
  const [deleting, setDeleting] = useState<Recurring | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchJson<Recurring[]>("/api/recurring-invoices")
      .then((r) => !cancelled && setRows(r))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const refresh = () => setReload((n) => n + 1);

  async function runNow(r: Recurring) {
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/recurring-invoices/${r.id}/run`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not create the invoice.");
        return;
      }
      toast.success(`Invoice ${data.invoiceNumber} created.`);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(r: Recurring) {
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/recurring-invoices/${r.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveBody(r, { isActive: !r.isActive })),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not update.");
        return;
      }
      toast.success(r.isActive ? "Paused." : "Resumed — invoices will be created on schedule.");
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    const res = await fetch(`/api/recurring-invoices/${deleting.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error ?? "Could not delete.");
    else toast.success("Deleted. Invoices already created are kept.");
    setDeleting(null);
    refresh();
  }

  const active = rows.filter((r) => r.isActive);
  const monthlyValue = active.reduce((s, r) => {
    const perMonth = { WEEKLY: 52 / 12, MONTHLY: 1, QUARTERLY: 1 / 3, YEARLY: 1 / 12 }[r.frequency];
    return s + r.taxableValue * perMonth;
  }, 0);

  const columns: Column<Recurring>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (r) => (
        <span>
          <span className="font-medium text-slate-800">{r.name}</span>
          <span className="block text-xs text-slate-500">{r.customer.name}</span>
        </span>
      ),
      exportValue: (r) => r.name,
    },
    { key: "frequency", header: "Repeats", render: (r) => FREQUENCY_LABEL[r.frequency], exportValue: (r) => FREQUENCY_LABEL[r.frequency] },
    { key: "taxableValue", header: "Value (pre-tax)", sortable: true, render: (r) => formatCurrency(r.taxableValue), exportValue: (r) => r.taxableValue },
    {
      key: "nextRunDate",
      header: "Next Invoice",
      sortable: true,
      render: (r) => (r.isActive ? formatDate(r.nextRunDate) : <span className="text-slate-400">—</span>),
      exportValue: (r) => (r.isActive ? formatDate(r.nextRunDate) : ""),
    },
    {
      key: "lastInvoiceNumber",
      header: "Last Invoice",
      render: (r) =>
        r.lastSaleId ? (
          <Link href={`/sales/invoices/${r.lastSaleId}`} className="text-blue-600 hover:underline">
            {r.lastInvoiceNumber}
          </Link>
        ) : (
          "-"
        ),
      exportValue: (r) => r.lastInvoiceNumber ?? "",
    },
    { key: "runCount", header: "Created" },
    {
      key: "isActive",
      header: "Status",
      render: (r) =>
        r.lastError ? (
          <span title={r.lastError}>
            <Badge tone="red">Failed</Badge>
            <span className="block max-w-48 truncate text-xs text-red-600">{r.lastError}</span>
          </span>
        ) : (
          <Badge tone={r.isActive ? "green" : "slate"}>{r.isActive ? "Active" : "Paused"}</Badge>
        ),
      exportValue: (r) => (r.lastError ? `Failed: ${r.lastError}` : r.isActive ? "Active" : "Paused"),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Repeat className="h-5 w-5 text-blue-600" /> Recurring Invoices
          </h1>
          <p className="text-sm text-slate-500">
            Rent, AMC, monthly supplies… set it once and the invoice is created automatically on schedule (as a credit sale —
            record the payment when it comes in). Stock and GST rules apply exactly as for a manual invoice.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setEditing("new")} data-tour="new-recurring">
            <Plus className="h-4 w-4" /> New Recurring Invoice
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active" value={String(active.length)} />
        <StatCard label="Paused" value={String(rows.length - active.length)} />
        <StatCard label="Expected / month (pre-tax)" value={formatCurrency(monthlyValue)} />
        <StatCard label="Failed last run" value={String(rows.filter((r) => r.lastError).length)} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        searchKeys={["name"]}
        exportFilename="recurring-invoices"
        rowKey={(r) => r.id}
        emptyTitle="No recurring invoices yet."
        emptyDescription="Create one for any bill you raise on a fixed schedule."
        rowActions={(r) => (
          <>
            {canCreate && r.isActive && (
              <Button variant="outline" size="sm" loading={busyId === r.id} onClick={() => runNow(r)} title="Create the next invoice now">
                <Zap className="h-4 w-4" /> Run now
              </Button>
            )}
            {canEdit && (
              <>
                <Button variant="ghost" size="sm" onClick={() => toggle(r)} aria-label={r.isActive ? `Pause ${r.name}` : `Resume ${r.name}`} title={r.isActive ? "Pause" : "Resume"}>
                  {r.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </>
            )}
            {canDelete && (
              <Button variant="ghost" size="sm" onClick={() => setDeleting(r)} aria-label={`Delete ${r.name}`}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            )}
          </>
        )}
      />

      {editing && (
        <RecurringForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete recurring invoice?"
        description={`"${deleting?.name}" will stop. Invoices it already created are not affected.`}
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function RecurringForm({ initial, onClose, onSaved }: { initial: Recurring | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "MONTHLY");
  const [startDate, setStartDate] = useState(initial ? initial.startDate.slice(0, 10) : toIsoDate(new Date()));
  const [endDate, setEndDate] = useState(initial?.endDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Load the full customer + current product info for an existing template.
  useEffect(() => {
    if (!initial) return;
    let cancelled = false;
    Promise.all([fetchJson<Customer[]>("/api/customers"), fetchJson<Product[]>("/api/products")])
      .then(([customers, products]) => {
        if (cancelled) return;
        setCustomer(customers.find((c) => c.id === initial.customerId) ?? null);
        const byId = new Map(products.map((p) => [p.id, p]));
        setItems(
          initial.items.map((i) => {
            const p = byId.get(i.productId);
            return {
              productId: i.productId,
              productName: i.productName,
              sku: p?.sku ?? "",
              unitLabel: p ? p.unit.shortName || p.unit.name : "",
              availableStock: p?.currentStock ?? 0,
              quantity: i.quantity,
              rate: i.rate,
              discount: i.discount,
              gstRate: i.gstRate,
            };
          })
        );
      })
      .catch((e: Error) => toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [initial]);

  async function save() {
    if (!customer) {
      toast.error("Pick a customer.");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one product.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(initial ? `/api/recurring-invoices/${initial.id}` : "/api/recurring-invoices", {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          customerId: customer.id,
          frequency,
          startDate: `${startDate}T00:00:00`,
          endDate: endDate ? `${endDate}T00:00:00` : null,
          isActive: initial?.isActive ?? true,
          notes: notes.trim() || null,
          items: items.map((i) => ({
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
        toast.error(data.error ?? "Could not save.");
        return;
      }
      toast.success(`Saved. Next invoice: ${formatDate(data.nextRunDate)}.`);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.name}` : "New Recurring Invoice"} size="lg">
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shop rent — Sharma ji" maxLength={200} />
          <Select label="Repeats" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            {Object.entries(FREQUENCY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Input label="First invoice on" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End on (optional)" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {initial && initial.runCount > 0 && (
          <p className="text-xs text-slate-500">
            {initial.runCount} invoice(s) already created — the schedule continues from occurrence #{initial.runCount + 1}.
          </p>
        )}
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">Customer</p>
          <CustomerPicker customer={customer} onSelect={setCustomer} />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">Products</p>
          <ProductSearchAdd onAdd={(p) => setItems((prev) => addToCart(prev, p))} />
          <LineItemsEditor items={items} onChange={setItems} showStockWarning={false} />
        </div>
        <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
