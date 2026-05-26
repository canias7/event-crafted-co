// Direct PDF generation for invoice templates via jsPDF + autotable.
// Each style maps to a distinct professional document treatment —
// quiet, restrained, real business stationery (no loud color bars).
//
//   editorial   classic serif letterhead with a single dark rule
//   bold        centered "letterhead" with a thick + thin double rule
//   minimal     hairline rules only, no chrome
//   colorblock  neutral two-column sidebar layout
//   modern      sans-serif with a single tick of accent under the name
//
// Lazy-loaded by the template picker — jsPDF stays out of the
// initial bundle until the vendor actually clicks "Save as PDF".

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { InvoiceStyle, InvoiceTemplate } from "@/data/vendorapayTemplates";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 56;

const TEXT: [number, number, number] = [26, 20, 16];
const MUTED: [number, number, number] = [107, 98, 89];
const RULE: [number, number, number] = [232, 227, 221];
const ACCENT_COOL: [number, number, number] = [30, 40, 64];

function money(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

interface Computed {
  subtotal: number;
  tax: number;
  total: number;
}

function compute(t: InvoiceTemplate): Computed {
  const subtotal = t.lineItems.reduce((s, it) => s + it.qty * it.price, 0);
  const tax = (subtotal * t.taxPct) / 100;
  return { subtotal, tax, total: subtotal + tax };
}

// ----- 1. Classic ----------------------------------------------------

function drawClassic(doc: jsPDF, t: InvoiceTemplate, c: Computed) {
  doc.setFont("times", "normal").setFontSize(22).setTextColor(...TEXT);
  doc.text("[Your Business Name]", MARGIN, 80);

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  doc.text(t.category, MARGIN, 96);

  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text("INVOICE", PAGE_W - MARGIN, 78, { align: "right" });
  doc.setFont("times", "italic").setFontSize(22).setTextColor(...TEXT);
  doc.text("VND-0001", PAGE_W - MARGIN, 102, { align: "right" });

  doc.setDrawColor(...TEXT).setLineWidth(0.8);
  doc.line(MARGIN, 124, PAGE_W - MARGIN, 124);

  drawMetaRow(doc, 154);
  drawItemsTable(doc, t, 210, { headBold: false, amountSerif: true });
  drawTotals(doc, t, c, { variant: "serif" });
  drawNotes(doc, t);
  drawFooter(doc);
}

// ----- 2. Letterhead -------------------------------------------------

function drawLetterhead(doc: jsPDF, t: InvoiceTemplate, c: Computed) {
  doc.setFont("helvetica", "bold").setFontSize(26).setTextColor(...TEXT);
  doc.text("[Your Business Name]", PAGE_W / 2, 84, { align: "center" });

  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  // Letter-spaced category line
  doc.text(t.category.toUpperCase().split("").join(" "), PAGE_W / 2, 102, { align: "center" });

  // Double rule
  doc.setDrawColor(...TEXT).setLineWidth(1.5);
  doc.line(MARGIN, 120, PAGE_W - MARGIN, 120);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 124, PAGE_W - MARGIN, 124);

  // Two-up: invoice number left, amount due right
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text("INVOICE", MARGIN, 150);
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...TEXT);
  doc.text("VND-0001", MARGIN, 170);

  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text("AMOUNT DUE", PAGE_W - MARGIN, 150, { align: "right" });
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...TEXT);
  doc.text(money(c.total), PAGE_W - MARGIN, 172, { align: "right" });

  drawMetaRow(doc, 210);
  drawItemsTable(doc, t, 266, { headBold: true, amountSerif: false });
  drawTotals(doc, t, c, { variant: "bold" });
  drawNotes(doc, t);
  drawFooter(doc);
}

// ----- 3. Minimal ----------------------------------------------------

function drawMinimal(doc: jsPDF, t: InvoiceTemplate, c: Computed) {
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text("INVOICE · VND-0001", MARGIN, 70);
  doc.text(t.category.toUpperCase(), PAGE_W - MARGIN, 70, { align: "right" });

  doc.setDrawColor(...RULE).setLineWidth(0.5);
  doc.line(MARGIN, 84, PAGE_W - MARGIN, 84);

  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...TEXT);
  doc.text("[Your Business Name]", MARGIN, 118);

  drawMetaRow(doc, 160);
  drawItemsTable(doc, t, 216, { headBold: false, amountSerif: false });
  drawTotals(doc, t, c, { variant: "plain" });
  drawNotes(doc, t);
  drawFooter(doc);
}

// ----- 4. Sidebar (neutral two-column) -------------------------------

