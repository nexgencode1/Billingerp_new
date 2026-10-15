export interface PortalSummary {
  business: { name: string; address: string | null; phone: string | null; email: string | null; gstin: string | null; upiId: string | null } | null;
  customer: { id: number; name: string; mobile: string; email: string | null; address: string | null; city: string | null; state: string | null; gstin: string | null };
  totals: { totalBilled: number; totalPaid: number; totalDue: number; openInvoices: number };
  invoices: {
    id: number;
    invoiceNumber: string;
    invoiceDate: string;
    grandTotal: number;
    paidAmount: number;
    dueAmount: number;
    paymentStatus: string;
    status: string;
  }[];
  payments: { id: number; paymentNumber: string; date: string; amount: number; method: string; invoiceNumber: string | null }[];
  creditNotes: { returnNumber: string; returnDate: string; totalAmount: number; invoiceNumber: string; refundMethod: string }[];
}

export interface PortalInvoice {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  status: string;
  customer: { name: string; mobile: string; address: string | null; gstin: string | null } | null;
  items: { productName: string; hsnCode: string | null; quantity: number; rate: number; discount: number; gstRate: number; total: number }[];
}

// Portal pages redirect to the portal login on 401 (expired session).
export async function portalFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) {
    // Full reload on purpose: drop all in-memory customer data along with the expired session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/portal/login";
    throw new Error("Session expired");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong");
  return data as T;
}

export async function portalLogout() {
  await fetch("/api/portal/logout", { method: "POST" }).catch(() => {});
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload clears customer data from memory
  window.location.href = "/portal/login";
}
