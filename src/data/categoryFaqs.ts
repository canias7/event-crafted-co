// FAQ content per category-group. Renders as a real accordion on
// group landing pages AND as FAQPage JSON-LD — Google will surface
// the Q&A directly in search results when the structured data
// validates.
//
// Keep answers ~30-80 words. Specific, useful, no AI-flavored hedging.
//
// Stage 1 of the taxonomy restructure deliberately leaves this empty
// (the wedding-specific content keyed by the old slugs got dropped).
// Stage 2 will add per-group FAQs as schema source material lands.
// Group-page slugs come from categoryTaxonomy.CATEGORY_GROUPS.

export interface FaqItem {
  q: string;
  a: string;
}

export const CATEGORY_FAQS: Record<string, FaqItem[]> = {};
