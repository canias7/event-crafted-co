// Hierarchical vendor taxonomy. 8 top-level groups with 31
// sub-categories underneath. The DB column `vendor_profiles.category`
// stores the SUB name; the parent group is derived via GROUP_OF_SUB.
//
// Browsing happens at the group level (/vendors/category/{group-slug});
// sub-categories filter inside the group page. Schemas in
// categoryAttributes.ts are keyed by group name — every sub in the
// same group renders the same structured-fields editor + display.

export interface CategoryGroup {
  /** Display name + key used to look up schemas. */
  name: string;
  /** URL slug — `/vendors/category/{slug}` */
  slug: string;
  description: string;
  longCopy: string;
  subs: string[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    name: "Venues",
    slug: "venues",
    description:
      "Event venues, outdoor spaces, private dining rooms, and corporate / conference settings.",
    longCopy:
      "The space sets the tone before guests arrive. Vendora venues range from architectural lofts and historic estates to outdoor gardens, restaurant private rooms, and corporate / conference spaces — each chosen for personality and operational reliability.",
    subs: [
      "Event Venues",
      "Outdoor Spaces",
      "Private Dining Spaces",
      "Corporate / Conference Spaces",
    ],
  },
  {
    name: "Food & Beverage",
    slug: "food-beverage",
    description:
      "Catering, mobile bars, dessert programs, and food trucks for events of any size.",
    longCopy:
      "From plated tasting menus to family-style feasts, mobile bars to dessert tables — the food and drink layer of an event done by teams that take it seriously.",
    subs: [
      "Catering",
      "Bartending / Mobile Bars",
      "Desserts & Cakes",
      "Food Trucks / Specialty",
    ],
  },
  {
    name: "Entertainment",
    slug: "entertainment",
    description: "DJs, live music, performers, and hosts who run the room.",
    longCopy:
      "Music and performance set the energy. Vendora entertainment runs the full arc — ceremony to last call — with curated DJs, live bands and ensembles, performers, and hosts / MCs who keep events on time and engaged.",
    subs: ["DJs", "Live Music", "Performers", "Hosts / MCs"],
  },
  {
    name: "Media",
    slug: "media",
    description:
      "Photography, videography, and photo booths — the people who document the night.",
    longCopy:
      "From editorial documentary photography to cinematic event films and open-air photo booths, the Media category covers everyone with a camera. Pair coverage types for full-event documentation.",
    subs: ["Photography", "Videography", "Photo Booths"],
  },
  {
    name: "Design & Decor",
    slug: "design-decor",
    description:
      "Coordinators, florists, beauty teams, decor rentals, and grooming services.",
    longCopy:
      "The visual and production layer — planners and day-of coordinators, florists, decor rentals, hair + makeup, and grooming. The teams who turn a room into a setting.",
    subs: [
      "Event Coordinators",
      "Florists",
      "Beauty",
      "Decor Rentals",
      "Grooming Services",
    ],
  },
  {
    name: "Rentals",
    slug: "rentals",
    description:
      "Furniture, tents, lighting & AV, dance floors & staging, and transportation.",
    longCopy:
      "Event-day infrastructure — furniture, tenting, lighting and AV, dance floors and staging, and guest transportation. Coordinated with your planner so deliveries hit the right windows.",
    subs: [
      "Furniture Rentals",
      "Tents & Outdoor",
      "Lighting & AV Equipment",
      "Dance Floors & Staging",
      "Transportation",
    ],
  },
  {
    name: "Experiences",
    slug: "experiences",
    description:
      "Tastings, cigar rollers, coffee carts, and other specialty experiences.",
    longCopy:
      "The memorable extras — wine and whiskey tastings, cigar rollers, coffee carts, and specialty services that turn a dinner into a story.",
    subs: ["Tastings", "Specialty Services"],
  },
  {
    name: "Corporate Services",
    slug: "corporate-services",
    description:
      "Staffing, speakers / hosts, security, and valet for corporate and large events.",
    longCopy:
      "B2B essentials — service staff, professional speakers and hosts, licensed security, and valet for events that need controlled entry, scheduled programs, or large-scale logistics.",
    subs: ["Staffing", "Speakers / Hosts", "Security", "Valet"],
  },
];

export const ALL_SUBS: string[] = CATEGORY_GROUPS.flatMap((g) => g.subs);

/** Sub-category name → parent group name. */
export const GROUP_OF_SUB: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const g of CATEGORY_GROUPS) {
    for (const sub of g.subs) map[sub] = g.name;
  }
  return map;
})();

export function groupOfSub(sub: string): string | null {
  return GROUP_OF_SUB[sub] ?? null;
}

export function findGroup(slug: string): CategoryGroup | null {
  return CATEGORY_GROUPS.find((g) => g.slug === slug) ?? null;
}

export function findGroupByName(name: string): CategoryGroup | null {
  return CATEGORY_GROUPS.find((g) => g.name === name) ?? null;
}
