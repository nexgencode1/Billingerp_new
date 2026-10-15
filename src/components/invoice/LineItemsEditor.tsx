"use client";

import { Trash2 } from "lucide-react";
import { computeInvoiceTotals } from "@/lib/gst";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/product";

export interface CartItem {
  productId: number;
  productName: string;
  sku: string;
  unitLabel: string;
  availableStock: number;
  quantity: number;
  rate: number;
  discount: number;
  gstRate: number;
}

export function cartItemFromProduct(p: Product): CartItem {
  return {
    productId: p.id,
    productName: p.name,
    sku: p.sku,
    unitLabel: p.unit.shortName || p.unit.name,
    availableStock: p.currentStock,
    quantity: 1,
    rate: p.sellingPrice,
    discount: 0,
    gstRate: p.gstRate,
  };
}

// Adds a product to the cart, or bumps its quantity if it's already there.
export function addToCart(cart: CartItem[], p: Product): CartItem[] {
  return cart.some((i) => i.productId === p.id)
    ? cart.map((i) => (i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i))
    : [...cart, cartItemFromProduct(p)];
}

// Editable line-item table shared by New Invoice and Estimate / Sale Order / Delivery Challan.
// The totals shown here are a live preview only — the backend recomputes GST on save.
export function LineItemsEditor({
  items,
  onChange,
  showStockWarning = true,
}: {
  items: CartItem[];
  onChange: (items: CartItem[]) => void;
  showStockWarning?: boolean;
}) {
  function update(productId: number, patch: Partial<CartItem>) {
    onChange(items.map((i) => (i.productId === productId ? { ...i, ...patch } : i)));
  }

  const inputClass = "h-8 rounded border border-slate-300 px-2";

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
            <th className="py-2 pr-3">Product</th>
            <th className="py-2 pr-3">Qty</th>
            <th className="py-2 pr-3">Price</th>
            <th className="py-2 pr-3">Discount</th>
            <th className="py-2 pr-3">GST %</th>
            <th className="py-2 pr-3 text-right">Total</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const computed = computeInvoiceTotals([item], false).items[0];
            const short = showStockWarning && item.quantity > item.availableStock;
            return (
              <tr key={item.productId} className="border-b border-slate-100">
                <td className="py-2 pr-3">
                  <p className="font-medium text-slate-800">{item.productName}</p>
                  <p className={`text-xs ${short ? "font-medium text-red-600" : "text-slate-400"}`}>
                    {item.sku} · Stock: {item.availableStock} {item.unitLabel}
                    {short && " — not enough stock"}
                  </p>
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => update(item.productId, { quantity: Number(e.target.value) })}
                    className={`${inputClass} w-20`}
                    aria-label={`Quantity of ${item.productName}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.rate}
                    onChange={(e) => update(item.productId, { rate: Number(e.target.value) })}
                    className={`${inputClass} w-24`}
                    aria-label={`Price of ${item.productName}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.discount}
                    onChange={(e) => update(item.productId, { discount: Number(e.target.value) })}
                    className={`${inputClass} w-20`}
                    aria-label={`Discount on ${item.productName}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={item.gstRate}
                    onChange={(e) => update(item.productId, { gstRate: Number(e.target.value) })}
                    className={`${inputClass} w-20`}
                    aria-label={`GST rate of ${item.productName}`}
                  />
                </td>
                <td className="py-2 pr-3 text-right font-medium">{formatCurrency(computed.total)}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => onChange(items.filter((i) => i.productId !== item.productId))}
                    className="text-red-500 hover:text-red-700"
                    aria-label={`Remove ${item.productName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-slate-400">
                No products added yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function TotalsSummary({
  totals,
  isInterstate,
}: {
  totals: ReturnType<typeof computeInvoiceTotals>;
  isInterstate: boolean;
}) {
  const row = (label: string, value: number, negative = false) =>
    value ? (
      <div className="flex justify-between text-slate-600">
        <span>{label}</span>
        <span>
          {negative ? "-" : ""}
          {formatCurrency(value)}
        </span>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {row("Subtotal", totals.subtotal)}
      {row("Discount", totals.discount, true)}
      {row("Taxable Amount", totals.taxableAmount)}
      {isInterstate ? (
        row("IGST", totals.igst)
      ) : (
        <>
          {row("CGST", totals.cgst)}
          {row("SGST", totals.sgst)}
        </>
      )}
      <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
        <span>Grand Total</span>
        <span>{formatCurrency(totals.grandTotal)}</span>
      </div>
    </div>
  );
}
