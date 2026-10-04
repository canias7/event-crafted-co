// The seven browse categories: photo tiles on the vendors page and the
// category menu in Explore. Each is a set of sub-categories (the DB
// stores sub names). Edit here so both pages stay in step.
import { CATEGORY_GROUPS } from "@/data/categoryTaxonomy";

const subsOf = (slug: string) =>
  CATEGORY_GROUPS.find((g) => g.slug === slug)?.subs ?? [];

export const BROWSE_CATEGORIES: { label: string; subs: string[] }[] = [
  { label: "Photography", subs: subsOf("media") },
  { label: "Venues", subs: subsOf("venues") },
  { label: "Catering", subs: subsOf("food-beverage") },
  { label: "Beauty", subs: ["Beauty", "Grooming Services"] },
  { label: "Planning", subs: ["Event Coordinators"] },
  { label: "Decor & florals", subs: ["Florists", "Decor Rentals"] },
  { label: "Entertainment", subs: subsOf("entertainment") },
];
