import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type Cell = string | number;

export interface ReportSection {
  title: string;
  columns: string[];
  rows: Cell[][];
}

// A complete, export-ready report: what Print / Excel / PDF all render from, so the three
// outputs always match each other (and include every row, not just the visible table page).
export interface ReportDocument {
  title: string;
  subtitle?: string;
  summary: { label: string; value: Cell }[];
  sections: ReportSection[];
}

// Plain number formatting for exports — jsPDF's built-in fonts have no ₹ glyph.
export function money(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cellText(c: Cell): string {
  return typeof c === "number" ? c.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : c;
}

function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Sheet";
  let candidate = base;
  for (let i = 2; used.has(candidate); i++) candidate = `${base} ${i}`;
  used.add(candidate);
  return candidate;
}

function documentToAoa(doc: ReportDocument): Cell[][] {
  const aoa: Cell[][] = [[doc.title]];
  if (doc.subtitle) aoa.push([doc.subtitle]);
  aoa.push([]);
  if (doc.summary.length > 0) {
    aoa.push(["Summary"]);
    for (const s of doc.summary) aoa.push([s.label, s.value]);
    aoa.push([]);
  }
  for (const section of doc.sections) {
    aoa.push([section.title]);
    aoa.push(section.columns);
    for (const row of section.rows) aoa.push(row);
    aoa.push([]);
  }
  return aoa;
}

// One sheet per report document (so "download all reports" yields one workbook, one tab each).
export function exportReportsToExcel(filename: string, docs: ReportDocument[]) {
  const workbook = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const doc of docs) {
    const sheet = XLSX.utils.aoa_to_sheet(documentToAoa(doc));
    const widest = Math.max(1, ...doc.sections.map((s) => s.columns.length), 2);
    sheet["!cols"] = Array.from({ length: widest }, (_, i) => ({ wch: i === 0 ? 28 : 16 }));
    XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(doc.title, used));
  }
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

function buildPdf(docs: ReportDocument[], businessName?: string): jsPDF {
  const wide = docs.some((d) => d.sections.some((s) => s.columns.length > 6));
  const pdf = new jsPDF({ orientation: wide ? "landscape" : "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();

  docs.forEach((doc, index) => {
    if (index > 0) pdf.addPage();
    let y = 14;
    if (businessName) {
      pdf.setFontSize(9);
      pdf.setTextColor(100);
      pdf.text(businessName, 14, y);
      y += 6;
    }
    pdf.setTextColor(15);
    pdf.setFontSize(15);
    pdf.text(doc.title, 14, y);
    y += 6;
    if (doc.subtitle) {
      pdf.setFontSize(9);
      pdf.setTextColor(100);
      pdf.text(doc.subtitle, 14, y);
      y += 4;
    }
    pdf.setFontSize(8);
    pdf.setTextColor(140);
    pdf.text(`Generated ${new Date().toLocaleString("en-IN")}`, pageWidth - 14, 14, { align: "right" });

    if (doc.summary.length > 0) {
      autoTable(pdf, {
        startY: y + 2,
        body: doc.summary.map((s) => [s.label, typeof s.value === "number" ? cellText(s.value) : s.value]),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 1.8 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 60, fillColor: [248, 250, 252] }, 1: { halign: "right", cellWidth: 50 } },
        tableWidth: 110,
      });
      y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }

    for (const section of doc.sections) {
      pdf.setFontSize(11);
      pdf.setTextColor(15);
      pdf.text(section.title, 14, y);
      autoTable(pdf, {
        startY: y + 2,
        head: [section.columns],
        body: section.rows.length > 0 ? section.rows.map((r) => r.map(cellText)) : [["No records in this period."]],
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [37, 99, 235] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
  });

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(140);
    pdf.text(`Page ${i} of ${pages}`, pageWidth - 14, pdf.internal.pageSize.getHeight() - 8, { align: "right" });
  }
  return pdf;
}

export function exportReportsToPdf(filename: string, docs: ReportDocument[], businessName?: string) {
  buildPdf(docs, businessName).save(`${filename}.pdf`);
}

// Prints the full report (every row) through a hidden iframe — no popup blocker issues, and
// unlike window.print() it isn't limited to the table page currently on screen.
export function printReports(docs: ReportDocument[], businessName?: string) {
  const pdf = buildPdf(docs, businessName);
  pdf.autoPrint();
  const url = pdf.output("bloburl").toString();
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}
