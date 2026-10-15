// Route slug ⇄ backend DocType for Estimate / Sale Order / Delivery Challan screens.
export type SalesDocKind = "estimates" | "orders" | "challans";
export type SalesDocType = "ESTIMATE" | "SALE_ORDER" | "DELIVERY_CHALLAN";

export interface SalesDocConfig {
  kind: SalesDocKind;
  docType: SalesDocType;
  title: string; // list page heading
  singular: string; // "Estimate"
  pdfTitle: string; // heading printed on the document
  numberLabel: string;
  dueDateLabel: string;
  description: string;
}

export const SALES_DOCS: Record<SalesDocKind, SalesDocConfig> = {
  estimates: {
    kind: "estimates",
    docType: "ESTIMATE",
    title: "Estimates / Quotations",
    singular: "Estimate",
    pdfTitle: "ESTIMATE / QUOTATION",
    numberLabel: "Estimate No",
    dueDateLabel: "Valid Until",
    description: "Send a price quote before the sale. Convert it to an invoice in one click when the customer agrees.",
  },
  orders: {
    kind: "orders",
    docType: "SALE_ORDER",
    title: "Sale Orders",
    singular: "Sale Order",
    pdfTitle: "SALE ORDER",
    numberLabel: "Order No",
    dueDateLabel: "Delivery By",
    description: "Record confirmed customer orders to fulfil later, then convert to an invoice on delivery.",
  },
  challans: {
    kind: "challans",
    docType: "DELIVERY_CHALLAN",
    title: "Delivery Challans",
    singular: "Delivery Challan",
    pdfTitle: "DELIVERY CHALLAN",
    numberLabel: "Challan No",
    dueDateLabel: "Expected Return / Bill By",
    description: "Send goods with a challan (no tax invoice yet). Convert it to an invoice when billing.",
  },
};

export function salesDocConfig(kind: string): SalesDocConfig | null {
  return kind in SALES_DOCS ? SALES_DOCS[kind as SalesDocKind] : null;
}

export const DOC_STATUS_TONE = { OPEN: "blue", CONVERTED: "green", CANCELLED: "red" } as const;

export interface SalesDocListRow {
  id: number;
  docNumber: string;
  docDate: string;
  dueDate: string | null;
  customer: { id: number; name: string } | null;
  grandTotal: number;
  status: "OPEN" | "CONVERTED" | "CANCELLED";
  convertedSaleId: number | null;
  convertedInvoiceNumber: string | null;
  itemCount: number;
}

export interface SalesDocDetail extends Omit<SalesDocListRow, "customer" | "itemCount"> {
  docType: SalesDocType;
  docLabel: string;
  customerId: number | null;
  customer: {
    id: number;
    name: string;
    mobile: string;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    gstin: string | null;
  } | null;
  subtotal: number;
  discount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  notes: string | null;
  createdBy: { name: string };
  items: {
    id: number;
    productId: number;
    productName: string;
    quantity: number;
    rate: number;
    discount: number;
    gstRate: number;
    total: number;
    hsnCode: string | null;
    unitLabel: string;
  }[];
}
