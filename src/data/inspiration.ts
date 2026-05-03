import { supabase } from "@/integrations/supabase/client";
import heroBridal from "@/assets/hero/bridal.jpg";
import heroBirthday from "@/assets/hero/birthday-milestone.jpg";
import heroAnniversary from "@/assets/hero/anniversary.jpg";
import heroChristmas from "@/assets/hero/christmas.jpg";
import heroBabyShower from "@/assets/hero/babyshower.jpg";
import heroEngagement from "@/assets/hero/engagement.jpg";

export interface InspirationEntry {
  slug: string;
  title: string;
  eventType: string;
  eventTypeLabel: string;
  location: string;
  hosts: string;
  guests: number;
  date: string;
  excerpt: string;
  hero: string;
  body: string;
  vendorCredits: string[];
  isFromDb?: boolean;
}

// Bundled fallback entries — used when the DB has no published rows for a
// slug. Lets the /inspiration page render real-feeling content out of the
// box, and keeps the existing entries live until admin replaces them via
// the CMS.
export const inspirationEntries: InspirationEntry[] = [
  {
    slug: "hudson-valley-garden-wedding",
    title: "A Hudson Valley garden wedding for 120",
    eventType: "wedding",
    eventTypeLabel: "Wedding",
    location: "Hudson Valley, NY",
    hosts: "Sarah & James",
    guests: 120,
    date: "September 2026",
    excerpt:
      "A late-summer ceremony on a Hudson Valley estate, with garden-style florals, a documentary-style photographer, and a long-table dinner under string lights.",
    hero: heroBridal,
    body:
      "Sarah and James knew they wanted to be outside. They found a working-farm estate in the Hudson Valley with original stone walls and apple orchards, and built the day around the late-afternoon light.\n\nThe ceremony unfolded under an arbor of dusty rose, terracotta, and cream blooms — a garden-style installation that referenced the surrounding landscape rather than competing with it. After cocktails on the lawn, guests moved to a long-table dinner threaded through the orchard, with brass candlesticks and seasonal stoneware.\n\nA documentary-style photography team tracked the day with a deliberate restraint — no posed group shots beyond the immediate family, just the actual texture of the night. The DJ leaned soul-meets-electronic for the late hours.",
    vendorCredits: [
      "Florals — Forrest & Field",
      "Photography — Atelier 47",
      "Catering — Soirée Catering Group",
      "Music — Velvet Sound Co.",
    ],
  },
  {
    slug: "brooklyn-rooftop-40th",
    title: "A Brooklyn rooftop 40th",
    eventType: "birthday",
    eventTypeLabel: "Milestone Birthday",
    location: "Brooklyn, NY",
    hosts: "Marcus",
    guests: 60,
    date: "July 2026",
    excerpt:
      "A 40th birthday styled like a private supper club: rooftop sunset, four-course tasting menu, and a same-night highlight reel.",
    hero: heroBirthday,
    body:
      "Marcus didn't want a party so much as a long, beautiful dinner. We built around that — a rented industrial-chic rooftop in Williamsburg, sunset cocktails, then sixty guests at one long table for a four-course tasting from a private-chef team.\n\nA documentary photographer worked the room candidly through dinner; a videographer captured a same-night highlight reel that was passed around on phones before dessert.\n\nThe music plan was deliberate: ambient from cocktails through the second course, then a soul-and-disco crossover lifted the energy for dessert and dance.",
    vendorCredits: [
      "Rooftop venue — The Loft on Fifth (private-event partner)",
      "Catering — Soirée Catering Group",
      "Photography — Atelier 47",
      "DJ — Velvet Sound Co.",
    ],
  },
  {
    slug: "manhattan-anniversary-dinner",
    title: "An intimate anniversary dinner in Manhattan",
    eventType: "anniversary",
    eventTypeLabel: "Anniversary",
    location: "Manhattan, NY",
    hosts: "Elena & Marco",
    guests: 24,
    date: "October 2026",
    excerpt:
      "Twenty-fifth anniversary at a private dining room: candlelight, a tight tasting menu, and an editorial photographer for the family portrait.",
    hero: heroAnniversary,
    body:
      "Twenty-five years deserves the right room. Elena and Marco took over the private dining room of a chef's-table restaurant in Tribeca. Twenty-four guests, candlelight only, a tight five-course tasting menu paired by the chef.\n\nWe staffed an editorial photographer for the first hour to handle a multi-generation family portrait, then released them — the rest of the evening was theirs.",
    vendorCredits: [
      "Catering & venue — Restaurant partner via Vendora",
      "Photography — Luminara Photography",
      "Florals — Bloom & Petal Studio",
    ],
  },
  {
    slug: "chelsea-christmas-table",
    title: "A Chelsea Christmas family dinner",
    eventType: "holiday_dinner",
    eventTypeLabel: "Holiday Dinner",
    location: "Chelsea, NY",
    hosts: "The Chen family",
    guests: 18,
    date: "December 2026",
    excerpt:
      "Eighteen people, a single long table, a runner of cedar and white candles. Catered, served, and styled top-to-bottom so the family could host without working.",
    hero: heroChristmas,
    body:
      "The Chen family hosts Christmas dinner every year. This year they wanted to be guests at it.\n\nVendora staffed the night end-to-end: a private-chef team ran a four-course menu through the kitchen, a server pair handled service so no one had to get up, and a florist installed a long table runner of cedar greens, eucalyptus, and white candles in varying heights.\n\nA short on-site shoot at golden hour produced the family's holiday card photo for the year.",
    vendorCredits: [
      "Catering — Savor & Co. Catering",
      "Florals — Bloom & Stem Florals",
      "Photography — Atelier 47",
    ],
  },
  {
    slug: "tribeca-baby-shower",
    title: "A pastel TriBeCa baby shower",
    eventType: "baby_shower",
    eventTypeLabel: "Baby Shower",
    location: "TriBeCa, NY",
    hosts: "Maya",
    guests: 30,
    date: "May 2026",
    excerpt:
      "A daytime baby shower in a sun-drenched TriBeCa loft — pastel florals, a custom dessert table, and a soft-glam makeup team for the mother-to-be and her sisters.",
    hero: heroBabyShower,
    body:
      "Maya's sisters threw the shower in a TriBeCa loft they borrowed from a friend. Floor-to-ceiling windows, cream walls, hardwood floors — the kind of space that doesn't need much.\n\nThe team kept it editorial: pastel pink and ivory florals across the central table, a custom dessert table with a small one-tier cake and macarons, and a soft-glam makeup artist who did Maya and her two sisters before guests arrived.",
    vendorCredits: [
      "Florals — Forrest & Field",
      "Cake & desserts — Local pastry partner",
      "Makeup — Studio Étoile",
      "Photography — Luminara Photography",
    ],
  },
  {
    slug: "soho-engagement",
    title: "A SoHo loft engagement party",
    eventType: "engagement",
    eventTypeLabel: "Engagement",
    location: "SoHo, NY",
    hosts: "Anand & Maya",
    guests: 80,
    date: "March 2026",
    excerpt:
      "Cocktail-format engagement party in a SoHo loft: standing reception, signature drinks, late-night DJ set.",
    hero: heroEngagement,
    body:
      "Anand and Maya wanted the energy of a great cocktail party — eighty friends, food roaming on trays, two signature drinks named after them, and a DJ set that pivoted from dinner into late-night dancing without a forced transition.\n\nThe loft venue had its own personality, so the styling was deliberately spare — a single floral installation framed the bar, and we used the existing exposed brick and pendant lighting as the visual treatment.",
    vendorCredits: [
      "Venue — The Loft on Fifth",
      "Catering — Soirée Catering Group",
      "DJ — DJ Marco Stellare",
      "Florals — Bloom & Petal Studio",
    ],
  },
];

