// Number / currency formatters shared between web + mobile so the
// same dollar amount on the dashboard, the inbox, and the listing
// preview always reads identically. Pure functions, no DOM.

/** "$1,250" or "—" for null. Cents in, formatted dollars out. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

/** Compact currency for cramped chart axes: "$1.5k" / "$1.2M" / "$450". */
export function formatCentsCompact(cents: number): string {
  if (cents <= 0) return "—";
  if (cents >= 100_000_00) {
    return `$${(Math.round(cents / 100_000) / 10).toFixed(1)}M`;
  }
  if (cents >= 1_000_00) return `$${(cents / 100_000).toFixed(1)}k`;
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

/** "1,234" / "1.2K" / "1.2M" — for impression / view counts. */
export function formatCount(n: number): string {
  if (n < 1_000) return n.toLocaleString();
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** The ways a vendor can price a listing (multi-select). */
export type PricingModel =
  | "fixed_packages"
  | "hourly"
  | "per_person"
  | "starting_at"
  | "custom_quote";

export const PRICING_MODELS: PricingModel[] = [
  "fixed_packages",
  "hourly",
  "per_person",
  "starting_at",
  "custom_quote",
];

export const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  fixed_packages: "Fixed Packages",
  hourly: "Hourly",
  per_person: "Per Person",
  starting_at: "Starting At",
  custom_quote: "Custom Quote",
};

/** "Fixed Packages · Per Person" — the human label for a listing's models. */
export function pricingModelsLabel(models?: string[] | null): string {
  if (!models || models.length === 0) return "";
  return models
    .map((m) => PRICING_MODEL_LABELS[m as PricingModel] ?? m)
    .join(" · ");
}

// inquiries.event_type is a lowercase, underscored enum in Postgres
// (see the inquiries_event_type_check constraint). It is never fit to
// show a user: raw it reads "wedding", and "holiday_dinner" keeps its
// underscore. Every surface was formatting it by hand and disagreeing —
// a bare value in the mobile inbox, .replace("_"," ") in three web
// files, titleCase in the host events tab (which produces
// "Holiday_dinner"), and two different capitalise-the-first-letter
// expressions. This is the one place that decides.
export type EventType = "wedding" | "birthday" | "holiday_dinner" | "other";

export const EVENT_TYPES: EventType[] = [
  "wedding",
  "birthday",
  "holiday_dinner",
  "other",
];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  holiday_dinner: "Holiday Dinner",
  other: "Other",
};

/**
 * "Holiday Dinner" — the human label for an inquiry's event type.
 * Falls back to de-underscoring and capitalising anything unrecognised,
 * so a value added to the DB before this map still reads acceptably.
 */
export function eventTypeLabel(
  type?: string | null,
  fallback = "Event",
): string {
  const t = type?.trim();
  if (!t) return fallback;
  const known = EVENT_TYPE_LABELS[t as EventType];
  if (known) return known;
  return t
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

/**
 * Typical price RANGE for a listing:
 *   - both → "$500 – $2,000" (or "$500" when min === max)
 *   - min  → "From $500"
 *   - max  → "Up to $2,000"
 *   - none → "" (caller decides, e.g. "Custom pricing")
 */
export function formatPriceRange(
  minCents: number | null | undefined,
  maxCents: number | null | undefined,
): string {
  const hasMin = minCents != null && minCents > 0;
  const hasMax = maxCents != null && maxCents > 0;
  if (hasMin && hasMax) {
    return minCents === maxCents
      ? dollars(minCents as number)
      : `${dollars(minCents as number)} – ${dollars(maxCents as number)}`;
  }
  if (hasMin) return `From ${dollars(minCents as number)}`;
  if (hasMax) return `Up to ${dollars(maxCents as number)}`;
  return "";
}

/**
 * Canonical price label shown to customers everywhere. Falls back to
 * "Custom pricing" when there's no usable range (custom-quote listings).
 */
export function formatListingPrice(
  minCents: number | null | undefined,
  maxCents: number | null | undefined,
): string {
  return formatPriceRange(minCents, maxCents) || "Custom pricing";
}
