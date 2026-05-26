// Direct PDF generation for invoice templates via jsPDF + autotable.
// Each template style maps to a distinct visual treatment so vendors
// can pick the one that matches their brand:
//
//   editorial   serif title, generous whitespace, peach accent line
//   bold        full-bleed dark header with white total on accent
//   minimal     hairline rules, no color, all-cap headings
//   colorblock  accented sidebar column carrying the bill-to + meta
//   modern      sans-serif body, blue accent bar over the totals
//
// Lazy-loaded by the template picker — keeps jsPDF out of the
// initial bundle until the vendor actually clicks "Save as PDF".

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { InvoiceStyle, InvoiceTemplate } from "@/data/vendorapayTemplates";

// Page geometry — Letter-sized in points (jsPDF default unit).
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;

interface Palette {
  bg: [number, number, number] | null;
  accent: [number, number, number];
  text: [number, number, number];
  muted: [number, number, number];
  rule: [number, number, number];
}

const PALETTES: Record<InvoiceStyle, Palette> = {
  editorial: {
    bg: null,
    accent: [196, 84, 30],
    text: [26, 20, 16],
    muted: [107, 98, 89],
    rule: [240, 238, 235],
  },
  bold: {
    bg: null,
    accent: [26, 20, 16],
    text: [26, 20, 16],
    muted: [107, 98, 89],
    rule: [216, 210, 203],
  },
  minimal: {
    bg: null,
    accent: [26, 20, 16],
    text: [26, 20, 16],
    muted: [125, 119, 110],
    rule: [216, 210, 203],
  },
  colorblock: {
    bg: null,
    accent: [180, 83, 9],
    text: [26, 20, 16],
    muted: [107, 98, 89],
    rule: [240, 238, 235],
  },
  modern: {
    bg: null,
    accent: [30, 80, 180],
    text: [20, 24, 40],
    muted: [110, 116, 130],
    rule: [225, 228, 235],
  },
};

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

// ----- Styles --------------------------------------------------------

function drawEditorial(doc: jsPDF, t: InvoiceTemplate, c: Computed) {
  const p = PALETTES.editorial;

  // Header: serif title left, INVOICE block right.
  doc.setFont("times", "normal").setFontSize(22).setTextColor(...p.text);
  doc.text("[Your Business Name]", MARGIN, 80);

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...p.muted);
  doc.text(`Template preview · ${t.category}`, MARGIN, 96);

  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...p.muted);
  doc.text("INVOICE", PAGE_W - MARGIN, 80, { align: "right" });
  doc.setFont("times", "italic").setFontSize(22).setTextColor(...p.text);
  doc.text("VND-0001", PAGE_W - MARGIN, 100, { align: "right" });

  // Accent rule
  doc.setDrawColor(...p.accent).setLineWidth(0.6);
  doc.line(MARGIN, 120, PAGE_W - MARGIN, 120);

  drawMetaBlock(doc, p, 144);
  drawItemsTable(doc, p, t, 220, { style: "editorial" });
  drawTotals(doc, p, t, c, { style: "editorial" });
  drawNotes(doc, p, t);
  drawFooter(doc, p);
}

function drawBold(doc: jsPDF, t: InvoiceTemplate, c: Computed) {
  const p = PALETTES.bold;

  // Full-width dark header band
  doc.setFillColor(...p.accent);
  doc.rect(0, 0, PAGE_W, 130, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("INVOICE", MARGIN, 50);
  doc.setFont("helvetica", "bold").setFontSize(22);
  doc.text("[Your Business Name]", MARGIN, 80);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`${t.category.toUpperCase()} · VND-0001`, MARGIN, 100);

  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text("AMOUNT DUE", PAGE_W - MARGIN, 60, { align: "right" });
  doc.setFont("helvetica", "bold").setFontSize(26);
  doc.text(money(c.total), PAGE_W - MARGIN, 88, { align: "right" });

  drawMetaBlock(doc, p, 170);
  drawItemsTable(doc, p, t, 240, { style: "bold" });
  drawTotals(doc, p, t, c, { style: "bold" });
  drawNotes(doc, p, t);
  drawFooter(doc, p);
}

function drawMinimal(doc: jsPDF, t: InvoiceTemplate, c: Computed) {
  const p = PALETTES.minimal;

  // Tiny meta strip + huge title, no logo block, no colors.
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...p.muted);
  doc.text("INVOICE  ·  VND-0001", MARGIN, 70);
  doc.text(`${t.category.toUpperCase()}`, PAGE_W - MARGIN, 70, { align: "right" });

  doc.setDrawColor(...p.rule).setLineWidth(0.4);
  doc.line(MARGIN, 80, PAGE_W - MARGIN, 80);

  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...p.text);
  doc.text("[Your Business Name]", MARGIN, 112);

  drawMetaBlock(doc, p, 150);
  drawItemsTable(doc, p, t, 220, { style: "minimal" });
  drawTotals(doc, p, t, c, { style: "minimal" });
  drawNotes(doc, p, t);
  drawFooter(doc, p);
}

