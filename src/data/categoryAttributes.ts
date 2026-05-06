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
  | {
      type: "tags";
      key: string;
      label: string;
      options: string[];
      help?: string;
      /** When true, the editor renders an "Add other…" input below
       *  the preset chips so the vendor can append custom strings.
       *  Stored values mix preset + custom in the same string[]. */
      allowCustom?: boolean;
    }
  | { type: "select"; key: string; label: string; options: string[]; help?: string };

export interface CategorySection {
  name: string;
  fields: AttributeField[];
  /** When set, this section only renders for vendors whose
   *  sub-category appears here. Undefined = section applies to every
   *  sub in the group. Used heavily in groups with heterogeneous subs
   *  (Media: Photo vs Video vs Booth · Design & Decor: Coordinators
   *  vs Florists vs Beauty). */
  onlySubs?: string[];
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
    {
      name: "Details",
      fields: [
        {
          type: "tags",
          key: "details",
          label: "What you offer",
          help: "Pick everything that applies. Add your own at the bottom.",
          allowCustom: true,
          options: [
            "Free parking",
            "Valet parking",
            "Wheelchair accessible",
            "Pet friendly",
            "Smoke-free",
            "Wifi",
            "AV equipment included",
            "Bridal suite",
            "Groom's room",
            "Outdoor heaters",
            "Coat check",
            "On-site coordinator",
            "Setup / breakdown included",
            "Insurance certificate",
            "Permitted",
            "Late curfew (2 AM+)",
            "Catering kitchen",
            "Cake cutting",
            "BYO alcohol allowed",
            "Liquor license",
            "Multiple ceremony spots",
            "Rain plan available",
            "Photo permit",
            "Drone permit",
            "Generator backup",
            "Sparkler send-off allowed",
            "Confetti allowed",
            "Open flame allowed (candles)",
            "Hotel block partnership",
          ],
        },
      ],
    },
    ],
};

// ─────────────────────────────────────────────────────────────────────────
//  Food & Beverage
// ─────────────────────────────────────────────────────────────────────────
const FOOD_BEVERAGE_SCHEMA: CategorySchema = {
  sections: [
    {
      name: "Pricing",
      fields: [
        {
          type: "currency",
          key: "per_person_starting_cents",
          label: "Per-person starting price",
          help: "Leave blank if you bill flat instead of per-head.",
        },
        {
          type: "currency",
          key: "event_minimum_cents",
          label: "Event minimum",
          help: "Smallest booking you'll quote.",
        },
        {
          type: "currency",
          key: "hourly_rate_cents",
          label: "Hourly rate",
          help: "Per bartender / attendant (Bartending only).",
          // Mainly for bartenders; safe for cake/food-truck if they bill hourly.
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
          label: "Minimum guest count",
          min: 1,
          suffix: "guests",
        },
      ],
    },
    {
      name: "Service style",
      onlySubs: ["Catering"],
      fields: [
        {
          type: "tags",
          key: "service_styles",
          label: "How you serve",
          options: [
            "Plated",
            "Family-style",
            "Buffet",
            "Stations",
            "Passed canapés",
            "Cocktail-style",
            "Tasting menu",
            "Drop-off",
          ],
        },
      ],
    },
    {
      name: "Cuisine",
      onlySubs: ["Catering", "Food Trucks / Specialty"],
      fields: [
        {
          type: "tags",
          key: "cuisines",
          label: "Cuisines",
          options: [
            "American",
            "Italian",
            "Mediterranean",
            "Mexican",
            "Japanese",
            "Thai",
            "Indian",
            "Korean",
            "Chinese",
            "Southern / BBQ",
            "Seafood",
            "Farm-to-table",
            "Vegetarian-forward",
          ],
        },
      ],
    },
    {
      name: "Bar service",
      onlySubs: ["Bartending / Mobile Bars"],
      fields: [
        {
          type: "tags",
          key: "bar_services",
          label: "What you offer",
          options: [
            "Beer & wine only",
            "Full bar",
            "Cocktails — custom menu",
            "Cocktails — house menu",
            "Mocktails",
            "Coffee & espresso",
            "Glassware provided",
            "Ice & coolers provided",
            "Bar setup / breakdown",
            "Liquor license",
          ],
        },
        {
          type: "boolean",
          key: "byob_friendly",
          label: "Will pour client-supplied alcohol (BYOB)",
        },
        {
          type: "boolean",
          key: "tabc_riservi_certified",
          label: "Certified bartenders (TABC / ServSafe / RBS)",
        },
      ],
    },
    {
      name: "Desserts",
      onlySubs: ["Desserts & Cakes"],
      fields: [
        {
          type: "tags",
          key: "dessert_offerings",
          label: "What you make",
          options: [
            "Wedding / event cakes",
            "Cupcakes",
            "Pies",
            "Cookies",
            "Macarons",
            "Donuts",
            "Tarts",
            "Pastry tables",
            "Plated desserts",
          ],
        },
        {
          type: "boolean",
          key: "custom_flavors",
          label: "Custom flavors / fillings on request",
        },
      ],
    },
    {
      name: "Food truck logistics",
      onlySubs: ["Food Trucks / Specialty"],
      fields: [
        {
          type: "int",
          key: "truck_length_feet",
          label: "Truck length",
          suffix: "ft",
        },
        {
          type: "boolean",
          key: "off_grid_capable",
          label: "Off-grid capable (own generator)",
        },
        {
          type: "boolean",
          key: "permitted_in_state",
          label: "Permitted / insured for events",
        },
      ],
    },
    {
      name: "Dietary accommodations",
      fields: [
        {
          type: "tags",
          key: "dietary",
          label: "Diets you cater for",
          options: [
            "Vegetarian",
            "Vegan",
            "Gluten-free",
            "Dairy-free",
            "Nut-free",
            "Kosher",
            "Halal",
            "Allergen-aware",
          ],
        },
      ],
    },
    {
      name: "What's included",
      fields: [
        {
          type: "tags",
          key: "included_services",
          label: "Bundled with most packages",
          options: [
            "Setup & breakdown",
            "Service staff",
            "Tasting included",
            "Equipment / rentals",
            "Linens",
            "Disposables",
            "Tip jars provided",
            "Travel within metro",
          ],
        },
      ],
    },
    {
      name: "Details",
      fields: [
        {
          type: "tags",
          key: "details",
          label: "What you offer",
          help: "Pick everything that applies. Add your own at the bottom.",
          allowCustom: true,
          options: [
            "Plated service",
            "Family-style",
            "Buffet",
            "Stations",
            "Hors d'oeuvres",
            "Late-night snacks",
            "Bar service",
            "Custom cocktail menu",
            "Mocktails",
            "Wine pairing",
            "Coffee bar",
            "Espresso bar",
            "Champagne service",
            "Tasting menus",
            "Vegetarian options",
            "Vegan options",
            "Gluten-free options",
            "Dairy-free options",
            "Kosher certified",
            "Halal certified",
            "Allergen-aware",
            "Setup / breakdown",
            "Tasting included",
            "Equipment / rentals included",
            "Linens",
            "Service staff",
            "Tip jars provided",
            "Trained sommelier",
            "Certified bartender",
            "Cake cutting service",
            "Disposables",
            "Locally / seasonally sourced",
            "Travel within metro",
          ],
        },
      ],
    },
    ],
};