function drawSidebar(doc: jsPDF, t: InvoiceTemplate, c: Computed) {
  const SIDE_W = 196;

  // Soft neutral sidebar fill
  doc.setFillColor(246, 242, 237);
  doc.rect(0, 0, SIDE_W, PAGE_H, "F");

  // Sidebar content
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text("INVOICE", 32, 64);
  doc.setFont("times", "italic").setFontSize(18).setTextColor(...TEXT);
  doc.text("VND-0001", 32, 86);

  let y = 132;
  const sideLabel = (txt: string) => {
    doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...MUTED);
    doc.text(txt.toUpperCase(), 32, y);
    y += 12;
  };
  const sideValue = (txt: string) => {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...TEXT);
    doc.text(txt, 32, y);
    y += 18;
  };

  sideLabel("Bill to");
  sideValue("[Client Name]");
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  doc.text("[client@email.com]", 32, y - 6);
  y += 14;

  sideLabel("Issued");
  sideValue("[Today]");
  sideLabel("Due");
  sideValue("[Due date]");
  sideLabel("Category");
  sideValue(t.category);

  // Main column
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...TEXT);
  doc.text("[Your Business Name]", SIDE_W + 32, 92);

  drawItemsTable(doc, t, 140, {
    headBold: false,
    amountSerif: false,
    left: SIDE_W + 32,
  });
  drawTotals(doc, t, c, { variant: "bold", left: SIDE_W + 32 });
  drawNotes(doc, t, { left: SIDE_W + 32 });
  drawFooter(doc);
}

// ----- 5. Modern -----------------------------------------------------

function drawModern(doc: jsPDF, t: InvoiceTemplate, c: Computed) {
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...ACCENT_COOL);
  doc.text("[Your Business Name]", MARGIN, 80);

  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...MUTED);
  doc.text(t.category, MARGIN, 96);

  // 40pt accent tick under the name
  doc.setDrawColor(...ACCENT_COOL).setLineWidth(2);
  doc.line(MARGIN, 108, MARGIN + 40, 108);

  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...ACCENT_COOL);
  doc.text("INVOICE", PAGE_W - MARGIN, 78, { align: "right" });
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...TEXT);
  doc.text("VND-0001", PAGE_W - MARGIN, 98, { align: "right" });

  drawMetaRow(doc, 150);
  drawItemsTable(doc, t, 206, { headBold: false, amountSerif: false });
  drawTotals(doc, t, c, { variant: "accent", accent: ACCENT_COOL });
  drawNotes(doc, t);
  drawFooter(doc);
}

// ----- Shared chunks -------------------------------------------------

function drawMetaRow(doc: jsPDF, y: number) {
  const colW = (PAGE_W - 2 * MARGIN) / 3;
  const writeBlock = (label: string, value: string, sub: string | null, x: number) => {
    doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...TEXT);
    doc.text(value, x, y + 16);
    if (sub) {
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
      doc.text(sub, x, y + 30);
    }
  };
  writeBlock("Bill to", "[Client Name]", "[client@email.com]", MARGIN);
  writeBlock("Issued", "[Today]", null, MARGIN + colW);
  writeBlock("Due", "[Due date]", null, MARGIN + colW * 2);
}

interface TableOpts {
  headBold: boolean;
  amountSerif: boolean;
  left?: number;
}

function drawItemsTable(
  doc: jsPDF,
  t: InvoiceTemplate,
  startY: number,
  opts: TableOpts,
) {
  const left = opts.left ?? MARGIN;
  const right = PAGE_W - MARGIN;
  const width = right - left;

  autoTable(doc, {
    startY,
    margin: { left, right: PAGE_W - right },
    tableWidth: width,
    head: [["ITEM", "QTY", "UNIT PRICE", "AMOUNT"]],
    body: t.lineItems.map((it) => [
      it.name,
      String(it.qty),
      money(it.price),
      money(it.qty * it.price),
    ]),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 10,
      textColor: TEXT,
      cellPadding: { top: 9, right: 6, bottom: 9, left: 6 },
      lineColor: RULE,
      lineWidth: { bottom: 0.4 },
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: opts.headBold ? TEXT : MUTED,
      fontStyle: opts.headBold ? "bold" : "bold",
      fontSize: 8,
      lineColor: opts.headBold ? TEXT : MUTED,
      lineWidth: { bottom: opts.headBold ? 1.2 : 0.6 },
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 48 },
      2: { halign: "right", cellWidth: 80 },
      3: {
        halign: "right",
        cellWidth: 80,
        fontStyle: "bold",
        font: opts.amountSerif ? "times" : "helvetica",
      },
    },
  });
}

interface TotalsOpts {
  variant: "plain" | "bold" | "serif" | "accent";
  accent?: [number, number, number];
  left?: number;
}