function drawColorblock(doc: jsPDF, t: InvoiceTemplate, c: Computed) {
  const p = PALETTES.colorblock;
  const SIDEBAR_W = 200;

  // Left sidebar with accent fill, holding bill-to + meta
  doc.setFillColor(248, 240, 232);
  doc.rect(0, 0, SIDEBAR_W, PAGE_H, "F");

  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...p.accent);
  doc.text("INVOICE", 32, 64);
  doc.setFont("times", "italic").setFontSize(20).setTextColor(...p.text);
  doc.text("VND-0001", 32, 86);

  let y = 130;
  const sideLabel = (label: string) => {
    doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...p.muted);
    doc.text(label.toUpperCase(), 32, y);
    y += 12;
  };
  const sideValue = (val: string) => {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...p.text);
    doc.text(val, 32, y);
    y += 18;
  };

  sideLabel("Bill to");
  sideValue("[Client Name]");
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...p.muted);
  doc.text("[client@email.com]", 32, y - 6);
  y += 12;

  sideLabel("Issued");
  sideValue("[Today]");
  sideLabel("Due");
  sideValue("[Due date]");
  sideLabel("Category");
  sideValue(t.category);

  // Main column header
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...p.text);
  doc.text("[Your Business Name]", SIDEBAR_W + 32, 80);

  drawItemsTable(doc, p, t, 130, { style: "colorblock", left: SIDEBAR_W + 32 });
  drawTotals(doc, p, t, c, { style: "colorblock", left: SIDEBAR_W + 32 });
  drawNotes(doc, p, t, { left: SIDEBAR_W + 32 });
  drawFooter(doc, p);
}

function drawModern(doc: jsPDF, t: InvoiceTemplate, c: Computed) {
  const p = PALETTES.modern;

  // Thin colored bar across the top
  doc.setFillColor(...p.accent);
  doc.rect(0, 0, PAGE_W, 4, "F");

  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...p.text);
  doc.text("[Your Business Name]", MARGIN, 72);

  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...p.muted);
  doc.text(`${t.category.toUpperCase()}`, MARGIN, 88);

  // Right block
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...p.accent);
  doc.text("INVOICE", PAGE_W - MARGIN, 64, { align: "right" });
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...p.text);
  doc.text("VND-0001", PAGE_W - MARGIN, 84, { align: "right" });

  drawMetaBlock(doc, p, 130);
  drawItemsTable(doc, p, t, 200, { style: "modern" });
  drawTotals(doc, p, t, c, { style: "modern" });
  drawNotes(doc, p, t);
  drawFooter(doc, p);
}

// ----- Shared chunks -------------------------------------------------

function drawMetaBlock(doc: jsPDF, p: Palette, y: number) {
  const label = (txt: string, x: number) => {
    doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...p.muted);
    doc.text(txt.toUpperCase(), x, y);
  };
  const value = (txt: string, x: number) => {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(p.text[0], p.text[1], p.text[2]);
    doc.text(txt, x, y + 14);
  };
  label("Bill to", MARGIN);
  value("[Client Name]", MARGIN);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...p.muted);
  doc.text("[client@email.com]", MARGIN, y + 28);

  label("Issued", PAGE_W / 2 + 20);
  value("[Today]", PAGE_W / 2 + 20);

  label("Due", PAGE_W - MARGIN - 80);
  value("[Due date]", PAGE_W - MARGIN - 80);
}

interface SectionOpts {
  style: InvoiceStyle;
  left?: number;
}

function drawItemsTable(
  doc: jsPDF,
  p: Palette,
  t: InvoiceTemplate,
  startY: number,
  opts: SectionOpts,
) {
  const left = opts.left ?? MARGIN;
  const right = PAGE_W - MARGIN;
  const width = right - left;

  const headStyles: Parameters<typeof autoTable>[1] extends infer A
    ? A extends { headStyles?: infer H }
      ? H
      : never
    : never =
    opts.style === "bold"
      ? {
          fillColor: p.accent,
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
        }
      : opts.style === "minimal"
        ? {
            fillColor: [255, 255, 255],
            textColor: p.muted,
            fontSize: 7,
            fontStyle: "bold",
            lineColor: p.text,
            lineWidth: { bottom: 0.8 },
          }
        : {
            fillColor: [255, 255, 255],
            textColor: p.muted,
            fontSize: 8,
            fontStyle: "bold",
            lineColor: p.rule,
            lineWidth: { bottom: 0.5 },
          };

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
      font: opts.style === "editorial" ? "times" : "helvetica",
      fontSize: 10,
      textColor: p.text,
      cellPadding: { top: 8, right: 6, bottom: 8, left: 6 },
      lineColor: p.rule,
      lineWidth: { bottom: 0.4 },
    },
    headStyles,
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 50 },
      2: { halign: "right", cellWidth: 80 },
      3: { halign: "right", cellWidth: 80, fontStyle: "bold" },
    },
  });
}