// ─────────────────────────────────────────────────────────────────────────
//  Entertainment
// ─────────────────────────────────────────────────────────────────────────
const ENTERTAINMENT_SCHEMA: CategorySchema = {
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
          key: "hourly_rate_cents",
          label: "Hourly rate",
          help: "If you bill hourly instead of by package.",
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
      name: "Coverage",
      fields: [
        {
          type: "int",
          key: "default_set_hours",
          label: "Standard set length",
          min: 1,
          max: 12,
          suffix: "hrs",
        },
        {
          type: "int",
          key: "max_set_hours",
          label: "Longest set you'll play",
          suffix: "hrs",
        },
      ],
    },
    {
      name: "DJ details",
      onlySubs: ["DJs"],
      fields: [
        {
          type: "boolean",
          key: "mc_services_included",
          label: "MC services included",
        },
        {
          type: "boolean",
          key: "uplighting_included",
          label: "Uplighting included",
        },
        {
          type: "boolean",
          key: "takes_requests",
          label: "Accepts day-of guest requests",
        },
        {
          type: "tags",
          key: "dj_genres",
          label: "Genres in your wheelhouse",
          options: [
            "Pop",
            "Hip-hop / R&B",
            "House",
            "Electronic / Dance",
            "Soul",
            "Latin",
            "Country",
            "Top 40",
            "Open format",
          ],
        },
      ],
    },
    {
      name: "Live music",
      onlySubs: ["Live Music"],
      fields: [
        {
          type: "int",
          key: "ensemble_size",
          label: "Group size",
          min: 1,
          max: 20,
          suffix: "members",
        },
        {
          type: "tags",
          key: "ensemble_format",
          label: "Format(s) offered",
          options: [
            "Solo",
            "Duo",
            "Trio",
            "Quartet",
            "Full band (5-7)",
            "Big band (8+)",
            "Acoustic",
            "Plugged-in",
          ],
        },
        {
          type: "tags",
          key: "music_genres",
          label: "Genres",
          options: [
            "Jazz",
            "Classical",
            "Pop",
            "Rock",
            "Soul / Motown",
            "R&B",
            "Country",
            "Folk",
            "Latin",
            "Gospel",
            "Indie",
          ],
        },
        {
          type: "boolean",
          key: "pa_lighting_included",
          label: "PA + lighting included",
        },
      ],
    },
    {
      name: "Performers",
      onlySubs: ["Performers"],
      fields: [
        {
          type: "tags",
          key: "performance_types",
          label: "What you do",
          options: [
            "Magicians",
            "Dancers",
            "Stilt walkers",
            "Aerialists",
            "Caricaturists",
            "Tarot / palm readers",
            "Drag",
            "Comedians",
            "Cultural / folk",
            "Mariachi",
          ],
        },
        {
          type: "int",
          key: "set_minutes",
          label: "Typical set length",
          suffix: "min",
        },
      ],
    },
    {
      name: "Hosts / MCs",
      onlySubs: ["Hosts / MCs"],
      fields: [
        {
          type: "tags",
          key: "mc_languages",
          label: "Languages",
          options: [
            "English",
            "Spanish",
            "French",
            "Mandarin",
            "Cantonese",
            "Hindi",
            "Arabic",
            "Korean",
            "Japanese",
            "Portuguese",
            "Bilingual emcee",
          ],
        },
        {
          type: "tags",
          key: "mc_event_specialties",
          label: "Event types you host",
          options: [
            "Weddings",
            "Galas / fundraisers",
            "Corporate / awards",
            "Conferences / panels",
            "Brand activations",
            "Auctions",
          ],
        },
      ],
    },
    {
      name: "Logistics",
      fields: [
        {
          type: "boolean",
          key: "owns_equipment",
          label: "Brings own equipment",
        },
        {
          type: "boolean",
          key: "outdoor_capable",
          label: "Outdoor / weather-protected setup",
        },
        {
          type: "int",
          key: "setup_minutes",
          label: "Setup time required",
          suffix: "min",
        },
      ],
    },
    {
      name: "Details",
      fields: [
        {
          type: "tags",
          key: "details",
          label: "What you offer",
          help: "Pick everything that applies. Add your own at the bottom.",
          allowCustom: true,
          options: [
            "Sound system included",
            "Lighting included",
            "MC services",
            "Custom playlists",
            "Day-of guest requests",
            "Multilingual host",
            "Bilingual emcee",
            "Live looping",
            "Sax solo (live)",
            "Drum circle",
            "Karaoke option",
            "Backup equipment",
            "Outdoor capable",
            "Generator (off-grid)",
            "Custom intro / exit music",
            "Smoke machines",
            "Sparklers",
            "Strobe lights",
            "Disco ball",
            "Stage lighting",
            "Bubble machines",
            "Lasers",
            "Recording included",
            "Live streaming",
            "Multi-genre repertoire",
            "Cocktail hour set",
            "Dinner background set",
            "Late-night party set",
          ],
        },
      ],
    },
    ],
};

