// Starter templates for VendoraPay's Files surface. These are
// hand-written first drafts that vendors can pick to skip the
// blank-page problem; eventually an AI builder will generate them
// from a short prompt. Until then, picking a template prefills the
// invoice composer (Invoices) or opens a preview that the vendor
// can copy from (Contracts, Proposals).

import i18n from "@/i18n";

// All template text (titles, categories, summaries, notes, line items
// and the contract/proposal bodies) lives in
// locales/<lang>/vendorPayments.json → templates. The fields below are
// getters, so they read the active language whenever they're used —
// nothing is frozen at module load. Ids, styles and numbers stay here.
function templateText(key: string): string {
  return i18n.t(`templates.${key}`, { ns: "vendorPayments" });
}

/**
 * Visual style for the invoice. Each template ships with a distinct
 * design so vendors can pick the one that matches their brand.
 *
 * - editorial  — serif title, generous whitespace, warm peach accent
 * - bold       — full-bleed dark header with the total inverted on it
 * - minimal    — hairline rules, no color, all-cap headings
 * - colorblock — accented sidebar column with the bill-to + meta block
 * - modern     — sans-serif, monoline typography, blue accent bar
 */
export type InvoiceStyle =
  | "editorial"
  | "bold"
  | "minimal"
  | "colorblock"
  | "modern";

export interface InvoiceTemplate {
  id: string;
  title: string;
  category: string;
  summary: string;
  style: InvoiceStyle;
  /** Suggested tax percentage to prefill (e.g. 7.25 for 7.25%). */
  taxPct: number;
  /** Notes / scope summary shown above the payment terms block. */
  notes: string;
  /**
   * Subject / project line shown between the meta block and the
   * line-item table — gives the invoice context at a glance
   * ("[Couple Names] Wedding", "Annual Gala 2026", etc).
   */
  projectTitle: string;
  /**
   * Payment schedule, accepted methods, and late-fee policy.
   * Surfaced as a dedicated block under the totals so it reads
   * as policy rather than a freeform note.
   */
  paymentTerms: string;
  lineItems: Array<{
    name: string;
    /** Short subtext that gives the line item more context. */
    description?: string;
    qty: number;
    /** Unit price in dollars (not cents) — converted by the composer. */
    price: number;
  }>;
}

export interface DocTemplate {
  id: string;
  title: string;
  category: string;
  summary: string;
  /** Markdown-style plain text; rendered as monospace pre in preview. */
  content: string;
}

// -- Invoices --------------------------------------------------------
//
// One blank starter template instead of a gallery of preset
// services. The vendor picks this, gets a clean professionally-
// formatted shell with Bill From / Bill To / Project / Items /
// Notes / Payment Terms, and fills in the real details themselves.
// Per-service starter content (photography, catering, etc) becomes
// the job of the AI builder when it lands.

function invoiceTemplate(def: {
  id: string;
  style: InvoiceStyle;
  taxPct: number;
  lineItems: Array<{ qty: number; price: number }>;
}): InvoiceTemplate {
  const base = `invoice.${def.id.replace(/-/g, "_")}`;
  return {
    id: def.id,
    style: def.style,
    taxPct: def.taxPct,
    get title() {
      return templateText(`${base}.title`);
    },
    get category() {
      return templateText(`${base}.category`);
    },
    get summary() {
      return templateText(`${base}.summary`);
    },
    get projectTitle() {
      return templateText(`${base}.project_title`);
    },
    get notes() {
      return templateText(`${base}.notes`);
    },
    get paymentTerms() {
      return templateText(`${base}.payment_terms`);
    },
    lineItems: def.lineItems.map((item, i) => ({
      qty: item.qty,
      price: item.price,
      get name() {
        return templateText(`${base}.line_items.item${i + 1}.name`);
      },
      get description() {
        return templateText(`${base}.line_items.item${i + 1}.description`);
      },
    })),
  };
}

function docTemplate(kind: "contract" | "proposal", id: string): DocTemplate {
  const base = `${kind}.${id.replace(/-/g, "_")}`;
  return {
    id,
    get title() {
      return templateText(`${base}.title`);
    },
    get category() {
      return templateText(`${base}.category`);
    },
    get summary() {
      return templateText(`${base}.summary`);
    },
    get content() {
      return templateText(`${base}.content`);
    },
  };
}

export const INVOICE_TEMPLATES: InvoiceTemplate[] = [
  invoiceTemplate({
    id: "blank-invoice",
    style: "modern",
    taxPct: 0,
    lineItems: [
      { qty: 1, price: 0 },
      { qty: 1, price: 0 },
      { qty: 1, price: 0 },
    ],
  }),
];

// -- Contracts -------------------------------------------------------
//
// Standard service agreement, wedding photography, venue rental,
// catering service and a cancellation & refund policy.

export const CONTRACT_TEMPLATES: DocTemplate[] = [
  "standard-service",
  "wedding-photography",
  "venue-rental",
  "catering-service",
  "cancellation-policy",
].map((id) => docTemplate("contract", id));

// -- Proposals -------------------------------------------------------
//
// Full wedding production, corporate event coverage, birthday
// celebration, DJ + photography bundle and a catering tasting.

export const PROPOSAL_TEMPLATES: DocTemplate[] = [
  "full-wedding",
  "corporate-event",
  "birthday-party",
  "dj-photo-bundle",
  "catering-tasting",
].map((id) => docTemplate("proposal", id));
