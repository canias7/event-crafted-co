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
  /** Late fee added to this invoice after it was sent. Already
   *  baked into total_cents by the late-fee RPC; we render it as a
   *  separate line so the printed totals add up for the buyer. */
  late_fee_cents?: number;
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

  // Late fee, when present, gets its own line so the printed totals
  // add up. Without this, an invoice that's been late-fee'd shows
  // Subtotal + Tax ≠ Total and the buyer sees an unexplained gap.
  if (invoice.late_fee_cents && invoice.late_fee_cents > 0) {
    ty += 16;
    doc.setTextColor(...MUTED);
    doc.text("Late fee", labelX, ty);
    doc.setTextColor(...TEXT);
    doc.text(money(invoice.late_fee_cents, currency), valueX, ty, { align: "right" });
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

// ---- Customer statement -----------------------------------------
//
// A statement aggregates everything the vendor has billed ONE buyer:
// every invoice in the chosen window, with a running balance line at
// the bottom (billed / paid / refunded / outstanding). End-of-year /
// CPA artifact — distinct from the single-invoice receipt above.

export interface PdfStatementInvoice {
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  refunded_at?: string | null;
  status: string;
  total_cents: number;
  refunded_amount_cents?: number;
  currency: string;
}

export interface PdfStatement {
  customer_name: string | null;
  customer_email: string;
  since: Date | null;
  until: Date | null;
  invoices: PdfStatementInvoice[];
  currency: string;
}

export function buildStatementPdf(
  statement: PdfStatement,
  vendor: PdfVendor,
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const currency = statement.currency || "usd";

  // Header — vendor brand + STATEMENT eyebrow + as-of date
  doc
    .setFont("times", "normal")
    .setFontSize(22)
    .setTextColor(...TEXT);
  doc.text(vendor.business_name ?? "Vendor", MARGIN, 80);
  if (vendor.location) {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
    doc.text(vendor.location, MARGIN, 96);
  }
  if (vendor.email) {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
    doc.text(vendor.email, MARGIN, vendor.location ? 110 : 96);
  }

  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text("STATEMENT", PAGE_W - MARGIN, 78, { align: "right" });
  doc.setFont("times", "italic").setFontSize(14).setTextColor(...TEXT);
  doc.text(`As of ${formatDate(new Date().toISOString())}`, PAGE_W - MARGIN, 100, { align: "right" });

  doc.setDrawColor(...RULE).setLineWidth(0.5).line(MARGIN, 130, PAGE_W - MARGIN, 130);

  // Customer block
  let y = 156;
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text("CUSTOMER", MARGIN, y);
  if (statement.since && statement.until) {
    doc.text("PERIOD", PAGE_W - MARGIN, y, { align: "right" });
  }
  y += 14;
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...TEXT);
  doc.text(statement.customer_name ?? statement.customer_email, MARGIN, y);
  if (statement.since && statement.until) {
    doc.text(
      `${formatDate(statement.since.toISOString())} – ${formatDate(statement.until.toISOString())}`,
      PAGE_W - MARGIN,
      y,
      { align: "right" },
    );
  }
  if (statement.customer_name) {
    y += 14;
    doc.setFontSize(9).setTextColor(...MUTED);
    doc.text(statement.customer_email, MARGIN, y);
  }

  // Compute totals up front so we know what to render at the bottom.
  let billed = 0;
  let paid = 0;
  let refunded = 0;
  for (const inv of statement.invoices) {
    if (inv.status === "cancelled") continue;
    billed += inv.total_cents;
    if (inv.status === "paid" || inv.status === "refunded" || inv.status === "partial_refund") {
      paid += inv.total_cents;
    }
    if (inv.refunded_amount_cents) {
      refunded += inv.refunded_amount_cents;
    }
  }
  const outstanding = billed - paid;

  // Invoice table
  const tableStart = y + 28;
  autoTable(doc, {
    startY: tableStart,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Invoice", "Issued", "Status", "Amount", "Paid/Refunded"]],
    body: statement.invoices.map((inv) => {
      const eventDate = inv.paid_at ?? inv.refunded_at ?? null;
      const statusLabel = inv.status.replace("_", " ").toUpperCase();
      const paidRefundedCol = inv.refunded_amount_cents
        ? `-${money(inv.refunded_amount_cents, currency)}`
        : inv.paid_at
        ? money(inv.total_cents, currency)
        : "—";
      return [
        inv.invoice_number,
        formatDate(inv.issue_date),
        eventDate ? `${statusLabel}\n${formatDate(eventDate)}` : statusLabel,
        money(inv.total_cents, currency),
        paidRefundedCol,
      ];
    }),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: TEXT,
      cellPadding: { top: 6, right: 4, bottom: 6, left: 4 },
      lineColor: RULE,
      lineWidth: { bottom: 0.5 },
    },
    headStyles: {
      fontSize: 8,
      textColor: MUTED,
      fontStyle: "bold",
      cellPadding: { top: 4, right: 4, bottom: 6, left: 4 },
      lineColor: RULE,
      lineWidth: { bottom: 0.75 },
    },
    columnStyles: {
      0: { cellWidth: 90, fontStyle: "bold" },
      1: { cellWidth: 90 },
      2: { cellWidth: 110 },
      3: { cellWidth: 80, halign: "right" },
      4: { cellWidth: 110, halign: "right" },
    },
  });

  // deno-lint-ignore no-explicit-any
  const tableEndY: number = (doc as any).lastAutoTable?.finalY ?? tableStart;
  let ty = tableEndY + 16;
  const labelX = PAGE_W - MARGIN - 140;
  const valueX = PAGE_W - MARGIN;

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  doc.text("Billed", labelX, ty);
  doc.setTextColor(...TEXT);
  doc.text(money(billed, currency), valueX, ty, { align: "right" });

  ty += 16;
  doc.setTextColor(...MUTED);
  doc.text("Paid", labelX, ty);
  doc.setTextColor(...TEXT);
  doc.text(money(paid, currency), valueX, ty, { align: "right" });

  if (refunded > 0) {
    ty += 16;
    doc.setTextColor(...MUTED);
    doc.text("Refunded", labelX, ty);
    doc.setTextColor(180, 70, 30);
    doc.text(`-${money(refunded, currency)}`, valueX, ty, { align: "right" });
  }

  ty += 8;
  doc.setDrawColor(...RULE).setLineWidth(0.5).line(labelX, ty, valueX, ty);

  ty += 16;
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...TEXT);
  doc.text("Outstanding", labelX, ty);
  if (outstanding > 0) {
    doc.setTextColor(180, 70, 30);
  }
  doc.text(money(outstanding, currency), valueX, ty, { align: "right" });

  // Footer
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
  doc.text(
    "Processed via VendoraPay · VENDORAPAY appears on card statements",
    PAGE_W / 2,
    760,
    { align: "center" },
  );

  return doc;
}

export function downloadStatementPdf(
  statement: PdfStatement,
  vendor: PdfVendor,
): void {
  const doc = buildStatementPdf(statement, vendor);
  const safeName = (statement.customer_name ?? statement.customer_email)
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`statement-${safeName}-${stamp}.pdf`);
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
