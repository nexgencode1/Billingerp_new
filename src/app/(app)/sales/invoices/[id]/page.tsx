import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { serverApiGet } from "@/lib/serverApi";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import { InvoiceViewActions } from "@/components/invoice/InvoiceViewActions";

interface SaleDetail {
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
  cancelReason?: string | null;
  customer: { name: string; mobile: string; email: string | null; address: string | null; gstin: string | null } | null;
  items: { productName: string; quantity: number; rate: number; gstRate: number; total: number }[];
}

interface BusinessProfile {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  termsText: string | null;
  upiId: string | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sale = await serverApiGet<{ invoiceNumber: string }>(`/api/sales/${id}`);
  return { title: sale ? sale.invoiceNumber : "Invoice" };
}

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sale, business] = await Promise.all([
    serverApiGet<SaleDetail>(`/api/sales/${id}`),
    serverApiGet<BusinessProfile>("/api/business"),
  ]);

  if (!sale) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="app-chrome flex items-center justify-between">
        <Link href="/sales/invoices" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Sales History
        </Link>
        <InvoiceViewActions sale={sale} business={business} />
      </div>

      <InvoiceDocument sale={sale} business={business} />
    </div>
  );
}