// ─────────────────────────────────────────────────────────────────────────
//  Media (Photography · Videography · Photo Booths)
// ─────────────────────────────────────────────────────────────────────────
const MEDIA_SCHEMA: CategorySchema = {
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
          label: "Engagement / pre-event shoot",
          help: "Leave blank if always included or not offered.",
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
      name: "Coverage",
      onlySubs: ["Photography", "Videography"],
      fields: [
        {
          type: "int",
          key: "default_coverage_hours",
          label: "Default coverage",
          min: 1,
          max: 24,
          suffix: "hrs",
        },
        {
          type: "int",
          key: "team_size",
          label: "Team on-site",
          min: 1,
          max: 8,
          suffix: "people",
        },
        {
          type: "boolean",
          key: "second_shooter_available",
          label: "Second shooter / videographer available",
        },
      ],
    },
    {
      name: "Photo deliverables",
      onlySubs: ["Photography"],
      fields: [
        {
          type: "int",
          key: "gallery_delivery_weeks",
          label: "Gallery delivered in",
          suffix: "weeks",
        },
        {
          type: "tags",
          key: "photo_styles",
          label: "Photography style",
          options: [
            "Documentary",
            "Editorial",
            "Photojournalism",
            "Fine Art",
            "Modern",
            "Classic",
            "Bright & Airy",
            "Dark & Moody",
            "Film / hybrid",
            "Black & white",
          ],
        },
        {
          type: "tags",
          key: "photo_deliverables",
          label: "What clients receive",
          options: [
            "Digital files (high-res)",
            "Online gallery",
            "Print release included",
            "Prints available",
            "Albums available",
            "USB drive",
            "Same-day teasers",
            "Raw files (extra)",
          ],
        },
      ],
    },
    {
      name: "Video deliverables",
      onlySubs: ["Videography"],
      fields: [
        {
          type: "int",
          key: "final_delivery_weeks",
          label: "Final delivery in",
          suffix: "weeks",
        },
        {
          type: "tags",
          key: "video_styles",
          label: "Filmmaking style",
          options: [
            "Cinematic",
            "Documentary",
            "Storytelling",
            "Editorial",
            "Vintage / Super 8",
            "Drone-focused",
            "Same-day edit",
          ],
        },
        {
          type: "tags",
          key: "video_deliverables",
          label: "What's included",
          options: [
            "Highlight reel (3-5 min)",
            "Extended highlight (8-15 min)",
            "Full ceremony / event cut",
            "Toasts / speeches cut",
            "Same-day edit",
            "Drone footage",
            "Live streaming",
            "Multi-camera",
            "Raw footage available",
          ],
        },
      ],
    },
    {
      name: "Booth specs",
      onlySubs: ["Photo Booths"],
      fields: [
        {
          type: "tags",
          key: "booth_types",
          label: "Booth styles",
          options: [
            "Open-air",
            "Enclosed",
            "Mirror",
            "GIF / video",
            "360 booth",
            "Roaming photographer",
          ],
        },
        {
          type: "int",
          key: "booth_min_hours",
          label: "Minimum rental",
          suffix: "hrs",
        },
        {
          type: "boolean",
          key: "booth_attendant_included",
          label: "Attendant included",
        },
        {
          type: "boolean",
          key: "instant_prints",
          label: "Instant printouts",
        },
        {
          type: "boolean",
          key: "custom_overlays",
          label: "Custom branded overlays / templates",
        },
        {
          type: "boolean",
          key: "digital_gallery_after",
          label: "Digital gallery delivered after",
        },
      ],
    },
    {
      name: "Travel + extras",
      fields: [
        {
          type: "boolean",
          key: "destination_friendly",
          label: "Destination / out-of-state events welcome",
        },
      ],
    },
    {
      name: "Details",
      fields: [
        {
          type: "tags",
          key: "details",
          label: "What you offer",
          help: "Pick everything that applies. Add your own at the bottom.",
          allowCustom: true,
          options: [
            "Engagement / pre-event shoot",
            "Bridal portraits",
            "Day-after session",
            "Drone aerial",
            "Trash-the-dress",
            "Photo booth add-on",
            "Family portraits",
            "Same-day edit",
            "Boudoir",
            "Studio backdrop",
            "On-location",
            "Multi-camera coverage",
            "Highlight reel (3-5 min)",
            "Extended highlight (8-15 min)",
            "Full ceremony cut",
            "Toasts / speeches cut",
            "Live streaming",
            "Raw footage available",
            "Print release included",
            "Online gallery",
            "Albums available",
            "USB delivery",
            "Drone footage",
            "Same-day teasers",
            "Behind-the-scenes",
            "Editorial style",
            "Documentary style",
            "Cinematic style",
            "Black & white film",
            "Same-day prints",
          ],
        },
      ],
    },
    ],
};

