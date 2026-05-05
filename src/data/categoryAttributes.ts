// Per-category structured profile schema. Each vendor category gets
// its own shape — venues track capacity + ceremony types + amenities,
// photographers track package hours + styles, bridal salons track
// dress price range + designers, etc.
//
// The shape is enforced client-side (dynamic forms read these schemas
// to render editors + public displays). DB stores the values as JSONB
// in vendor_profiles.category_attributes. Promote hot filter fields to
// typed columns when query performance matters.
//
// Adding a new category: drop a CategorySchema in CATEGORY_SCHEMAS
// keyed by the category name (matches vendor_profiles.category text).
// The dynamic form + display picks it up automatically.

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
//  Venue
// ─────────────────────────────────────────────────────────────────────────
const VENUE_SCHEMA: CategorySchema = {
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
          label: "Couples typically spend",
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
      name: "Ceremony types accepted",
      fields: [
        {
          type: "tags",
          key: "ceremony_types",
          label: "Ceremony types",
          options: [
            "Civil Union",
            "Commitment Ceremony",
            "Elopement",
            "Interfaith",
            "Non-Religious",
            "Religious",
            "Second Wedding",
            "Vow Renewal",
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
            "Wedding Design",
            "Planning",
            "Destination Weddings",
            "Destination Wedding Packages",
            "Destination Wedding Planning",
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
//  Photographer
// ─────────────────────────────────────────────────────────────────────────
const PHOTOGRAPHER_SCHEMA: CategorySchema = {
  sections: [
    {
      name: "Pricing",
      fields: [
        {
          type: "currency",
          key: "package_starting_cents",
          label: "Starting package price",
        },
        {
          type: "currency",
          key: "engagement_shoot_starting_cents",
          label: "Engagement shoot price",
          help: "Leave blank if always included or not offered.",
        },
        {
          type: "boolean",
          key: "destination_weddings_welcome",
          label: "Destination weddings welcome",
        },
        {
          type: "int",
          key: "travel_fee_starts_at_miles",
          label: "Travel fee kicks in after",
          suffix: "miles",
        },
      ],
    },
    {
      name: "Package details",
      fields: [
        {
          type: "int",
          key: "default_coverage_hours",
          label: "Default coverage hours",
          min: 1,
          max: 24,
          suffix: "hrs",
        },
        {
          type: "boolean",
          key: "second_shooter_available",
          label: "Second shooter available",
        },
        {
          type: "int",
          key: "gallery_delivery_weeks",
          label: "Gallery delivered in",
          suffix: "weeks",
        },
      ],
    },
    {
      name: "Style",
      fields: [
        {
          type: "tags",
          key: "styles",
          label: "Photography styles",
          options: [
            "Documentary",
            "Editorial",
            "Fine Art",
            "Photojournalism",
            "Traditional",
            "Modern",
            "Vintage",
            "Bright & Airy",
            "Dark & Moody",
            "Film",
            "Black & White",
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
          label: "Sessions offered",
          options: [
            "Engagement shoot",
            "Bridal portraits",
            "Boudoir",
            "Day-after session",
            "Drone aerial",
            "Trash-the-dress",
            "Photo booth add-on",
            "Family portraits",
            "Same-day edit",
          ],
        },
      ],
    },
    {
      name: "Deliverables",
      fields: [
        {
          type: "tags",
          key: "deliverables",
          label: "What clients receive",
          options: [
            "Digital files (high-res)",
            "Online gallery",
            "Prints available",
            "Albums available",
            "USB drive",
            "Print release included",
            "Raw files (extra)",
          ],
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
//  Videographer
// ─────────────────────────────────────────────────────────────────────────
const VIDEOGRAPHER_SCHEMA: CategorySchema = {
  sections: [
    {
      name: "Pricing",
      fields: [
        {
          type: "currency",
          key: "package_starting_cents",
          label: "Starting package price",
        },
        {
          type: "int",
          key: "travel_fee_starts_at_miles",
          label: "Travel fee kicks in after",
          suffix: "miles",
        },
      ],
    },
    {
      name: "Package details",
      fields: [
        {
          type: "int",
          key: "default_coverage_hours",
          label: "Default coverage hours",
          min: 1,
          max: 24,
          suffix: "hrs",
        },
        {
          type: "int",
          key: "max_videographers",
          label: "Videographers on-site",
          min: 1,
          max: 5,
        },
        {
          type: "int",
          key: "final_delivery_weeks",
          label: "Final delivery in",
          suffix: "weeks",
        },
      ],
    },
    {
      name: "Style",
      fields: [
        {
          type: "tags",
          key: "styles",
          label: "Filmmaking styles",
          options: [
            "Cinematic",
            "Documentary",
            "Storytelling",
            "Editorial",
            "Vintage / Super 8",
            "Drone-Focused",
          ],
        },
      ],
    },
    {
      name: "Deliverables",
      fields: [
        {
          type: "tags",
          key: "deliverables",
          label: "What's included",
          options: [
            "Highlight reel (3-5 min)",
            "Extended highlight (8-15 min)",
            "Full ceremony cut",
            "Full reception cut",
            "Toasts/speeches cut",
            "Same-day edit",
            "Drone footage",
            "Live streaming",
            "Raw footage available",
            "Multi-camera",
          ],
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
//  Bridal Salon
// ─────────────────────────────────────────────────────────────────────────
const BRIDAL_SALON_SCHEMA: CategorySchema = {
  sections: [
    {
      name: "Pricing",
      fields: [
        {
          type: "currency",
          key: "dress_price_low_cents",
          label: "Entry-level dress price",
        },
        {
          type: "currency",
          key: "dress_price_high_cents",
          label: "Top-of-range dress price",
        },
        {
          type: "currency",
          key: "alterations_starting_cents",
          label: "Alterations starting at",
          help: "Leave blank if always included.",
        },
        {
          type: "boolean",
          key: "accepts_layaway",
          label: "Accepts layaway / payment plans",
        },
      ],
    },
    {
      name: "Inventory",
      fields: [
        {
          type: "tags",
          key: "silhouettes",
          label: "Dress silhouettes",
          options: [
            "A-line",
            "Ballgown",
            "Mermaid",
            "Sheath",
            "Trumpet",
            "Tea-length",
            "Mini",
            "Jumpsuit",
            "Two-piece",
          ],
        },
        {
          type: "tags",
          key: "necklines",
          label: "Necklines",
          options: [
            "V-neck",
            "Sweetheart",
            "Halter",
            "Off-shoulder",
            "Strapless",
            "High-neck",
            "Square",
            "Bateau",
          ],
        },
        {
          type: "tags",
          key: "styles",
          label: "Aesthetic",
          options: [
            "Modern",
            "Bohemian",
            "Romantic",
            "Classic",
            "Vintage",
            "Beach",
            "Country",
            "Minimalist",
            "Glamorous",
          ],
        },
      ],
    },
    {
      name: "Sizing",
      fields: [
        {
          type: "tags",
          key: "sizes_in_stock",
          label: "Sizes in stock",
          options: ["0-2", "4-8", "10-14", "16-22", "24+", "Custom only"],
        },
        {
          type: "boolean",
          key: "plus_size_specialist",
          label: "Plus-size specialist",
        },
      ],
    },
    {
      name: "Services",
      fields: [
        {
          type: "tags",
          key: "services",
          label: "What's offered",
          options: [
            "Alterations on-site",
            "Trunk shows hosted",
            "Private appointments",
            "Off-the-rack purchases",
            "Sample sales",
            "Veils & accessories",
            "Bridesmaid dresses",
            "Mothers' dresses",
            "Flower girl dresses",
            "Suits / tuxedos",
            "Restorations / preservation",
          ],
        },
      ],
    },
    {
      name: "Logistics",
      fields: [
        {
          type: "boolean",
          key: "appointment_required",
          label: "Appointment required",
        },
        {
          type: "boolean",
          key: "walk_ins_welcome",
          label: "Walk-ins welcome",
        },
        {
          type: "int",
          key: "lead_time_weeks",
          label: "Recommended lead time",
          suffix: "weeks before event",
        },
      ],
    },
  ],
};

// Keyed by `vendor_profiles.category` (the singular display name used
// across the codebase: see VendorProfilePage's `categories` list).
export const CATEGORY_SCHEMAS: Record<string, CategorySchema> = {
  Venue: VENUE_SCHEMA,
  Photographer: PHOTOGRAPHER_SCHEMA,
  Videographer: VIDEOGRAPHER_SCHEMA,
  "Bridal Salon": BRIDAL_SALON_SCHEMA,
};

export function getCategorySchema(category: string): CategorySchema | null {
  return CATEGORY_SCHEMAS[category] ?? null;
}
