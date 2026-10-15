"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { upiPayUrl } from "@/lib/share";
import { formatCurrency } from "@/lib/utils";

export async function upiQrDataUrl(vpa: string, payeeName: string, amount: number, note: string): Promise<string> {
  return QRCode.toDataURL(upiPayUrl(vpa, payeeName, amount, note), { margin: 1, width: 240, errorCorrectionLevel: "M" });
}

// Scan-to-pay QR for the amount still due. Rendered on the invoice (screen + print).
export function UpiQr({ vpa, payeeName, amount, note }: { vpa: string; payeeName: string; amount: number; note: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    upiQrDataUrl(vpa, payeeName, amount, note)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vpa, payeeName, amount, note]);

  if (!src) return null;
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 p-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, nothing to optimize */}
      <img src={src} alt={`UPI QR code to pay ${formatCurrency(amount)} to ${vpa}`} width={96} height={96} />
      <div className="text-xs text-slate-600">
        <p className="font-semibold text-slate-800">Scan &amp; pay with any UPI app</p>
        <p>{formatCurrency(amount)}</p>
        <p>UPI ID: {vpa}</p>
      </div>
    </div>
  );
}
