"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useEffect, useRef, useState } from "react";
import { Download, Upload, AlertTriangle, Database, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/common";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { toast } from "@/lib/toast-store";
import { AutoBackupPanel } from "@/components/settings/AutoBackupPanel";

interface DemoStatus {
  isLoaded: boolean;
}

export default function BackupPage() {
  useDocumentTitle("Backup & Restore");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null);
  const [demoConfirmOpen, setDemoConfirmOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    fetch("/api/demo/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(setDemoStatus)
      .catch(() => {});
  }, []);

  async function handleLoadDemo() {
    setDemoLoading(true);
    try {
      const res = await fetch("/api/demo/load", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not load demo data.");
        return;
      }
      toast.success(
        `Demo data saved: ${data.products} products, ${data.customers} customers, ${data.sales} sales, ${data.purchases} purchases, ${data.expenses} expenses.`
      );
      setDemoStatus((s) => (s ? { ...s, isLoaded: true } : s));
    } catch {
      toast.error("Could not load demo data.");
    } finally {
      setDemoLoading(false);
      setDemoConfirmOpen(false);
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setConfirmOpen(true);
    }
  }

  async function handleRestore() {
    if (!pendingFile) return;
    setRestoring(true);
    try {
      const text = await pendingFile.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/settings/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Restore failed.");
        return;
      }
      toast.success("Backup restored successfully. Reloading...");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast.error("Invalid backup file.");
    } finally {
      setRestoring(false);
      setConfirmOpen(false);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">Backup &amp; Restore</h1>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Create &amp; Download Backup</h2>
        <p className="mb-3 text-sm text-slate-500">
          Download a complete snapshot of your data (products, customers, sales, purchases, payments, etc.) as a JSON file.
        </p>
        <a
          href="/api/settings/backup/export"
          download
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Download className="h-4 w-4" /> Download Backup
        </a>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Restore Backup</h2>
        <p className="mb-3 flex items-start gap-2 text-sm text-red-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          This replaces ALL current data with the contents of the backup file. This cannot be undone.
        </p>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileSelected} className="hidden" />
        <Button variant="danger" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4" /> Upload &amp; Restore Backup
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5" data-tour="demo-data">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Database className="h-4 w-4 text-slate-400" /> Demo Data
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Fill the system with ~6 months of realistic sample business data — 36 products, 20 customers, 8 suppliers, daily sales
          &amp; purchases, payments, expenses, leads, employees and attendance — so every report and chart has something to show.
          Everything is saved to the database through the same rules as real entries (GST, stock ledger, invoice numbers, dues).
        </p>
        {demoStatus?.isLoaded ? (
          <p className="flex items-center gap-2 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" /> Demo data is loaded.
          </p>
        ) : (
          <Button variant="outline" onClick={() => setDemoConfirmOpen(true)} disabled={!demoStatus}>
            <Database className="h-4 w-4" /> Load Demo Data
          </Button>
        )}
      </div>

      <AutoBackupPanel />

      <ConfirmDialog
        open={demoConfirmOpen}
        title="Load Demo Data?"
        description="This adds sample products, customers, suppliers and ~6 months of transactions to your CURRENT database (existing data is kept). Demo records use SKUs starting with DEMO- and invoice numbers continue from your current series. Best used on a test/fresh setup. Take a backup first if unsure. This can take up to a minute."
        confirmLabel="Load Demo Data"
        loading={demoLoading}
        onConfirm={handleLoadDemo}
        onCancel={() => setDemoConfirmOpen(false)}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Restore"
        description={`This will permanently delete all current data and replace it with the contents of "${pendingFile?.name}". This action cannot be undone.`}
        confirmLabel="Restore"
        loading={restoring}
        onConfirm={handleRestore}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />
    </div>
  );
}
