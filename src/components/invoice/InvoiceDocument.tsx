import { formatCurrency, formatDate } from "@/lib/utils";
import { amountInWords } from "@/lib/gst";
import { Badge } from "@/components/common/Badge";
import { UpiQr } from "@/components/invoice/UpiQr";

interface InvoiceDocumentProps {
  sale: {
    invoiceNumber: string;
    invoiceDate: string | Date;
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
    customer: { name: string; mobile: string; address: string | null; gstin: string | null } | null;
    items: { productName: string; quantity: number; rate: number; gstRate: number; total: number }[];
  };
  business: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    termsText: string | null;
    upiId?: string | null;
  } | null;
}

export function InvoiceDocument({ sale, business }: InvoiceDocumentProps) {
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8">
      <div className="text-center">
        <h1 className="text-xl font-bold text-slate-900">{business?.name ?? "Business"}</h1>
        {business?.address && <p className="text-sm text-slate-500">{business.address}</p>}
        <p className="text-sm text-slate-500">
          {[business?.phone, business?.email].filter(Boolean).join(" · ")}
        </p>
        {business?.gstin && <p className="text-sm text-slate-500">GSTIN: {business.gstin}</p>}
      </div>

      <div className="my-4 border-t border-slate-200" />

      <div className="flex items-start justify-between text-sm">
        <div>
          <p className="font-semibold text-slate-700">Bill To:</p>
          {sale.customer ? (
            <>
              <p>{sale.customer.name}</p>
              <p>{sale.customer.mobile}</p>
              {sale.customer.address && <p>{sale.customer.address}</p>}
              {sale.customer.gstin && <p>GSTIN: {sale.customer.gstin}</p>}
            </>
          ) : (
            <p>Walk-in Customer</p>
          )}
        </div>
        <div className="text-right">
          <p>
            <span className="font-semibold">Invoice No:</span> {sale.invoiceNumber}
          </p>
          <p>
            <span className="font-semibold">Date:</span> {formatDate(sale.invoiceDate)}
          </p>
          {sale.status === "CANCELLED" && (
            <Badge tone="red" className="mt-1">
              CANCELLED
            </Badge>
          )}
        </div>
      </div>

      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs font-semibold uppercase text-slate-500">
            <th className="py-2">Item</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Rate</th>
            <th className="py-2 text-right">GST %</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              <td className="py-2">{item.productName}</td>
              <td className="py-2 text-right">{item.quantity}</td>
              <td className="py-2 text-right">{formatCurrency(item.rate)}</td>
              <td className="py-2 text-right">{item.gstRate}%</td>
              <td className="py-2 text-right">{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500">Subtotal</span>
            <span>{formatCurrency(sale.subtotal)}</span>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">Discount</span>
              <span>-{formatCurrency(sale.discount)}</span>
            </div>
          )}
          {sale.cgst > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">CGST</span>
              <span>{formatCurrency(sale.cgst)}</span>
            </div>
          )}
          {sale.sgst > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">SGST</span>
              <span>{formatCurrency(sale.sgst)}</span>
            </div>
          )}
          {sale.igst > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">IGST</span>
              <span>{formatCurrency(sale.igst)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-slate-300 pt-1 text-base font-bold">
            <span>Grand Total</span>
            <span>{formatCurrency(sale.grandTotal)}</span>
          </div>
          <div className="flex justify-between py-0.5 text-slate-500">
            <span>Paid ({sale.paymentMethod})</span>
            <span>{formatCurrency(sale.paidAmount)}</span>
          </div>
          <div className="flex justify-between py-0.5 font-medium">
            <span>Due</span>
            <span>{formatCurrency(sale.dueAmount)}</span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm italic text-slate-500">Amount in Words: {amountInWords(sale.grandTotal)}</p>

      <p className="mt-3 text-sm font-semibold">
        Payment Status: <Badge tone={sale.paymentStatus === "PAID" ? "green" : sale.paymentStatus === "PARTIAL" ? "yellow" : "red"}>{sale.paymentStatus}</Badge>
      </p>

      {business?.upiId && sale.status !== "CANCELLED" && sale.dueAmount > 0 && (
        <div className="mt-4" data-tour="invoice-upi-qr">
          <UpiQr vpa={business.upiId} payeeName={business.name} amount={sale.dueAmount} note={`Invoice ${sale.invoiceNumber}`} />
        </div>
      )}

      {sale.status === "CANCELLED" && sale.cancelReason && (
        <p className="mt-2 text-sm text-red-600">Cancellation Reason: {sale.cancelReason}</p>
      )}

      {business?.termsText && (
        <div className="mt-6 border-t border-slate-200 pt-3 text-xs text-slate-500">
          <p className="font-semibold">Terms & Conditions</p>
          <p>{business.termsText}</p>
        </div>
      )}

      <div className="mt-10 flex justify-end">
        <p className="text-sm text-slate-500">Authorized Signature</p>
      </div>
    </div>
  );
}
