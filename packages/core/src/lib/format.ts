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

/** How a vendor prices a listing. */
export type PricingType = "flat" | "hourly" | "custom";

/**
 * Canonical price label for a vendor listing, shared by web + both mobile
 * apps so a listing reads identically everywhere:
 *   - flat   → "$500"
 *   - hourly → "$100/hour"
 *   - custom → "Custom pricing" (no number)
 * base_price_cents holds the flat price or the hourly rate; it is null for
 * custom. Returns "" for flat/hourly when no amount is set, so callers can
 * decide whether to render anything.
 */
export function formatListingPrice(
  pricingType: PricingType | string | null | undefined,
  baseCents: number | null | undefined,
): string {
  if (pricingType === "custom") return "Custom pricing";
  if (baseCents == null || baseCents <= 0) return "";
  const amount = `$${Math.round(baseCents / 100).toLocaleString()}`;
  return pricingType === "hourly" ? `${amount}/hour` : amount;
}
