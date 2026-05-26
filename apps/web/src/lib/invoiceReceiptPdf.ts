// Generate a PDF for a real (DB-row) Invoice + vendor brand. Distinct
// from src/lib/invoicePdf.ts which renders the TEMPLATE-builder preview
// — that one takes an InvoiceTemplate shape and exists to power the
// pre-send editor. This one takes the actual `Invoice` row plus the
// vendor's business name and renders the document the buyer + vendor
// keep for their records.
//
// One tasteful layout (editorial serif header, hairline rules, neutral
// muted muted muted) — not five variants — because by the time an
// invoice is paid the styling choice is already committed.
//
// Lazy-imported by the caller so jsPDF doesn't sit in the initial bundle.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PdfInvoiceLineItem {
  name: string;
  qty: number;
  unit_price_cents: number;
  total_cents?: number;
}

export interface PdfInvoice {
  invoice_number: string;
  bill_to_name: string | null;
  bill_to_email: string | null;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  line_items: PdfInvoiceLineItem[];
  subtotal_cents: number;
  tax_rate_bps: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  refunded_amount_cents?: number;
}

export interface PdfVendor {
  business_name: string | null;
  location: string | null;
  email: string | null;
}

const PAGE_W = 612;
const MARGIN = 56;
const TEXT: [number, number, number] = [26, 20, 16];
const MUTED: [number, number, number] = [107, 98, 89];
const RULE: [number, number, number] = [232, 227, 221];

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function buildInvoicePdf(invoice: PdfInvoice, vendor: PdfVendor): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const currency = invoice.currency || "usd";

  // ---- Header: vendor brand + INVOICE eyebrow ---------------------
  doc
    .setFont("times", "normal")
    .setFontSize(22)
    .setTextColor(...TEXT);
  doc.text(vendor.business_name ?? "Vendor", MARGIN, 80);

  if (vendor.location) {
    doc
      .setFont("helvetica", "normal")
      .setFontSize(9)
      .setTextColor(...MUTED);
    doc.text(vendor.location, MARGIN, 96);
  }
  if (vendor.email) {
    doc
      .setFont("helvetica", "normal")
      .setFontSize(9)
      .setTextColor(...MUTED);
    doc.text(vendor.email, MARGIN, vendor.location ? 110 : 96);
  }

  doc
    .setFont("helvetica", "bold")
    .setFontSize(8)
    .setTextColor(...MUTED);
  doc.text("INVOICE", PAGE_W - MARGIN, 78, { align: "right" });
  doc
    .setFont("times", "italic")
    .setFontSize(20)
    .setTextColor(...TEXT);
  doc.text(invoice.invoice_number, PAGE_W - MARGIN, 100, { align: "right" });

  // Paid / refunded status pill
  const statusUpper = invoice.status.toUpperCase().replace("_", " ");
  if (invoice.status === "paid") {
    doc
      .setFont("helvetica", "bold")
      .setFontSize(8)
      .setTextColor(10, 124, 74);
    doc.text(`✓ ${statusUpper}`, PAGE_W - MARGIN, 116, { align: "right" });
  } else if (invoice.status === "refunded" || invoice.status === "partial_refund") {
    doc
      .setFont("helvetica", "bold")
      .setFontSize(8)
      .setTextColor(180, 70, 30);
    doc.text(statusUpper, PAGE_W - MARGIN, 116, { align: "right" });
  }

  // Single rule under the header
  doc
    .setDrawColor(...RULE)
    .setLineWidth(0.5)
    .line(MARGIN, 130, PAGE_W - MARGIN, 130);

  // ---- Bill-to + dates -------------------------------------------
  let y = 156;
  doc
    .setFont("helvetica", "bold")
    .setFontSize(8)
    .setTextColor(...MUTED);
  doc.text("BILL TO", MARGIN, y);
  doc.text("ISSUED", PAGE_W - MARGIN - 140, y);
  if (invoice.due_date) {
    doc.text("DUE", PAGE_W - MARGIN, y, { align: "right" });
  } else if (invoice.paid_at) {
    doc.text("PAID", PAGE_W - MARGIN, y, { align: "right" });
  }

  y += 14;
  doc
    .setFont("helvetica", "normal")
    .setFontSize(11)
    .setTextColor(...TEXT);
  doc.text(invoice.bill_to_name ?? "—", MARGIN, y);
  doc.text(formatDate(invoice.issue_date), PAGE_W - MARGIN - 140, y);
  if (invoice.due_date) {
    doc.text(formatDate(invoice.due_date), PAGE_W - MARGIN, y, {
      align: "right",
    });
  } else if (invoice.paid_at) {
    doc.text(formatDate(invoice.paid_at), PAGE_W - MARGIN, y, {
      align: "right",
    });
  }

  if (invoice.bill_to_email) {
    y += 14;
    doc
      .setFontSize(9)
      .setTextColor(...MUTED);
    doc.text(invoice.bill_to_email, MARGIN, y);
  }

  // ---- Line items table -------------------------------------------
  const tableStart = y + 28;
  autoTable(doc, {
    startY: tableStart,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Item", "Qty", "Unit", "Amount"]],
    body: invoice.line_items.map((li) => [
      li.name,
      String(li.qty),
      money(li.unit_price_cents, currency),
      money(li.total_cents ?? li.qty * li.unit_price_cents, currency),
    ]),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 10,
      textColor: TEXT,
      cellPadding: { top: 8, right: 4, bottom: 8, left: 4 },
      lineColor: RULE,
      lineWidth: { bottom: 0.5 },
    },
    headStyles: {
      fontSize: 8,
      textColor: MUTED,
      fontStyle: "bold",
      cellPadding: { top: 4, right: 4, bottom: 8, left: 4 },
      lineColor: RULE,
      lineWidth: { bottom: 0.75 },
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 40, halign: "right" },
      2: { cellWidth: 80, halign: "right" },
      3: { cellWidth: 90, halign: "right", fontStyle: "bold" },
    },
  });

  // ---- Totals (right-aligned) -------------------------------------
  // deno-lint-ignore no-explicit-any
  const tableEndY: number = (doc as any).lastAutoTable?.finalY ?? tableStart;
  let ty = tableEndY + 16;
  const labelX = PAGE_W - MARGIN - 100;
  const valueX = PAGE_W - MARGIN;

  doc
    .setFont("helvetica", "normal")
    .setFontSize(10)
    .setTextColor(...MUTED);
  doc.text("Subtotal", labelX, ty);
  doc.setTextColor(...TEXT);
  doc.text(money(invoice.subtotal_cents, currency), valueX, ty, { align: "right" });

  if (invoice.tax_cents > 0) {
    ty += 16;
    doc.setTextColor(...MUTED);
    doc.text(`Tax (${(invoice.tax_rate_bps / 100).toFixed(2)}%)`, labelX, ty);
    doc.setTextColor(...TEXT);
    doc.text(money(invoice.tax_cents, currency), valueX, ty, { align: "right" });
  }

  // Rule above total
  ty += 8;
  doc
    .setDrawColor(...RULE)
    .setLineWidth(0.5)
    .line(labelX, ty, valueX, ty);

  ty += 16;
  doc
    .setFont("helvetica", "bold")
    .setFontSize(11)
    .setTextColor(...TEXT);
  doc.text("Total", labelX, ty);
  doc.text(money(invoice.total_cents, currency), valueX, ty, { align: "right" });

  // Refund line if applicable
  if (
    (invoice.status === "refunded" || invoice.status === "partial_refund") &&
    invoice.refunded_amount_cents &&
    invoice.refunded_amount_cents > 0
  ) {
    ty += 18;
    doc
      .setFont("helvetica", "normal")
      .setFontSize(10)
      .setTextColor(180, 70, 30);
    doc.text("Refunded", labelX, ty);
    doc.text(`-${money(invoice.refunded_amount_cents, currency)}`, valueX, ty, {
      align: "right",
    });
  }

  // ---- Notes -----------------------------------------------------
  if (invoice.notes) {
    ty += 36;
    doc
      .setFont("helvetica", "bold")
      .setFontSize(8)
      .setTextColor(...MUTED);
    doc.text("NOTES", MARGIN, ty);
    ty += 14;
    doc
      .setFont("helvetica", "normal")
      .setFontSize(10)
      .setTextColor(...TEXT);
    const wrapped = doc.splitTextToSize(invoice.notes, PAGE_W - MARGIN * 2);
    doc.text(wrapped, MARGIN, ty);
    ty += wrapped.length * 14;
  }

  // ---- Footer ----------------------------------------------------
  doc
    .setFont("helvetica", "normal")
    .setFontSize(8)
    .setTextColor(...MUTED);
  doc.text(
    "Processed via VendoraPay · VENDORAPAY appears on card statements",
    PAGE_W / 2,
    760,
    { align: "center" },
  );

  return doc;
}

// Convenience: download the generated PDF in the browser.
export function downloadInvoicePdf(
  invoice: PdfInvoice,
  vendor: PdfVendor,
): void {
  const doc = buildInvoicePdf(invoice, vendor);
  const filename = `${invoice.invoice_number || "invoice"}.pdf`;
  doc.save(filename);
}
