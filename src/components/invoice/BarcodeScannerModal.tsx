"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/common/Modal";

// Camera barcode / QR scanner (html5-qrcode, free & open source). Loaded lazily in the browser
// only. Calls onDetected once per distinct code, debounced so one scan doesn't add an item twice.
export function BarcodeScannerModal({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let scanner: { stop: () => Promise<void>; clear: () => void; isScanning: boolean } | null = null;
    let lastSeen = { code: "", at: 0 };

    import("html5-qrcode")
      .then(({ Html5Qrcode }) => {
        if (stopped) return;
        const instance = new Html5Qrcode("barcode-scanner-region", false);
        scanner = instance;
        return instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 140 } },
          (text) => {
            const now = Date.now();
            if (text === lastSeen.code && now - lastSeen.at < 2500) return;
            lastSeen = { code: text, at: now };
            setLastCode(text);
            onDetectedRef.current(text);
          },
          () => {}
        );
      })
      .catch((e: unknown) => {
        setError(
          e instanceof Error && /permission|notallowed/i.test(e.message)
            ? "Camera permission was denied. Allow camera access in the browser, or use a USB scanner."
            : "Could not start the camera. A USB barcode scanner also works — just scan into the search box."
        );
      });

    return () => {
      stopped = true;
      if (scanner?.isScanning) scanner.stop().then(() => scanner?.clear()).catch(() => {});
    };
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={() => {
        setError(null);
        setLastCode(null);
        onClose();
      }}
      title="Scan Barcode / QR"
    >
      <div className="flex flex-col gap-3">
        <div id="barcode-scanner-region" className="overflow-hidden rounded-md bg-slate-900" style={{ minHeight: 240 }} />
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <p className="text-sm text-slate-500">Point the camera at a product barcode. Each scan adds one item.</p>
        )}
        {lastCode && (
          <p className="text-sm">
            Last scanned: <span className="font-mono font-semibold">{lastCode}</span>
          </p>
        )}
      </div>
    </Modal>
  );
}