// ─────────────────────────────────────────────────────────────────────────
//  Design & Decor
// ─────────────────────────────────────────────────────────────────────────
const DESIGN_DECOR_SCHEMA: CategorySchema = {
  sections: [
    {
      name: "Pricing",
      fields: [
        {
          type: "currency",
          key: "package_starting_cents",
          label: "Starting package / fee",
        },
        {
          type: "currency",
          key: "minimum_order_cents",
          label: "Order minimum",
          help: "For Florists / Decor Rentals — leave blank if no minimum.",
        },
        {
          type: "currency",
          key: "trial_cost_cents",
          label: "Trial session price",
          help: "Beauty / Grooming only — leave blank if always included.",
        },
      ],
    },
    {
      name: "Event coordination",
      onlySubs: ["Event Coordinators"],
      fields: [
        {
          type: "tags",
          key: "planning_tiers",
          label: "Planning tiers offered",
          options: [
            "Full-service planning",
            "Partial planning",
            "Month-of",
            "Day-of coordination",
            "Design only",
            "Destination",
          ],
        },
        {
          type: "tags",
          key: "coordination_services",
          label: "What's included",
          options: [
            "Vendor management",
            "Run-of-show",
            "Budget tracking",
            "Timeline build",
            "Site walks",
            "Rehearsal direction",
            "Day-of staffing",
            "Guest experience design",
          ],
        },
        {
          type: "int",
          key: "max_concurrent_events",
          label: "Max events per weekend",
        },
      ],
    },
    {
      name: "Florals",
      onlySubs: ["Florists"],
      fields: [
        {
          type: "tags",
          key: "floral_styles",
          label: "Floral style",
          options: [
            "Garden",
            "Modern",
            "Classic",
            "Wild / asymmetric",
            "Minimalist",
            "Tropical",
            "Bohemian",
            "Monochrome",
          ],
        },
        {
          type: "tags",
          key: "floral_offerings",
          label: "What you produce",
          options: [
            "Personal flowers (bouquets / boutonnières)",
            "Centerpieces",
            "Ceremony arches / installations",
            "Hanging installations",
            "Aisle florals",
            "Reception florals",
            "Welcome / entry pieces",
            "Sustainable / locally-sourced",
            "Dried & preserved",
          ],
        },
      ],
    },
    {
      name: "Beauty services",
      onlySubs: ["Beauty"],
      fields: [
        {
          type: "tags",
          key: "beauty_services",
          label: "Services",
          options: [
            "Hair styling",
            "Makeup",
            "Airbrush makeup",
            "Lash extensions",
            "Brow shaping",
            "Skin prep",
            "Updo / blowout",
            "Touch-ups on-site",
            "Nail services",
          ],
        },
        {
          type: "boolean",
          key: "trial_included",
          label: "Trial session included",
        },
        {
          type: "boolean",
          key: "on_location_only",
          label: "On-location only (no salon)",
        },
        {
          type: "int",
          key: "max_artists_on_team",
          label: "Max artists on a single event",
          suffix: "artists",
        },
      ],
    },
    {
      name: "Grooming",
      onlySubs: ["Grooming Services"],
      fields: [
        {
          type: "tags",
          key: "grooming_services",
          label: "Services",
          options: [
            "Haircut",
            "Beard trim",
            "Hot-towel shave",
            "Hair styling",
            "Facials",
            "Skin prep",
            "On-location",
          ],
        },
      ],
    },
    {
      name: "Decor inventory",
      onlySubs: ["Decor Rentals"],
      fields: [
        {
          type: "tags",
          key: "decor_inventory",
          label: "What you carry",
          options: [
            "Tabletop / centerpieces",
            "Linens",
            "Lighting",
            "Signage",
            "Backdrops",
            "Arches",
            "Aisle decor",
            "Lounge furniture",
            "Bars / bar tops",
            "Candles",
            "Custom builds",
          ],
        },
        {
          type: "tags",
          key: "decor_aesthetic",
          label: "Aesthetic",
          options: [
            "Modern",
            "Classic",
            "Boho",
            "Industrial",
            "Vintage",
            "Editorial",
            "Romantic",
            "Minimal",
            "Maximal",
          ],
        },
      ],
    },
    {
      name: "Logistics",
      fields: [
        {
          type: "boolean",
          key: "delivery_included",
          label: "Delivery + setup / breakdown included",
          help: "Florists / Decor Rentals.",
        },
        {
          type: "boolean",
          key: "destination_friendly",
          label: "Destination / out-of-state events welcome",
        },
      ],
    },
    {
      name: "Details",
      fields: [
        {
          type: "tags",
          key: "details",
          label: "What you offer",
          help: "Pick everything that applies. Add your own at the bottom.",
          allowCustom: true,
          options: [
            "Centerpieces",
            "Tablescapes",
            "Linens",
            "Chargers",
            "Place cards",
            "Signage",
            "Welcome boards",
            "Menus (printed)",
            "Escort cards",
            "Aisle decorations",
            "Arch / chuppah",
            "Floral installations",
            "Hanging florals",
            "Lighting design",
            "Candles",
            "Lanterns",
            "Greenery walls",
            "Photo backdrops",
            "Lounge furniture",
            "Champagne wall",
            "Dessert tables",
            "Custom monograms",
            "Calligraphy",
            "Vintage props",
            "Sustainable / locally-sourced",
            "Dried & preserved florals",
            "On-site setup",
            "Same-day breakdown",
            "Custom builds",
            "Day-of styling",
          ],
        },
      ],
    },
    ],
};

