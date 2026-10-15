"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Banknote, Landmark, Pencil, Plus, Star } from "lucide-react";
import { Button, Input, Modal, Select } from "@/components/common";
import { Badge } from "@/components/common/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { StatCard } from "@/components/reports/StatCard";
import { ReportFilterBar, describeFilters, initialFilterState } from "@/components/reports/ReportFilterBar";
import { ReportActions } from "@/components/reports/ReportActions";
import { toast } from "@/lib/toast-store";
import { useCan } from "@/lib/permissions-context";
import { useReportData } from "@/lib/useReportData";
import { toIsoDate } from "@/lib/dateRanges";
import {
  DAY_BOOK_TYPE_LABEL,
  cashBankLedgerDocument,
  fetchJson,
  type CashBankLedger,
  type CashBankLedgerRow,
  type MoneyAccount,
} from "@/lib/reports";
import { formatCurrency, formatDate } from "@/lib/utils";

type EntryType = "TRANSFER" | "ADJUST_IN" | "ADJUST_OUT";

export default function CashBankPage() {
  useDocumentTitle("Cash & Bank");
  const canEdit = useCan("PAYMENTS", "EDIT");
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filters, setFilters] = useState(initialFilterState);
  const [reloadKey, setReloadKey] = useState(0);
  const [accountModal, setAccountModal] = useState<MoneyAccount | "new" | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchJson<MoneyAccount[]>("/api/cash-bank/accounts")
      .then((a) => {
        if (cancelled) return;
        setAccounts(a);
        setSelectedId((id) => id ?? a[0]?.id ?? null);
      })
      .catch((e: Error) => toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const selected = accounts.find((a) => a.id === selectedId) ?? null;
  const ledger = useReportData<CashBankLedger>(
    selectedId ? `/api/cash-bank/accounts/${selectedId}/ledger?from=${filters.range.from}&to=${filters.range.to}&r=${reloadKey}` : null
  );

  const cashTotal = accounts.filter((a) => a.kind === "CASH").reduce((s, a) => s + a.currentBalance, 0);
  const bankTotal = accounts.filter((a) => a.kind === "BANK").reduce((s, a) => s + a.currentBalance, 0);
  const refresh = () => setReloadKey((k) => k + 1);

  const columns: Column<CashBankLedgerRow>[] = [
    { key: "date", header: "Date", sortable: true, render: (r) => formatDate(r.date), exportValue: (r) => formatDate(r.date) },
    {
      key: "source",
      header: "Type",
      render: (r) => <Badge tone={r.amountIn > 0 ? "green" : "red"}>{DAY_BOOK_TYPE_LABEL[r.source] ?? r.source}</Badge>,
      exportValue: (r) => DAY_BOOK_TYPE_LABEL[r.source] ?? r.source,
    },
    { key: "refNumber", header: "Ref No" },
    { key: "partyName", header: "Party", render: (r) => r.partyName ?? "-", exportValue: (r) => r.partyName ?? "" },
    { key: "description", header: "Description", className: "max-w-xs truncate" },
    { key: "amountIn", header: "In", render: (r) => (r.amountIn ? <span className="text-green-700">{formatCurrency(r.amountIn)}</span> : ""), exportValue: (r) => r.amountIn || "" },
    { key: "amountOut", header: "Out", render: (r) => (r.amountOut ? <span className="text-red-600">{formatCurrency(r.amountOut)}</span> : ""), exportValue: (r) => r.amountOut || "" },
    {
      key: "runningBalance",
      header: "Balance",
      render: (r) => <span className={`tabular-nums ${r.runningBalance < 0 ? "text-red-600" : ""}`}>{formatCurrency(r.runningBalance)}</span>,
      exportValue: (r) => r.runningBalance,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cash &amp; Bank</h1>
          <p className="text-sm text-slate-500">
            Balances are worked out from every payment, expense and refund — cash payments go to Cash in Hand, UPI / card / bank
            to the default bank account.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAccountModal("new")}>
              <Plus className="h-4 w-4" /> Bank Account
            </Button>
            <Button onClick={() => setEntryOpen(true)} data-tour="cash-bank-transfer">
              <ArrowLeftRight className="h-4 w-4" /> Transfer / Adjust
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Cash in Hand" value={formatCurrency(cashTotal)} />
        <StatCard label="Bank Balance" value={formatCurrency(bankTotal)} />
        <StatCard label="Total Liquid Money" value={formatCurrency(cashTotal + bankTotal)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-tour="cash-bank-accounts">
        {accounts.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelectedId(a.id)}
            className={`flex flex-col gap-2 rounded-lg border bg-white p-4 text-left transition ${
              a.id === selectedId ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-blue-300"
            } ${a.status ? "" : "opacity-60"}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                {a.kind === "CASH" ? <Banknote className="h-4 w-4 text-green-600" /> : <Landmark className="h-4 w-4 text-blue-600" />}
                {a.name}
              </span>
              <span className="flex items-center gap-1">
                {a.isDefault && (
                  <Badge tone="blue">
                    <Star className="mr-0.5 inline h-3 w-3" /> Default
                  </Badge>
                )}
                {!a.status && <Badge tone="slate">Inactive</Badge>}
                {canEdit && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit ${a.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAccountModal(a);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        setAccountModal(a);
                      }
                    }}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                )}
              </span>
            </span>
            {a.accountNumber && (
              <span className="text-xs text-slate-500">
                A/c ••••{a.accountNumber.slice(-4)} {a.ifsc ? `· ${a.ifsc}` : ""}
              </span>
            )}
            <span className={`text-lg font-bold tabular-nums ${a.currentBalance < 0 ? "text-red-600" : "text-slate-900"}`}>
              {formatCurrency(a.currentBalance)}
            </span>
            <span className="text-xs text-slate-500">
              In {formatCurrency(a.totalIn)} · Out {formatCurrency(a.totalOut)}
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">{selected.name} — Statement</h2>
            <ReportActions
              filename={`${selected.name.toLowerCase().replace(/\s+/g, "-")}-statement`}
              disabled={!ledger.data}
              getDocument={() => cashBankLedgerDocument(selected, ledger.data!, describeFilters(filters))}
            />
          </div>
          <ReportFilterBar state={filters} onChange={setFilters} />
          {ledger.data && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Opening" value={formatCurrency(ledger.data.summary.openingBalance)} />
              <StatCard label="Money In" value={formatCurrency(ledger.data.summary.totalIn)} />
              <StatCard label="Money Out" value={formatCurrency(ledger.data.summary.totalOut)} />
              <StatCard label="Closing" value={formatCurrency(ledger.data.summary.closingBalance)} />
            </div>
          )}
          <DataTable
            columns={columns}
            data={ledger.data?.rows ?? []}
            loading={ledger.loading}
            searchKeys={["refNumber", "partyName", "description"]}
            exportFilename="cash-bank-statement"
            rowKey={(r) => r.key}
            pageSize={50}
            emptyTitle="No transactions in this period."
          />
        </div>
      )}

      {accountModal && (
        <AccountModal
          account={accountModal === "new" ? null : accountModal}
          onClose={() => setAccountModal(null)}
          onSaved={() => {
            setAccountModal(null);
            refresh();
          }}
        />
      )}
      {entryOpen && (
        <EntryModal
          accounts={accounts.filter((a) => a.status)}
          onClose={() => setEntryOpen(false)}
          onSaved={() => {
            setEntryOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AccountModal({ account, onClose, onSaved }: { account: MoneyAccount | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: account?.name ?? "",
    bankName: account?.bankName ?? "",
    accountNumber: account?.accountNumber ?? "",
    ifsc: account?.ifsc ?? "",
    openingBalance: account?.openingBalance ?? 0,
    isDefault: account?.isDefault ?? false,
    status: account?.status ?? true,
  });
  const [saving, setSaving] = useState(false);
  const isCash = account?.kind === "CASH";

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(account ? `/api/cash-bank/accounts/${account.id}` : "/api/cash-bank/accounts", {
        method: account ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kind: account?.kind ?? "BANK" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not save account.");
        return;
      }
      toast.success("Account saved.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={account ? `Edit ${account.name}` : "Add Bank Account"}>
      <div className="flex flex-col gap-3">
        <Input label="Account Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. HDFC Current A/c" />
        {!isCash && (
          <>
            <Input label="Bank Name" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Account Number" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
              <Input label="IFSC" value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} />
            </div>
          </>
        )}
        <Input
          label="Opening Balance"
          type="number"
          step="0.01"
          value={form.openingBalance}
          onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })}
        />
        {!isCash && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
            Default account for UPI / card / bank payments
          </label>
        )}
        {account && !isCash && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.status} onChange={(e) => setForm({ ...form, status: e.target.checked })} />
            Active
          </label>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save} disabled={!form.name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EntryModal({ accounts, onClose, onSaved }: { accounts: MoneyAccount[]; onClose: () => void; onSaved: () => void }) {
  const cash = accounts.find((a) => a.kind === "CASH");
  const bank = accounts.find((a) => a.kind === "BANK");
  const [type, setType] = useState<EntryType>("TRANSFER");
  const [fromId, setFromId] = useState<number | "">(cash?.id ?? "");
  const [toId, setToId] = useState<number | "">(bank?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/cash-bank/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          fromAccountId: type === "ADJUST_IN" ? null : fromId || null,
          toAccountId: type === "ADJUST_OUT" ? null : toId || null,
          amount,
          date: `${date}T12:00:00`,
          note: note.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not save entry.");
        return;
      }
      toast.success("Entry saved.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const accountOptions = accounts.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name} ({formatCurrency(a.currentBalance)})
    </option>
  ));

  return (
    <Modal open onClose={onClose} title="Cash / Bank Entry">
      <div className="flex flex-col gap-3">
        <Select label="Entry Type" value={type} onChange={(e) => setType(e.target.value as EntryType)}>
          <option value="TRANSFER">Transfer (e.g. deposit cash to bank, withdraw cash)</option>
          <option value="ADJUST_IN">Add balance (e.g. owner adds capital)</option>
          <option value="ADJUST_OUT">Reduce balance (e.g. owner withdrawal)</option>
        </Select>
        {type !== "ADJUST_IN" && (
          <Select label="From" value={fromId} onChange={(e) => setFromId(Number(e.target.value))}>
            {accountOptions}
          </Select>
        )}
        {type !== "ADJUST_OUT" && (
          <Select label="To" value={toId} onChange={(e) => setToId(Number(e.target.value))}>
            {accountOptions}
          </Select>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Amount" type="number" min={0.01} step="0.01" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} />
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save} disabled={amount <= 0 || (type === "TRANSFER" && fromId === toId)}>
            Save Entry
          </Button>
        </div>
      </div>
    </Modal>
  );
}