function drawTotals(
  doc: jsPDF,
  t: InvoiceTemplate,
  c: Computed,
  opts: TotalsOpts,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTable = (doc as any).lastAutoTable?.finalY ?? 400;
  const right = PAGE_W - MARGIN;
  const rowL = right - 240;

  let y = afterTable + 20;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  doc.text("Subtotal", rowL, y);
  doc.text(money(c.subtotal), right, y, { align: "right" });
  y += 16;

  if (c.tax > 0) {
    doc.text(`Tax (${t.taxPct}%)`, rowL, y);
    doc.text(money(c.tax), right, y, { align: "right" });
    y += 16;
  }
  y += 4;

  if (opts.variant === "serif") {
    doc.setDrawColor(...TEXT).setLineWidth(0.8);
    doc.line(rowL, y, right, y);
    y += 18;
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
    doc.text("TOTAL DUE", rowL, y);
    doc.setFont("times", "normal").setFontSize(20).setTextColor(...TEXT);
    doc.text(money(c.total), right, y + 2, { align: "right" });
  } else if (opts.variant === "bold") {
    doc.setDrawColor(...TEXT).setLineWidth(1.2);
    doc.line(rowL, y, right, y);
    y += 18;
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...TEXT);
    doc.text("TOTAL DUE", rowL, y);
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...TEXT);
    doc.text(money(c.total), right, y + 1, { align: "right" });
  } else if (opts.variant === "accent") {
    const a = opts.accent ?? TEXT;
    doc.setDrawColor(...a).setLineWidth(1.5);
    doc.line(rowL, y, right, y);
    y += 18;
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...a);
    doc.text("TOTAL DUE", rowL, y);
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...a);
    doc.text(money(c.total), right, y + 1, { align: "right" });
  } else {
    // plain
    doc.setDrawColor(...RULE).setLineWidth(0.5);
    doc.line(rowL, y, right, y);
    y += 18;
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
    doc.text("TOTAL DUE", rowL, y);
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...TEXT);
    doc.text(money(c.total), right, y, { align: "right" });
  }
}

function drawNotes(doc: jsPDF, t: InvoiceTemplate, opts: { left?: number } = {}) {
  if (!t.notes) return;
  const left = opts.left ?? MARGIN;
  const right = PAGE_W - MARGIN;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTable = (doc as any).lastAutoTable?.finalY ?? 400;
  const y = afterTable + 120;

  doc.setDrawColor(...RULE).setLineWidth(0.4);
  doc.line(left, y - 14, right, y - 14);

  doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...MUTED);
  doc.text("NOTES", left, y);

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...TEXT);
  const lines = doc.splitTextToSize(t.notes, right - left);
  doc.text(lines, left, y + 14);
}

function drawFooter(doc: jsPDF) {
  const y = PAGE_H - 40;
  doc.setDrawColor(...RULE).setLineWidth(0.4);
  doc.line(MARGIN, y - 12, PAGE_W - MARGIN, y - 12);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
  doc.text("Thank you for your business.", MARGIN, y);
  doc.text("Powered by VendoraPay", PAGE_W - MARGIN, y, { align: "right" });
}

// ----- Public API ----------------------------------------------------

export function downloadInvoiceTemplatePdf(t: InvoiceTemplate) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const c = compute(t);

  const renderers: Record<InvoiceStyle, (d: jsPDF, t: InvoiceTemplate, c: Computed) => void> = {
    editorial: drawClassic,
    bold: drawLetterhead,
    minimal: drawMinimal,
    colorblock: drawSidebar,
    modern: drawModern,
  };
  renderers[t.style](doc, t, c);

  const safeName = t.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`vendorapay-${safeName}.pdf`);
}

// Long-form document (contract / proposal). Single column, body
// renders the template content with paragraph wrapping; jsPDF
// handles page breaks for multi-page output.
export function downloadDocTemplatePdf(
  t: { title: string; category: string; summary: string; content: string },
  kind: "Contract" | "Proposal",
) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const width = right - left;

  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text(`${kind.toUpperCase()} TEMPLATE  ·  ${t.category.toUpperCase()}`, left, 64);

  doc.setFont("times", "normal").setFontSize(22).setTextColor(...TEXT);
  doc.text(t.title, left, 92);

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  const summaryLines = doc.splitTextToSize(t.summary, width);
  doc.text(summaryLines, left, 112);

  doc.setDrawColor(...RULE).setLineWidth(0.5);
  doc.line(left, 132, right, 132);

  doc.setFont("courier", "normal").setFontSize(10).setTextColor(42, 36, 31);
  const bodyLines = doc.splitTextToSize(t.content, width);
  const lineHeight = 14;
  let y = 154;
  for (const line of bodyLines) {
    if (y > PAGE_H - 72) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, left, y);
    y += lineHeight;
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RULE).setLineWidth(0.4);
    doc.line(left, PAGE_H - 46, right, PAGE_H - 46);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text("Powered by VendoraPay", right, PAGE_H - 32, { align: "right" });
    doc.text(`Page ${i} of ${totalPages}`, left, PAGE_H - 32);
  }

  const safeName = t.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`vendorapay-${safeName}.pdf`);
}
