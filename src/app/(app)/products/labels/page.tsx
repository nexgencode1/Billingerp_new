"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Printer, Trash2 } from "lucide-react";
import { Button, Select } from "@/components/common";
import { ProductSearchAdd } from "@/components/invoice/ProductSearchAdd";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/product";

interface LabelLine {
  product: Product;
  copies: number;
}

const LAYOUTS = {
  "3x8": { label: "A4 — 3 × 8 (24 per sheet)", cols: 3, heightMm: 33 },
  "4x10": { label: "A4 — 4 × 10 (40 per sheet)", cols: 4, heightMm: 26 },
  "2x7": { label: "A4 — 2 × 7 (14 per sheet, large)", cols: 2, heightMm: 38 },
} as const;
type LayoutKey = keyof typeof LAYOUTS;

// A product's barcode value: its barcode if set, else its SKU (CODE128 encodes any ASCII).
function codeFor(p: Product): string {
  return (p.barcode && p.barcode.trim()) || p.sku;
}

function BarcodeSvg({ value, height }: { value: string; height: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: "CODE128", height, width: 1.4, fontSize: 11, margin: 0, displayValue: true });
    } catch {
      // Unencodable value — leave the SVG empty rather than crash the sheet.
    }
  }, [value, height]);
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} className="max-w-full" />;
}

export default function BarcodeLabelsPage() {
  useDocumentTitle("Barcode Labels");
  const [lines, setLines] = useState<LabelLine[]>([]);
  const [layout, setLayout] = useState<LayoutKey>("3x8");
  const [showPrice, setShowPrice] = useState(true);
  const [showMrp, setShowMrp] = useState(true);

  const labels = useMemo(() => lines.flatMap((l) => Array.from({ length: l.copies }, () => l.product)), [lines]);
  const cfg = LAYOUTS[layout];

  function add(p: Product) {
    setLines((prev) =>
      prev.some((l) => l.product.id === p.id)
        ? prev.map((l) => (l.product.id === p.id ? { ...l, copies: l.copies + 1 } : l))
        : [...prev, { product: p, copies: Math.max(1, Math.min(100, Math.floor(p.currentStock) || 1)) }]
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="app-chrome flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Barcode Labels</h1>
          <p className="text-sm text-slate-500">
            Print sticker labels for your products. Products without a barcode use their SKU — scan either at billing.
          </p>
        </div>
        <Button onClick={() => window.print()} disabled={labels.length === 0}>
          <Printer className="h-4 w-4" /> Print {labels.length} labels
        </Button>
      </div>

      <div className="app-chrome grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <p className="mb-2 text-sm font-semibold text-slate-700">Products</p>
          <ProductSearchAdd onAdd={add} />
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="py-2">Product</th>
                <th className="py-2">Code</th>
                <th className="py-2">Labels</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.product.id} className="border-b border-slate-100">
                  <td className="py-2">{l.product.name}</td>
                  <td className="py-2 font-mono text-xs text-slate-500">{codeFor(l.product)}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={l.copies}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) => (x.product.id === l.product.id ? { ...x, copies: Math.max(1, Math.min(500, Number(e.target.value) || 1)) } : x))
                        )
                      }
                      className="h-8 w-20 rounded border border-slate-300 px-2"
                      aria-label={`Number of labels for ${l.product.name}`}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))} className="text-red-500 hover:text-red-700" aria-label={`Remove ${l.product.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    Add products above. Label count defaults to current stock (max 100).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">Label options</p>
          <Select label="Sheet layout" value={layout} onChange={(e) => setLayout(e.target.value as LayoutKey)}>
            {Object.entries(LAYOUTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Show selling price
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showMrp} onChange={(e) => setShowMrp(e.target.checked)} /> Show MRP
          </label>
          <p className="text-xs text-slate-500">Tip: in the print dialog choose A4, margins &quot;None&quot; or &quot;Minimum&quot;, and scale 100%.</p>
        </div>
      </div>

      {labels.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 print:border-0 print:p-0">
          <p className="app-chrome mb-3 text-sm font-semibold text-slate-700">Preview</p>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))` }}>
            {labels.map((p, i) => (
              <div
                key={`${p.id}-${i}`}
                className="flex flex-col items-center justify-center overflow-hidden border border-dashed border-slate-300 px-1 text-center print:break-inside-avoid"
                style={{ height: `${cfg.heightMm}mm` }}
              >
                <p className="w-full truncate text-[10px] font-semibold leading-tight text-slate-900">{p.name}</p>
                <BarcodeSvg value={codeFor(p)} height={cfg.heightMm > 30 ? 34 : 24} />
                <p className="text-[10px] leading-tight text-slate-800">
                  {showPrice && <span className="font-bold">{formatCurrency(p.sellingPrice)}</span>}
                  {showMrp && p.mrp ? <span className="ml-1 text-slate-500">MRP {formatCurrency(p.mrp)}</span> : null}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
