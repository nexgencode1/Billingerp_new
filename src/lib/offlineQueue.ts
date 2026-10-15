"use client";

import { create } from "zustand";

// Invoices created while the server is unreachable are stored on this device (IndexedDB) and
// posted to /api/sales — the normal path, with all its rules — once the connection is back.
// The invoice number is assigned at sync time, so numbering stays gap-free and unique.

export interface QueuedSale {
  id: string; // local id
  createdAt: string;
  payload: Record<string, unknown>; // exact body for POST /api/sales
  summary: { customerName: string | null; itemCount: number; grandTotal: number };
  status: "PENDING" | "FAILED";
  error?: string;
  attempts: number;
}

const DB_NAME = "billing-erp-offline";
const STORE = "sales";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export const listQueued = () => tx<QueuedSale[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedSale[]>);
const putQueued = (q: QueuedSale) => tx("readwrite", (s) => s.put(q));
export const removeQueued = (id: string) => tx("readwrite", (s) => s.delete(id));

interface OfflineState {
  online: boolean;
  pending: number;
  failed: number;
  syncing: boolean;
  setOnline: (online: boolean) => void;
  refreshCounts: () => Promise<void>;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  online: true,
  pending: 0,
  failed: 0,
  syncing: false,
  setOnline: (online) => set({ online }),
  refreshCounts: async () => {
    try {
      const all = await listQueued();
      set({ pending: all.filter((q) => q.status === "PENDING").length, failed: all.filter((q) => q.status === "FAILED").length });
    } catch {
      // IndexedDB unavailable (private mode) — offline queue simply isn't available.
    }
  },
}));

export async function enqueueSale(payload: Record<string, unknown>, summary: QueuedSale["summary"]): Promise<QueuedSale> {
  const item: QueuedSale = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    payload,
    summary,
    status: "PENDING",
    attempts: 0,
  };
  await putQueued(item);
  await useOfflineStore.getState().refreshCounts();
  return item;
}

// True when the request never reached the server (as opposed to the server rejecting it).
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
}

let syncInFlight = false;

// Posts pending sales one by one, oldest first. Network failure → stop and keep them pending;
// a 4xx from the server (e.g. not enough stock any more) → mark FAILED for the user to review.
export async function syncQueue(): Promise<{ synced: { invoiceNumber: string }[]; failed: number }> {
  if (syncInFlight) return { synced: [], failed: 0 };
  syncInFlight = true;
  useOfflineStore.setState({ syncing: true });
  const synced: { invoiceNumber: string }[] = [];
  let failed = 0;
  try {
    const items = (await listQueued()).filter((q) => q.status === "PENDING").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const item of items) {
      let res: Response;
      try {
        res = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.payload) });
      } catch {
        break; // still offline — try again later
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await removeQueued(item.id);
        synced.push({ invoiceNumber: data.invoiceNumber });
      } else if (res.status === 401) {
        break; // session expired — sync after the user signs in again
      } else {
        failed++;
        await putQueued({ ...item, status: "FAILED", error: data.error ?? `Server error ${res.status}`, attempts: item.attempts + 1 });
      }
    }
  } finally {
    syncInFlight = false;
    useOfflineStore.setState({ syncing: false });
    await useOfflineStore.getState().refreshCounts();
  }
  return { synced, failed };
}

export async function retryQueued(id: string) {
  const item = (await listQueued()).find((q) => q.id === id);
  if (!item) return;
  await putQueued({ ...item, status: "PENDING", error: undefined });
  await useOfflineStore.getState().refreshCounts();
}

export function clearOfflineCaches() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
  } catch {
    // no service worker — nothing to clear
  }
}
