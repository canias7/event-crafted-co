// Per-listing dot palette for the account calendar grid and any legend
// that explains its colors. Shared between the calendar (which paints the
// day-cell dots) and the appointments legend so the two never drift apart.
// Each listing gets a stable color by its index in the account's listing
// list; the palette cycles if there are more listings than colors.
export const LISTING_PALETTE = [
  "#18181b", // ink
  "#2563eb", // blue
  "#0a7c4a", // green
  "#9333ea", // purple
  "#d4a017", // gold
  "#db2777", // pink
  "#0891b2", // cyan
  "#b91c1c", // red
];

// Map listing ids → palette color by position. Callers pass the listing
// ids in the same order the calendar uses so colors line up everywhere.
export function listingColorMap(ids: string[]): Map<string, string> {
  const m = new Map<string, string>();
  ids.forEach((id, i) => m.set(id, LISTING_PALETTE[i % LISTING_PALETTE.length]));
  return m;
}
