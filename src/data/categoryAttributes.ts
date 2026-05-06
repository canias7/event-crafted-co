// Per-group structured profile schema. Schemas attach to the parent
// group ("Venues", "Media", etc.); every sub-category in the same
// group renders the same form. The schema for a vendor's specific
// sub is resolved via GROUP_OF_SUB (categoryTaxonomy.ts).
//
// DB stores values as JSONB in vendor_profiles.category_attributes.
// Promote hot filter fields to typed columns when query performance
// matters.
//
// Adding a new group schema: drop a CategorySchema in GROUP_SCHEMAS
// keyed by the group name. The dynamic form + display picks it up
// automatically for every sub in that group.

import { groupOfSub } from "@/data/categoryTaxonomy";

export type AttributeField =
  | { type: "currency"; key: string; label: string; help?: string }
  | { type: "int"; key: string; label: string; help?: string; min?: number; max?: number; suffix?: string }
  | { type: "boolean"; key: string; label: string; help?: string }
  | { type: "tags"; key: string; label: string; options: string[]; help?: string }
  | { type: "select"; key: string; label: string; options: string[]; help?: string };

export interface CategorySection {
  name: string;
  fields: AttributeField[];
}

export interface CategorySchema {
  sections: CategorySection[];
}

// ─────────────────────────────────────────────────────────────────────────
//  Venues
// ─────────────────────────────────────────────────────────────────────────
const VENUES_SCHEMA: CategorySchema = {
  sections: [
    {
      name: "Pricing",
      fields: [
        {
          type: "currency",
          key: "reception_starting_cents",
          label: "Reception starting price",
          help: "What the cheapest reception package costs.",
        },
        {
          type: "currency",
          key: "ceremony_starting_cents",
          label: "Ceremony starting price",
        },
        {
          type: "currency",
          key: "bar_services_per_person_cents",
          label: "Bar service per person",
          help: "Leave blank if you don't offer bar packages.",
        },
        {
          type: "currency",
          key: "couples_typical_spend_cents",
          label: "Hosts typically spend",
          help: "All-in average — used to set host expectations.",
        },
      ],
    },
    {
      name: "Capacity",
      fields: [
        {
          type: "int",
          key: "max_guests",
          label: "Max guests",
          min: 1,
          suffix: "guests",
        },
        {
          type: "int",
          key: "min_guests",
          label: "Minimum (optional)",
          min: 1,
          suffix: "guests",
        },
      ],
    },
    {
      name: "Setting",
      fields: [
        {
          type: "tags",
          key: "settings",
          label: "Setting tags",
          options: [
            "Farm & Ranch",
            "Garden",
            "Trees",
            "Estate",
            "Mountain",
            "Beach",
            "Vineyard",
            "Loft",
            "Ballroom",
            "Restaurant",
            "Historic",
            "Modern",
            "Industrial",
            "Rooftop",
            "Waterfront",
          ],
        },
      ],
    },
    {
      name: "Amenities",
      fields: [
        {
          type: "tags",
          key: "amenities",
          label: "What's included on-site",
          options: [
            "Ceremony Area",
            "Reception Area",
            "Indoor Event Space",
            "Outdoor Event Space",
            "Covered Outdoor Space",
            "Dressing Room",
            "Bridal Suite",
            "On-Site Accommodations",
            "Handicap Accessible",
            "Wireless Internet",
            "Parking",
            "Pet Friendly",
            "Liquor License",
            "Kitchen",
          ],
        },
      ],
    },
    {
      name: "Service offerings",
      fields: [
        {
          type: "tags",
          key: "service_offerings",
          label: "What's bundled or available",
          options: [
            "Bar & Drinks",
            "Catering",
            "Cake Cutting",
            "Event Design",
            "Planning",
            "Rentals & Equipment",
            "Service Staff",
            "Tents",
          ],
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
//  Group → schema lookup. Stage 1: only Venues has a schema. Other
//  groups will be added as schema source material lands.
// ─────────────────────────────────────────────────────────────────────────
export const GROUP_SCHEMAS: Record<string, CategorySchema> = {
  Venues: VENUES_SCHEMA,
};

/**
 * Resolve a vendor's sub-category to its group's schema (or null when
 * the group has no schema yet). The argument is the value stored in
 * `vendor_profiles.category` (a sub-category name like "Photography",
 * "Event Venues", "DJs").
 */
export function getCategorySchema(category: string): CategorySchema | null {
  const group = groupOfSub(category);
  if (!group) return null;
  return GROUP_SCHEMAS[group] ?? null;
}