// ─────────────────────────────────────────────────────────────────────────
//  Rentals
// ─────────────────────────────────────────────────────────────────────────
const RENTALS_SCHEMA: CategorySchema = {
  sections: [
    {
      name: "Pricing",
      fields: [
        {
          type: "currency",
          key: "order_minimum_cents",
          label: "Order minimum",
        },
        {
          type: "currency",
          key: "delivery_starting_cents",
          label: "Delivery starting price",
          help: "Within metro — outside metro quoted separately.",
        },
      ],
    },
    {
      name: "Inventory",
      fields: [
        {
          type: "tags",
          key: "inventory_categories",
          label: "What you stock",
          options: [
            "Tables (round / banquet)",
            "Chairs (folding / chiavari)",
            "Lounge furniture",
            "Linens",
            "Tents",
            "Tent flooring",
            "Lighting",
            "Audio / PA",
            "Video / projection",
            "Dance floor",
            "Staging",
            "Bars",
            "Heaters / fans",
          ],
        },
      ],
    },
    {
      name: "Furniture",
      onlySubs: ["Furniture Rentals"],
      fields: [
        {
          type: "tags",
          key: "furniture_styles",
          label: "Aesthetic",
          options: [
            "Modern",
            "Classic",
            "Vintage",
            "Industrial",
            "Boho",
            "Lounge",
            "Outdoor / weather-resistant",
          ],
        },
      ],
    },
    {
      name: "Tents",
      onlySubs: ["Tents & Outdoor"],
      fields: [
        {
          type: "tags",
          key: "tent_types",
          label: "Tent types",
          options: [
            "Pole tent",
            "Frame tent",
            "Sailcloth",
            "Clear span",
            "Stretch tent",
            "Sperry / sailcloth",
            "Pop-up",
          ],
        },
        {
          type: "int",
          key: "tent_max_capacity",
          label: "Largest tent capacity",
          suffix: "guests",
        },
        {
          type: "boolean",
          key: "tent_sidewalls_available",
          label: "Sidewalls / weather panels available",
        },
        {
          type: "boolean",
          key: "tent_flooring_available",
          label: "Flooring / sub-flooring available",
        },
      ],
    },
    {
      name: "Lighting & AV",
      onlySubs: ["Lighting & AV Equipment"],
      fields: [
        {
          type: "tags",
          key: "av_offerings",
          label: "AV inventory",
          options: [
            "Uplighting",
            "String / café lights",
            "Pin-spotting",
            "Gobo / monogram projection",
            "Stage lighting",
            "Microphones (wired / wireless)",
            "PA systems",
            "Mixers",
            "Projection screens",
            "LED walls",
            "Live-stream rigs",
          ],
        },
        {
          type: "boolean",
          key: "av_tech_on_site",
          label: "AV tech / operator included",
        },
      ],
    },
    {
      name: "Dance floors & staging",
      onlySubs: ["Dance Floors & Staging"],
      fields: [
        {
          type: "tags",
          key: "floor_types",
          label: "Floor types",
          options: [
            "Wood parquet",
            "Black",
            "White",
            "LED illuminated",
            "Custom decal",
            "Outdoor sub-floor",
          ],
        },
        {
          type: "tags",
          key: "stage_types",
          label: "Stage / riser options",
          options: [
            "Risers (8-24in)",
            "Modular stage",
            "Skirted stage",
            "Curtain backdrops",
          ],
        },
      ],
    },
    {
      name: "Transportation",
      onlySubs: ["Transportation"],
      fields: [
        {
          type: "tags",
          key: "vehicle_types",
          label: "Fleet",
          options: [
            "Sedan",
            "SUV",
            "Limousine",
            "Stretch limo",
            "Van",
            "Mini-bus (15-25 pax)",
            "Coach (30-55 pax)",
            "Trolley",
            "Vintage car",
            "Party bus",
          ],
        },
        {
          type: "int",
          key: "fleet_size",
          label: "Vehicles in fleet",
          suffix: "vehicles",
        },
        {
          type: "int",
          key: "min_booking_hours",
          label: "Minimum booking",
          suffix: "hrs",
        },
        {
          type: "boolean",
          key: "chauffeur_uniformed",
          label: "Chauffeurs uniformed",
        },
      ],
    },
    {
      name: "Logistics",
      fields: [
        {
          type: "boolean",
          key: "delivery_setup_breakdown",
          label: "Delivery, setup, and breakdown included",
        },
        {
          type: "int",
          key: "service_radius_miles",
          label: "Free-delivery radius",
          suffix: "mi",
        },
      ],
    },
    {
      name: "Details",
      fields: [
        {
          type: "tags",
          key: "details",
          label: "What you offer",
          help: "Pick everything that applies. Add your own at the bottom.",
          allowCustom: true,
          options: [
            "Round tables",
            "Banquet tables",
            "Farm tables",
            "Sweetheart table",
            "Chiavari chairs",
            "Ghost chairs",
            "Cross-back chairs",
            "Bench seating",
            "Linens",
            "Napkins",
            "Runners",
            "Glassware",
            "Flatware",
            "Charger plates",
            "Lounge furniture",
            "Bars / bar tops",
            "Pole tents",
            "Frame tents",
            "Sailcloth tents",
            "Pop-up tents",
            "String lights",
            "Edison bulbs",
            "Chandeliers",
            "Uplighting",
            "Spotlights",
            "Stage / risers",
            "Dance floor",
            "Red carpet",
            "Candle holders",
            "Vases",
            "Patio heaters",
            "Fans / cooling",
            "Sound system",
            "Microphones",
            "Projection screens",
            "Generators",
            "Setup included",
            "Breakdown included",
            "Same-day delivery",
            "Damage waiver",
          ],
        },
      ],
    },
    ],
};

