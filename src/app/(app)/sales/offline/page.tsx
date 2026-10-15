"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { listQueued, removeQueued, retryQueued, syncQueue, useOfflineStore, type QueuedSale } from "@/lib/offlineQueue";
import { toast } from "@/lib/toast-store";
import { formatCurrency } from "@/lib/utils";

export default function OfflineInvoicesPage() {
  useDocumentTitle("Offline Invoices");
  const { online, syncing } = useOfflineStore();
  const [items, setItems] = useState<QueuedSale[]>([]);
  const [discard, setDiscard] = useState<QueuedSale | null>(null);

  const load = useCallback(() => {
    listQueued()
      .then((all) => setItems(all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    load();
  }, [load, syncing]);

  async function syncNow() {
    const { synced, failed } = await syncQueue();
    if (synced.length) toast.success(`Synced: ${synced.map((s) => s.invoiceNumber).join(", ")}`);
    if (failed) toast.error(`${failed} could not be saved — see the reason below.`);
    if (!synced.length && !failed) toast.info("Nothing synced — still offline?");
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <CloudOff className="h-5 w-5 text-amber-600" /> Offline Invoices
          </h1>
          <p className="text-sm text-slate-500">
            Bills created without a connection are kept on this device and saved to the server automatically when you&apos;re back
            online. Invoice numbers are given at that moment.
          </p>
        </div>
        <Button onClick={syncNow} loading={syncing} disabled={!online || items.every((i) => i.status !== "PENDING")}>
          <RefreshCw className="h-4 w-4" /> Sync now
        </Button>
      </div>

      {!online && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">You are offline. New invoices will be queued here.</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2 text-right">Items</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No offline invoices — everything is synced.
                </td>
              </tr>
            )}
            {items.map((q) => (
              <tr key={q.id} className="border-b border-slate-100">
                <td className="px-3 py-2">{new Date(q.createdAt).toLocaleString("en-IN")}</td>
                <td className="px-3 py-2">{q.summary.customerName ?? "Walk-in"}</td>
                <td className="px-3 py-2 text-right">{q.summary.itemCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(q.summary.grandTotal)}</td>
                <td className="px-3 py-2">
                  {q.status === "PENDING" ? (
                    <Badge tone="blue">Waiting to sync</Badge>
                  ) : (
                    <span>
                      <Badge tone="red">Failed</Badge>
                      <span className="block max-w-xs text-xs text-red-600">{q.error}</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {q.status === "FAILED" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await retryQueued(q.id);
                          load();
                        }}
                        title="Try again (e.g. after adding stock)"
                      >
                        <RotateCcw className="h-4 w-4" /> Retry
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setDiscard(q)} aria-label="Discard this offline invoice">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={discard !== null}
        title="Discard offline invoice?"
        description="It was never saved on the server, so it will be lost. Stock and dues are not affected."
        confirmLabel="Discard"
        onConfirm={async () => {
          if (discard) await removeQueued(discard.id);
          setDiscard(null);
          await useOfflineStore.getState().refreshCounts();
          load();
        }}
        onCancel={() => setDiscard(null)}
      />
    </div>
  );
}
