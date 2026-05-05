// Starter inquiry messages by (event_type, category). Lookup is
// cheap and copy is hand-tuned per pair — when neither matches we
// fall back to the event-type generic.
//
// We keep this in code (vs DB) because it's editorial — tweaking
// copy is faster as a code review than as a CMS edit. If the list
// grows past ~50 entries, promote to a DB table.

export type EventTypeKey =
  | "wedding"
  | "birthday"
  | "holiday_dinner"
  | "baby_shower"
  | "anniversary"
  | "corporate"
  | "other";

interface Starter {
  greeting: string;
  body: string;
}

const wedding: Record<string, Starter> = {
  Photographer: {
    greeting: "Hi! We're planning our wedding and you came up in our search.",
    body:
      "Looking for someone with a documentary / candid style — we're not big on heavily posed shots. " +
      "We'd love a 6-8 hour package covering getting-ready through the first hour of the reception. " +
      "Could you share a sample gallery from a similar wedding + a starting price?",
  },
  Videographer: {
    greeting: "Hi! Putting together our wedding vendor team and would love to chat.",
    body:
      "We're after a highlight reel (3-5 min) plus a longer ceremony cut. Cinematic but not over-edited. " +
      "Can you share recent samples + your typical package + whether you offer drone or super 8?",
  },
  Florist: {
    greeting: "Hi! We're getting married and your work caught our eye.",
    body:
      "We're going for a loose, garden-y feel — lots of greenery, neutrals + soft palette. " +
      "Need bouquets (1 bridal, 4 bridesmaids), 6 boutonnières, ceremony arch, and 12 reception centerpieces. " +
      "Could you share a starting cost + your minimum?",
  },
  Catering: {
    greeting: "Hi! Looking for a caterer for our wedding.",
    body:
      "Family-style or buffet (open to either), seasonal menu, focus on locally-sourced. " +
      "We'll need bar service too. Curious about your per-head pricing tiers + sample menus.",
  },
  Venue: {
    greeting: "Hi! Looking for our wedding venue.",
    body:
      "Outdoor ceremony, indoor reception backup, accommodating ~120 guests. " +
      "Want somewhere we can bring our own caterer + bar. " +
      "Could you share availability for our date + a venue fee + what's included?",
  },
  DJ: {
    greeting: "Hi! Looking for a DJ for our wedding reception.",
    body:
      "Need ceremony processional/recessional, cocktail hour, and 4-hour reception. " +
      "Mix of pop / R&B / dance — can share our must-play list. " +
      "What's your fee + do you provide MC services?",
  },
};

const corporate: Record<string, Starter> = {
  Catering: {
    greeting: "Hi — sourcing catering for a corporate event.",
    body:
      "Plated lunch for ~80, dietary mix (vegetarian, GF). Mid-week date. " +
      "Need full service including setup, servers, and breakdown. " +
      "Could you share per-head + service charge + sample menus?",
  },
  Venue: {
    greeting: "Hi — booking a corporate offsite.",
    body:
      "1-day workshop, ~50 attendees, looking for a flexible space (breakouts + plenary). " +
      "AV included would be ideal. Can you share day rates + what AV/catering is bundled?",
  },
  Photographer: {
    greeting: "Hi — booking a corporate event photographer.",
    body:
      "Half-day coverage of our team summit. Need candid shots, group photos, " +
      "and a few branded portraits. Need a turnaround of ~5 days. " +
      "What's your half-day rate + delivery format?",
  },
};

const birthday: Record<string, Starter> = {
  Catering: {
    greeting: "Hi! Planning a milestone birthday.",
    body:
      "~40 guests, dinner party feel, would love a tasting menu or family-style. " +
      "Looking for someone who can also handle small bites + a custom cake. " +
      "What's your starting per-head?",
  },
  Photographer: {
    greeting: "Hi! Looking for a photographer for my birthday party.",
    body:
      "3-4 hours of coverage at a private dinner / party. " +
      "Candid + a few group shots. Could you share recent event work + your rate?",
  },
  DJ: {
    greeting: "Hi! Looking for a DJ for a birthday celebration.",
    body:
      "4-hour set, mix leans dance / hip-hop / 90s-2000s. " +
      "What's your fee + do you bring lighting?",
  },
};

const baby_shower: Record<string, Starter> = {
  Florist: {
    greeting: "Hi! Planning a baby shower.",
    body:
      "Soft, neutral palette (no pinks/blues — going gender-neutral). " +
      "Need 4-5 small arrangements for the dessert + gift tables. " +
      "Could you share a starting cost + minimum?",
  },
  Catering: {
    greeting: "Hi! Booking food for a baby shower.",
    body:
      "Brunch-style, ~25 guests, mix of hot and cold. Mocktails appreciated. " +
      "Could you share sample menus + per-head?",
  },
};

const STARTERS: Partial<Record<EventTypeKey, Record<string, Starter>>> = {
  wedding,
  corporate,
  birthday,
  baby_shower,
};

const GENERIC_BODY: Record<EventTypeKey, string> = {
  wedding:
    "We're planning a wedding and would love to learn more about your work. " +
    "Could you share a starting price + recent examples of similar weddings?",
  birthday:
    "I'm planning a birthday celebration and your work caught my eye. " +
    "Could you share a starting cost + a few examples of past events?",
  holiday_dinner:
    "Planning a holiday dinner and would love your help. " +
    "Could you share a starting cost + what's typically included?",
  baby_shower:
    "Putting together a baby shower and would love to chat about your work. " +
    "Could you share a starting cost + recent examples?",
  anniversary:
    "Celebrating an anniversary and looking for the right vendor. " +
    "Could you share a starting cost + recent examples?",
  corporate:
    "Sourcing for a corporate event. Could you share a typical " +
    "package + per-head or day rate?",
  other:
    "Planning an event and your work stood out. " +
    "Could you share what a starting package looks like?",
};

export function getInquiryStarter(
  eventType: EventTypeKey,
  category: string,
): { greeting: string; body: string } {
  const byCat = STARTERS[eventType];
  const hit = byCat?.[category];
  if (hit) return hit;
  return {
    greeting: "Hi!",
    body: GENERIC_BODY[eventType] ?? GENERIC_BODY.other,
  };
}

// Helper to build the full pre-filled message body for a multi-vendor
// blast. Multiple categories collapse to a single generic body.
export function buildBlastStarter(
  eventType: EventTypeKey,
  categories: string[],
): string {
  const distinct = Array.from(new Set(categories));
  if (distinct.length === 1) {
    return getInquiryStarter(eventType, distinct[0]).body;
  }
  return GENERIC_BODY[eventType] ?? GENERIC_BODY.other;
}
