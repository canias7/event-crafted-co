import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

// Category names in the visitor's language. The database and the URLs
// keep the English sub-category names and group slugs; only what's
// shown is translated (locales/<language>/categories.json).

/** For components: names that update when the language changes. */
export function useCategoryNames() {
  const { t } = useTranslation("categories");
  return {
    /** A sub-category as stored on a listing, e.g. "Decor Rentals". */
    sub: (name: string) => t(`subs.${name}`, { defaultValue: name }),
    /** A group's name, by its slug ("design-decor"). */
    group: (slug: string, fallback = slug) => t(`groups.${slug}.name`, { defaultValue: fallback }),
    groupDescription: (slug: string, fallback = "") =>
      t(`groups.${slug}.description`, { defaultValue: fallback }),
    groupLongCopy: (slug: string, fallback = "") => t(`groups.${slug}.longCopy`, { defaultValue: fallback }),
    /** A "Browse by category" tile or Explore menu label ("Decor & florals"). */
    browse: (label: string) => t(`browse.${label}`, { defaultValue: label }),
    /** "All categories". */
    all: t("all"),
  };
}

/** Outside components (page titles, toasts): a sub-category's name now. */
export function categoryName(sub: string): string {
  return i18n.t(`subs.${sub}`, { ns: "categories", defaultValue: sub });
}