interface DbRow {
  slug: string;
  title: string;
  event_type: string;
  event_type_label: string | null;
  location: string | null;
  hosts: string | null;
  guests: number | null;
  date_label: string | null;
  excerpt: string | null;
  body: string | null;
  hero_url: string | null;
  vendor_credits: string[];
}

const DEFAULT_HEROES: Record<string, string> = {
  wedding: heroBridal,
  birthday: heroBirthday,
  anniversary: heroAnniversary,
  holiday_dinner: heroChristmas,
  baby_shower: heroBabyShower,
  engagement: heroEngagement,
};

function normalizeDb(r: DbRow): InspirationEntry {
  return {
    slug: r.slug,
    title: r.title,
    eventType: r.event_type,
    eventTypeLabel: r.event_type_label ?? r.event_type,
    location: r.location ?? "",
    hosts: r.hosts ?? "",
    guests: r.guests ?? 0,
    date: r.date_label ?? "",
    excerpt: r.excerpt ?? "",
    hero: r.hero_url ?? DEFAULT_HEROES[r.event_type] ?? heroBridal,
    body: r.body ?? "",
    vendorCredits: r.vendor_credits ?? [],
    isFromDb: true,
  };
}

/**
 * Returns DB-published entries first, with bundled TS entries filling in for
 * slugs not yet in the DB. Editorial team can replace any bundled entry by
 * publishing one with the same slug via /admin/inspiration.
 */
export async function fetchInspirationEntries(): Promise<InspirationEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("featured_events")
    .select(
      "slug, title, event_type, event_type_label, location, hosts, guests, date_label, excerpt, body, hero_url, vendor_credits, published_at",
    )
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });

  const dbEntries = ((data as DbRow[] | null) ?? []).map(normalizeDb);
  const dbSlugs = new Set(dbEntries.map((e) => e.slug));
  const fillIns = inspirationEntries.filter((e) => !dbSlugs.has(e.slug));
  return [...dbEntries, ...fillIns];
}

export function findInspirationBySlug(
  slug: string | undefined,
  entries: InspirationEntry[] = inspirationEntries,
) {
  if (!slug) return undefined;
  return entries.find((e) => e.slug === slug);
}
