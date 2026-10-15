"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Button } from "@/components/common/Button";
import { exportReportsToExcel, exportReportsToPdf, printReports, type ReportDocument } from "@/lib/reportExport";

// Print + Download (Excel / PDF) for a whole report. `getDocument` is called on click so the
// export always reflects the current filters and the full (unpaginated) data.
export function ReportActions({
  getDocument,
  filename,
  disabled,
}: {
  getDocument: () => ReportDocument | ReportDocument[];
  filename: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const docs = () => {
    const d = getDocument();
    return Array.isArray(d) ? d : [d];
  };

  return (
    <div className="flex items-center gap-2 print:hidden" data-tour="report-actions">
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => printReports(docs())}>
        <Printer className="h-4 w-4" /> Print
      </Button>
      <div className="relative" ref={menuRef}>
        <Button size="sm" disabled={disabled} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Download className="h-4 w-4" /> Download <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        {open && (
          <div className="absolute right-0 top-10 z-30 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            <button
              onClick={() => {
                exportReportsToExcel(filename, docs());
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel (.xlsx)
            </button>
            <button
              onClick={() => {
                exportReportsToPdf(filename, docs());
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <FileText className="h-4 w-4 text-red-600" /> PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
