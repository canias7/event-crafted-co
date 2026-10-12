// Title-case a vendor's free-text location: "brooklyn, ny" → "Brooklyn, NY".
// Used to group vendors by city on the Vendors page.
export function normalizeLocation(loc: string): string {
  const parts = loc
    .trim()
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  const titleCase = (s: string) =>
    s
      .split(" ")
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(" ");
  if (parts.length === 1) return titleCase(parts[0]);
  const state = parts[1].length === 2 ? parts[1].toUpperCase() : parts[1];
  return `${titleCase(parts[0])}, ${state}`;
}
