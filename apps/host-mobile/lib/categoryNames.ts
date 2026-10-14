// Category names in the app's language (same strings as the website).
// Values saved to the database, filters and URLs stay English: pass the
// stored English name in, show what comes out.
import { translateObject, useT } from "@/lib/i18n";

export function useCategoryNames() {
  const { lang } = useT();
  const pick = (path: string, fallback: string) => {
    const v = translateObject<unknown>(`categories.${path}`, lang);
    return typeof v === "string" ? v : fallback;
  };
  return {
    /** A sub-category as stored on a listing, e.g. "Decor Rentals". */
    sub: (name: string) => {
      const subs = translateObject<Record<string, string>>("categories.subs", lang) ?? {};
      return subs[name] ?? name;
    },
    /** A group's name, by its slug ("design-decor"). */
    group: (slug: string, fallback = slug) => pick(`groups.${slug}.name`, fallback),
    /** A "Browse by category" label ("Decor & florals"). */
    browse: (label: string) => {
      const browse = translateObject<Record<string, string>>("categories.browse", lang) ?? {};
      return browse[label] ?? label;
    },
    all: pick("all", "All categories"),
  };
}
