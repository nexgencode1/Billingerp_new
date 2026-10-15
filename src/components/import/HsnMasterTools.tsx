"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ExcelImportPanel } from "@/components/import/ExcelImportPanel";
import { toast } from "@/lib/toast-store";

// HSN master import. The app ships no HSN codes or GST rates of its own — the admin imports the
// government's public list (and keeps it updated). // VERIFY: official rule
export function HsnMasterTools() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function clear() {
    setClearing(true);
    try {
      const res = await fetch("/api/hsn", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not clear the HSN list.");
        return;
      }
      toast.success(`Removed ${data.deleted} HSN codes.`);
    } finally {
      setClearing(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">HSN / SAC master (for product HSN + GST suggestions)</p>
        <p className="mt-1">
          Download the official HSN/SAC list from the GST portal (gst.gov.in) or CBIC, keep three columns — <b>Code</b>, <b>Description</b>,{" "}
          <b>GstRate</b> (rate optional) — and import it here. Format the Code column as <b>Text</b> in Excel so leading zeros
          survive. Rates change: re-import whenever the government updates them, and always verify before filing.
        </p>
      </div>
      <ExcelImportPanel
        title="Import HSN / SAC Master"
        templateFilename="hsn-master-template"
        templateColumns={["Code", "Description", "GstRate"]}
        sampleRow={{ Code: "XXXX", Description: "(copy from the official list)", GstRate: "" }}
        requiredColumns={["Code"]}
        importEndpoint="/api/hsn/import"
      />
      <div>
        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="h-4 w-4" /> Clear HSN master
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Clear the HSN master list?"
        description="All imported HSN codes will be removed (products keep the HSN codes already saved on them). Use this before importing a fresh official list."
        confirmLabel="Clear list"
        loading={clearing}
        onConfirm={clear}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
