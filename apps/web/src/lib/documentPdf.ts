// Build a PDF of a vendor document (contract or proposal): brand
// header + title + body text, with an optional completion block for
// the signer/acceptor when the document is finalized. Generalizes
// signedContractPdf so the Workspace "PDF" action works for both
// kinds in any state (sent, signed, accepted).
import jsPDF from "jspdf";

export interface DocumentPdfData {
  title: string;
  body: string;
  vendor_business_name: string | null;
  kindLabel: string; // "Contract" | "Proposal"
  // Present only when finalized — drives the closing block.
  completion?: {
    label: string; // e.g. "ELECTRONICALLY SIGNED" | "ACCEPTED"
    name: string | null;
    at: string | null;
    signature_image?: string | null; // PNG data URL (contracts only)
  } | null;
}

const PAGE_W = 612;
const MARGIN = 56;
const TEXT: [number, number, number] = [26, 20, 16];
const MUTED: [number, number, number] = [107, 98, 89];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildDocumentPdf(c: DocumentPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = MARGIN + 8;

  if (c.vendor_business_name) {
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...MUTED);
    doc.text(c.vendor_business_name.toUpperCase(), MARGIN, y);
    y += 18;
  }
  doc.setFont("times", "bold").setFontSize(20).setTextColor(...TEXT);
  doc.text(c.title || c.kindLabel, MARGIN, y);
  y += 14;
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
  doc.text(c.kindLabel.toUpperCase(), MARGIN, y);
  y += 14;
  doc.setDrawColor(232, 227, 221).line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 18;

  // Body — wrapped, with simple page breaks.
  doc.setFont("helvetica", "normal").setFontSize(10.5).setTextColor(...TEXT);
  const lines = doc.splitTextToSize(c.body || "", PAGE_W - MARGIN * 2) as string[];
  const lineH = 15;
  for (const line of lines) {
    if (y > 720) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, MARGIN, y);
    y += lineH;
  }

  // Completion block — only for finalized documents.
  if (c.completion) {
    if (y > 640) {
      doc.addPage();
      y = MARGIN;
    }
    y += 24;
    doc.setDrawColor(232, 227, 221).line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 22;
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
    doc.text(c.completion.label.toUpperCase(), MARGIN, y);
    y += 8;

    if (
      c.completion.signature_image &&
      c.completion.signature_image.startsWith("data:image")
    ) {
      try {
        doc.addImage(c.completion.signature_image, "PNG", MARGIN, y, 180, 54);
      } catch {
        /* ignore a bad image — fall back to the typed name below */
      }
      y += 60;
    } else {
      y += 6;
    }
    doc.setFont("times", "italic").setFontSize(18).setTextColor(...TEXT);
    doc.text(c.completion.name || "", MARGIN, y);
    y += 16;
    doc.setDrawColor(180, 174, 167).line(MARGIN, y, MARGIN + 220, y);
    y += 14;
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
    doc.text(`${c.completion.name ?? ""}`, MARGIN, y);
    y += 12;
    doc.text(`${c.completion.label} ${fmtDate(c.completion.at)}`.trim(), MARGIN, y);
  }

  return doc;
}

function slug(s: string, fallback: string): string {
  return (
    (s || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  );
}

export function downloadDocumentPdf(c: DocumentPdfData) {
  const base = slug(c.title, c.kindLabel.toLowerCase());
  const suffix = c.completion ? "-completed" : "";
  buildDocumentPdf(c).save(`${base}${suffix}.pdf`);
}