function drawTotals(
  doc: jsPDF,
  p: Palette,
  t: InvoiceTemplate,
  c: Computed,
  opts: SectionOpts,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTable = (doc as any).lastAutoTable?.finalY ?? 400;
  const right = PAGE_W - MARGIN;
  const left = (opts.left ?? MARGIN) + (PAGE_W - (opts.left ?? MARGIN) - MARGIN - 220);

  let y = afterTable + 16;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...p.muted);
  doc.text("Subtotal", left, y);
  doc.text(money(c.subtotal), right, y, { align: "right" });
  y += 16;

  if (c.tax > 0) {
    doc.text(`Tax (${t.taxPct}%)`, left, y);
    doc.text(money(c.tax), right, y, { align: "right" });
    y += 16;
  }

  // Total Due row with style-specific emphasis
  if (opts.style === "bold" || opts.style === "modern") {
    doc.setFillColor(...p.accent);
    doc.rect(left - 8, y - 4, right - left + 16, 28, "F");
    doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(11);
    doc.text("TOTAL DUE", left, y + 14);
    doc.setFontSize(14);
    doc.text(money(c.total), right, y + 14, { align: "right" });
  } else {
    doc.setDrawColor(...p.text).setLineWidth(0.6);
    doc.line(left, y, right, y);
    y += 16;
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...p.muted);
    doc.text("TOTAL DUE", left, y);
    doc.setFont(opts.style === "editorial" ? "times" : "helvetica", "bold")
      .setFontSize(opts.style === "editorial" ? 18 : 14)
      .setTextColor(...p.text);
    doc.text(money(c.total), right, y, { align: "right" });
  }
}

function drawNotes(doc: jsPDF, p: Palette, t: InvoiceTemplate, opts: { left?: number } = {}) {
  if (!t.notes) return;
  const left = opts.left ?? MARGIN;
  const right = PAGE_W - MARGIN;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTable = (doc as any).lastAutoTable?.finalY ?? 400;
  const y = afterTable + 110;

  doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...p.muted);
  doc.text("NOTES", left, y);

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(p.text[0], p.text[1], p.text[2]);
  const lines = doc.splitTextToSize(t.notes, right - left);
  doc.text(lines, left, y + 14);
}

function drawFooter(doc: jsPDF, p: Palette) {
  const y = PAGE_H - 36;
  doc.setDrawColor(...p.rule).setLineWidth(0.4);
  doc.line(MARGIN, y - 10, PAGE_W - MARGIN, y - 10);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...p.muted);
  doc.text("Thank you for your business.", MARGIN, y);
  doc.text("Powered by VendoraPay", PAGE_W - MARGIN, y, { align: "right" });
}

// ----- Public API ----------------------------------------------------

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

  // Header
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(125, 119, 110);
  doc.text(`${kind.toUpperCase()} TEMPLATE  ·  ${t.category.toUpperCase()}`, left, 64);

  doc.setFont("times", "normal").setFontSize(22).setTextColor(26, 20, 16);
  doc.text(t.title, left, 92);

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(107, 98, 89);
  const summaryLines = doc.splitTextToSize(t.summary, width);
  doc.text(summaryLines, left, 112);

  doc.setDrawColor(216, 210, 203).setLineWidth(0.5);
  doc.line(left, 132, right, 132);

  // Body — use a monospaced-ish layout so headings/bullets stay aligned.
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

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(240, 238, 235).setLineWidth(0.4);
    doc.line(left, PAGE_H - 46, right, PAGE_H - 46);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(107, 98, 89);
    doc.text("Powered by VendoraPay", right, PAGE_H - 32, { align: "right" });
    doc.text(`Page ${i} of ${totalPages}`, left, PAGE_H - 32);
  }

  const safeName = t.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`vendorapay-${safeName}.pdf`);
}

export function downloadInvoiceTemplatePdf(t: InvoiceTemplate) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const c = compute(t);

  switch (t.style) {
    case "editorial":
      drawEditorial(doc, t, c);
      break;
    case "bold":
      drawBold(doc, t, c);
      break;
    case "minimal":
      drawMinimal(doc, t, c);
      break;
    case "colorblock":
      drawColorblock(doc, t, c);
      break;
    case "modern":
      drawModern(doc, t, c);
      break;
  }

  const safeName = t.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`vendorapay-${safeName}.pdf`);
}
