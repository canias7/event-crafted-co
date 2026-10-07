// Build a PDF of a signed contract: the body text, plus a signature
// block with the signer's name, timestamp, and the drawn signature
// image when one was captured. Mirrors the on-screen signed state.
// The labels Vendora adds (not the contract text) follow the page's
// language (checkout.json → sign.pdf); built on click, so it uses the
// language in effect at that moment. jsPDF's built-in fonts only draw
// Latin letters, so a Russian page gets the English labels.
import jsPDF from "jspdf";
import i18n from "@/i18n";

export interface SignedContractPdfData {
  title: string;
  body: string;
  vendor_business_name: string | null;
  signer_name: string | null;
  signed_at: string | null;
  signature_image?: string | null; // PNG data URL
}

const PAGE_W = 612;
const MARGIN = 56;
const TEXT: [number, number, number] = [26, 20, 16];
const MUTED: [number, number, number] = [107, 98, 89];

function pdfLanguage(): "en" | "es" {
  return (i18n.resolvedLanguage ?? "en").startsWith("es") ? "es" : "en";
}

function label(key: string, options?: Record<string, unknown>): string {
  return i18n.t(`sign.pdf.${key}`, { ns: "checkout", lng: pdfLanguage(), ...options });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(pdfLanguage() === "es" ? "es-US" : "en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildSignedContractPdf(c: SignedContractPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const contentW = PAGE_W - MARGIN * 2;
  let y = MARGIN + 8;

  if (c.vendor_business_name) {
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...MUTED);
    doc.text(c.vendor_business_name.toUpperCase(), MARGIN, y);
    y += 18;
  }
  doc.setFont("times", "bold").setFontSize(20).setTextColor(...TEXT);
  doc.text(c.title || label("title"), MARGIN, y);
  y += 22;
  doc.setDrawColor(232, 227, 221).line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 18;

  // Body — wrapped, with simple page breaks.
  doc.setFont("helvetica", "normal").setFontSize(10.5).setTextColor(...TEXT);
  const lines = doc.splitTextToSize(c.body || "", contentW) as string[];
  const lineH = 15;
  for (const line of lines) {
    if (y > 720) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, MARGIN, y);
    y += lineH;
  }

  // Signature block.
  if (y > 640) {
    doc.addPage();
    y = MARGIN;
  }
  y += 24;
  doc.setDrawColor(232, 227, 221).line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 22;
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text(label("signedHeading"), MARGIN, y);
  y += 8;

  if (c.signature_image && c.signature_image.startsWith("data:image")) {
    try {
      doc.addImage(c.signature_image, "PNG", MARGIN, y, 180, 54);
    } catch {
      /* ignore a bad image — fall back to the typed name below */
    }
    y += 60;
  } else {
    y += 6;
  }
  doc.setFont("times", "italic").setFontSize(18).setTextColor(...TEXT);
  doc.text(c.signer_name || "", MARGIN, y);
  y += 16;
  doc.setDrawColor(180, 174, 167).line(MARGIN, y, MARGIN + 220, y);
  y += 14;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  doc.text(`${c.signer_name ?? ""}`, MARGIN, y);
  y += 12;
  doc.text(label("signedOn", { date: fmtDate(c.signed_at) }), MARGIN, y);

  return doc;
}

function slug(s: string): string {
  const fallback = label("fileFallback");
  return (s || fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fallback;
}

export function downloadSignedContractPdf(c: SignedContractPdfData) {
  buildSignedContractPdf(c).save(`${slug(c.title)}-${label("fileSuffix")}.pdf`);
}
