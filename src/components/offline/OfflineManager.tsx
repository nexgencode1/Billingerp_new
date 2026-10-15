"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { syncQueue, useOfflineStore } from "@/lib/offlineQueue";
import { toast } from "@/lib/toast-store";

const SYNC_EVERY_MS = 60_000;

// Registers the service worker, tracks online/offline, and syncs offline invoices when the
// connection returns (plus a periodic retry). Mounted once in the app layout.
export function OfflineManager() {
  const setOnline = useOfflineStore((s) => s.setOnline);
  const refreshCounts = useOfflineStore((s) => s.refreshCounts);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    setOnline(navigator.onLine);
    refreshCounts();

    async function trySync(announce: boolean) {
      if (!navigator.onLine || useOfflineStore.getState().pending === 0) return;
      const { synced, failed } = await syncQueue();
      if (announce || synced.length > 0) {
        if (synced.length > 0) toast.success(`${synced.length} offline invoice(s) synced: ${synced.map((s) => s.invoiceNumber).join(", ")}`);
        if (failed > 0) toast.error(`${failed} offline invoice(s) need attention — see Offline Invoices.`);
      }
    }

    const onOnline = () => {
      setOnline(true);
      trySync(true);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = setInterval(() => trySync(false), SYNC_EVERY_MS);
    trySync(false);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
    };
  }, [setOnline, refreshCounts]);

  return null;
}

// Small header badge: offline state and how many invoices are waiting to sync.
export function OfflineIndicator() {
  const { online, pending, failed, syncing } = useOfflineStore();
  if (online && pending === 0 && failed === 0) return null;

  return (
    <Link
      href="/sales/offline"
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        !online ? "bg-amber-100 text-amber-800" : failed > 0 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
      }`}
      title="Offline invoices"
    >
      {!online ? (
        <>
          <CloudOff className="h-3.5 w-3.5" /> Offline{pending > 0 ? ` · ${pending} to sync` : ""}
        </>
      ) : failed > 0 ? (
        <>
          <TriangleAlert className="h-3.5 w-3.5" /> {failed} failed to sync
        </>
      ) : (
        <>
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> {pending} syncing
        </>
      )}
    </Link>
  );
}