// ─────────────────────────────────────────────────────────────────────────
//  Experiences
// ─────────────────────────────────────────────────────────────────────────
const EXPERIENCES_SCHEMA: CategorySchema = {
  sections: [
    {
      name: "Pricing",
      fields: [
        {
          type: "currency",
          key: "per_person_starting_cents",
          label: "Per-person starting price",
        },
        {
          type: "currency",
          key: "event_minimum_cents",
          label: "Event minimum",
        },
        {
          type: "int",
          key: "min_guest_count",
          label: "Minimum guest count",
          suffix: "guests",
        },
      ],
    },
    {
      name: "Tasting types",
      onlySubs: ["Tastings"],
      fields: [
        {
          type: "tags",
          key: "tasting_types",
          label: "What you pour / serve",
          options: [
            "Wine",
            "Champagne / sparkling",
            "Whiskey / bourbon",
            "Tequila / mezcal",
            "Gin",
            "Rum",
            "Sake",
            "Beer / craft beer",
            "Coffee",
            "Tea",
            "Chocolate",
            "Cheese",
            "Olive oil",
          ],
        },
        {
          type: "boolean",
          key: "sommelier_certified",
          label: "Certified sommelier / spirits specialist",
        },
        {
          type: "boolean",
          key: "guided_education",
          label: "Includes guided tasting / education",
        },
      ],
    },
    {
      name: "Specialty experiences",
      onlySubs: ["Specialty Services"],
      fields: [
        {
          type: "tags",
          key: "specialty_offerings",
          label: "What you bring",
          options: [
            "Cigar rolling",
            "Coffee cart",
            "Espresso bar",
            "Ice-cream cart",
            "Donut wall",
            "Caviar bumps",
            "Oyster shucking",
            "Custom cocktail bar",
            "Chocolate fountain",
            "Fortune teller / tarot",
            "Live painter",
            "Cigarette girls / hostesses",
          ],
        },
      ],
    },
    {
      name: "Service details",
      fields: [
        {
          type: "int",
          key: "default_service_hours",
          label: "Default service time",
          min: 1,
          max: 12,
          suffix: "hrs",
        },
        {
          type: "boolean",
          key: "outdoor_capable",
          label: "Outdoor / portable setup",
        },
        {
          type: "boolean",
          key: "bilingual_staff",
          label: "Bilingual staff available",
        },
      ],
    },
    {
      name: "Details",
      fields: [
        {
          type: "tags",
          key: "details",
          label: "What you offer",
          help: "Pick everything that applies. Add your own at the bottom.",
          allowCustom: true,
          options: [
            "Wine tasting",
            "Whiskey tasting",
            "Cocktail mixing class",
            "Cigar rolling",
            "Coffee bar",
            "Tea ceremony",
            "Charcuterie boards",
            "Cheese pairing",
            "Olive oil tasting",
            "Chocolate tasting",
            "Tarot reading",
            "Live painting",
            "Caricatures",
            "Magic show",
            "Comedy set",
            "Cultural performances",
            "Drum circle",
            "Aerial performance",
            "Fire dancing",
            "Sparkler send-off",
            "Confetti cannons",
            "Custom souvenirs",
            "Bilingual staff",
            "Outdoor capable",
            "Indoor capable",
            "Branded experiences",
            "Educational element",
          ],
        },
      ],
    },
    ],
};

