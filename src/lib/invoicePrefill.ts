import { fetchJson } from "@/lib/reports";
import type { CartItem } from "@/components/invoice/LineItemsEditor";
import type { Customer } from "@/types/party";
import type { Product } from "@/types/product";

export interface InvoicePrefill {
  customer: Customer | null;
  items: CartItem[];
  /** Set when converting an Estimate / Sale Order / Challan — sent with the new sale. */
  sourceDocumentId: number | null;
  banner: string;
}

interface DocumentDetail {
  id: number;
  docLabel: string;
  docNumber: string;
  status: string;
  customerId: number | null;
  items: {
    productId: number;
    productName: string;
    sku: string;
    unitLabel: string;
    currentStock: number;
    quantity: number;
    rate: number;
    discount: number;
    gstRate: number;
  }[];
}

interface SaleDetail {
  invoiceNumber: string;
  customerId: number | null;
  items: { productId: number; productName: string; quantity: number; rate: number; discount: number; gstRate: number }[];
}

async function findCustomer(id: number | null): Promise<Customer | null> {
  if (id == null) return null;
  const customers = await fetchJson<Customer[]>("/api/customers");
  return customers.find((c) => c.id === id) ?? null;
}

export async function loadPrefill({
  fromDocument,
  duplicate,
}: {
  fromDocument: string | null;
  duplicate: string | null;
}): Promise<InvoicePrefill> {
  if (fromDocument) {
    const doc = await fetchJson<DocumentDetail>(`/api/sales-documents/${Number(fromDocument)}`);
    if (doc.status !== "OPEN") throw new Error(`${doc.docLabel} ${doc.docNumber} is ${doc.status.toLowerCase()} and can't be converted.`);
    return {
      customer: await findCustomer(doc.customerId),
      sourceDocumentId: doc.id,
      banner: `Converting ${doc.docLabel} ${doc.docNumber} to an invoice.`,
      items: doc.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        sku: i.sku,
        unitLabel: i.unitLabel,
        availableStock: i.currentStock,
        quantity: i.quantity,
        rate: i.rate,
        discount: i.discount,
        gstRate: i.gstRate,
      })),
    };
  }

  const saleId = Number(duplicate);
  const [sale, products] = await Promise.all([
    fetchJson<SaleDetail>(`/api/sales/${saleId}`),
    fetchJson<Product[]>("/api/products"),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    customer: await findCustomer(sale.customerId),
    sourceDocumentId: null,
    banner: `Copied from invoice ${sale.invoiceNumber} (a new invoice number will be assigned).`,
    items: sale.items.map((i) => {
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
    }),
  };
}
