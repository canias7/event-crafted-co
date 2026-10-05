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

import i18n from "@/i18n";

export interface FaqItem {
  q: string;
  a: string;
}

export const CATEGORY_FAQS: Record<string, FaqItem[]> = {};

// Generic FAQs for city-only landing pages. Event-agnostic copy that
// works regardless of which categories the user is browsing in that
// city, so this stays decoupled from the new group taxonomy.
//
// The questions and answers live in locales/<language>/cityPages.json
// (cityFaqs.<id>.q / .a) so they read in the visitor's language. Call
// this at render time, never at module load, so a language switch
// picks up the new text. `lng` defaults to the current language.
const CITY_FAQ_IDS = ["find", "vetted", "eventTypes", "timing", "fees"] as const;

export const CITY_FAQS = (city: string, lng?: string): FaqItem[] =>
  CITY_FAQ_IDS.map((id) => ({
    q: i18n.t(`cityFaqs.${id}.q`, { ns: "cityPages", city, lng }),
    a: i18n.t(`cityFaqs.${id}.a`, { ns: "cityPages", city, lng }),
  }));