// ─────────────────────────────────────────────────────────────────────────
//  Corporate Services
// ─────────────────────────────────────────────────────────────────────────
const CORPORATE_SERVICES_SCHEMA: CategorySchema = {
  sections: [
    {
      name: "Pricing",
      fields: [
        {
          type: "currency",
          key: "hourly_rate_cents",
          label: "Hourly rate",
          help: "Per-staff or per-attendant.",
        },
        {
          type: "currency",
          key: "package_starting_cents",
          label: "Starting package / day-rate",
          help: "Speakers / Hosts often quote a flat fee.",
        },
        {
          type: "int",
          key: "min_booking_hours",
          label: "Minimum booking",
          suffix: "hrs",
        },
      ],
    },
    {
      name: "Staffing",
      onlySubs: ["Staffing"],
      fields: [
        {
          type: "tags",
          key: "staffing_roles",
          label: "Roles you provide",
          options: [
            "Servers",
            "Bartenders",
            "Bussers",
            "Greeters / coat check",
            "Captains",
            "Setup / breakdown crew",
            "Day-of coordinators",
            "Brand ambassadors",
            "Registration / check-in",
          ],
        },
        {
          type: "boolean",
          key: "uniforms_provided",
          label: "Uniforms provided",
        },
        {
          type: "boolean",
          key: "trained_in_fine_dining",
          label: "Trained in plated / fine-dining service",
        },
      ],
    },
    {
      name: "Speaker / host details",
      onlySubs: ["Speakers / Hosts"],
      fields: [
        {
          type: "tags",
          key: "speaker_topics",
          label: "Topic areas",
          options: [
            "Leadership",
            "Diversity & inclusion",
            "Innovation / tech",
            "Sales",
            "Marketing",
            "Wellness",
            "Finance",
            "Climate / sustainability",
            "Sports",
            "Politics / current affairs",
            "Comedy",
            "Education",
          ],
        },
        {
          type: "tags",
          key: "speaker_formats",
          label: "Formats",
          options: [
            "Keynote",
            "Fireside chat",
            "Panel moderator",
            "Workshop",
            "Master class",
            "Awards host / emcee",
          ],
        },
        {
          type: "tags",
          key: "host_languages",
          label: "Languages",
          options: [
            "English",
            "Spanish",
            "French",
            "Mandarin",
            "Hindi",
            "Arabic",
            "Portuguese",
            "Korean",
            "Japanese",
          ],
        },
      ],
    },
    {
      name: "Security",
      onlySubs: ["Security"],
      fields: [
        {
          type: "tags",
          key: "security_services",
          label: "Services",
          options: [
            "Access control",
            "Crowd management",
            "VIP protection",
            "Bag checks",
            "Bomb sweeps",
            "Plainclothes",
            "Uniformed",
            "Armed (licensed)",
            "Unarmed",
          ],
        },
        {
          type: "boolean",
          key: "licensed_in_state",
          label: "Licensed + insured in state",
        },
      ],
    },
    {
      name: "Valet",
      onlySubs: ["Valet"],
      fields: [
        {
          type: "int",
          key: "valet_attendants_typical",
          label: "Attendants per typical event",
          suffix: "attendants",
        },
        {
          type: "boolean",
          key: "valet_podium_keys_provided",
          label: "Podium + key boxes provided",
        },
        {
          type: "boolean",
          key: "valet_shuttle_coordination",
          label: "Shuttle / off-site lot coordination",
        },
        {
          type: "boolean",
          key: "valet_insured",
          label: "Insured + bonded",
        },
      ],
    },
    {
      name: "Logistics",
      fields: [
        {
          type: "boolean",
          key: "background_checked_staff",
          label: "All staff background-checked",
        },
        {
          type: "tags",
          key: "event_specialties",
          label: "Event types",
          options: [
            "Corporate / awards",
            "Conferences",
            "Galas / fundraisers",
            "Brand activations",
            "Private estates",
            "Weddings",
            "Concerts / festivals",
          ],
        },
      ],
    },
    {
      name: "Details",
      fields: [
        {
          type: "tags",
          key: "details",
          label: "What you offer",
          help: "Pick everything that applies. Add your own at the bottom.",
          allowCustom: true,
          options: [
            "Brand activations",
            "Trade show staffing",
            "Conference setup",
            "Registration / check-in",
            "Greeters / hostesses",
            "Translation services",
            "Live captioning",
            "Tech support (AV)",
            "Live streaming",
            "Production crew",
            "Security personnel",
            "Bouncers",
            "Crowd control",
            "Valet parking",
            "Shuttle services",
            "Coat check",
            "Ushers",
            "Vendor coordination",
            "Day-of management",
            "Run-of-show",
            "Background-checked staff",
            "Uniforms provided",
            "Insurance certificate",
            "Multilingual staff",
            "On-call backup",
          ],
        },
      ],
    },
    ],
};

// ─────────────────────────────────────────────────────────────────────────
//  Group → schema lookup. Every sub in a group resolves to its
//  group's schema; sections with `onlySubs` are filtered out for
//  non-matching subs at render time (Editor + Display).
// ─────────────────────────────────────────────────────────────────────────
export const GROUP_SCHEMAS: Record<string, CategorySchema> = {
  Venues: VENUES_SCHEMA,
  "Food & Beverage": FOOD_BEVERAGE_SCHEMA,
  Entertainment: ENTERTAINMENT_SCHEMA,
  Media: MEDIA_SCHEMA,
  "Design & Decor": DESIGN_DECOR_SCHEMA,
  Rentals: RENTALS_SCHEMA,
  Experiences: EXPERIENCES_SCHEMA,
  "Corporate Services": CORPORATE_SERVICES_SCHEMA,
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
