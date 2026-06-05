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

// Generic FAQs for city-only landing pages. Event-agnostic copy that
// works regardless of which categories the user is browsing in that
// city, so this stays decoupled from the new group taxonomy.
export const CITY_FAQS = (city: string): FaqItem[] => [
  {
    q: `How do I find vendors in ${city} on Vendora?`,
    a: `Browse the directory and filter by location, or use this page to see only vendors based in or near ${city}. Each profile shows pricing, real reviews, and direct messaging — no calls or chasing required.`,
  },
  {
    q: `Are ${city} vendors on Vendora vetted?`,
    a: `Yes. Every vendor is hand-reviewed by our editorial team for portfolio quality, references, and professional standing before being approved to list — regardless of city.`,
  },
  {
    q: `What types of events do ${city} vendors handle?`,
    a: `Weddings, milestone birthdays, holiday gatherings, baby showers, anniversaries, corporate events, and intimate dinners. Use the category filters to narrow down by what you're planning.`,
  },
  {
    q: `How early should I book vendors in ${city}?`,
    a: `Peak-season vendors (May-October weddings, December holiday events) often book 9-12 months out. For smaller gatherings or off-peak dates, 6-8 weeks is typically enough — though the most in-demand venues and photographers book earlier.`,
  },
  {
    q: `Is there a booking fee?`,
    a: `Browsing and contacting vendors is free for hosts. You pay each vendor directly through Vendora's secure messaging and proposal flow — we don't add markups to vendor pricing.`,
  },
];
