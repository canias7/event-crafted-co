// Bidirectional slug ↔ city-label conversion. We keep slugs URL-friendly
// (lowercase, hyphenated, no commas) and reconstruct the canonical
// "Brooklyn, NY" label from the slug for display.

export function citySlugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Best-effort inverse — joins last 2-letter token with comma+space if it
// looks like a US state code. "brooklyn-ny" → "Brooklyn, NY".
export function citySlugDisplay(slug: string): string {
  const parts = slug.split("-").filter(Boolean);
  if (parts.length === 0) return slug;
  const last = parts[parts.length - 1];
  const isStateCode = last.length === 2;
  const cityWords = (isStateCode ? parts.slice(0, -1) : parts).map(
    (w) => w.charAt(0).toUpperCase() + w.slice(1),
  );
  if (isStateCode && cityWords.length > 0) {
    return `${cityWords.join(" ")}, ${last.toUpperCase()}`;
  }
  return cityWords.join(" ") || slug;
}
