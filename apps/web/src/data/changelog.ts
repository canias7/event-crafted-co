// Public-facing changelog entries. Add a new item at the TOP of the
// list when you ship something user-visible, and take an entry out
// when its feature is removed (Oct 2026: entries for the event
// website builder, planner workspace, saved searches and other
// retired features came out). Keep titles short (≤60
// chars) and descriptions to one or two sentences — the tone is
// "things you'll notice," not engineering specifics.
//
// Each entry's words live in every language's changelog.json
// (locales/en/, locales/es/ and locales/ru/), under entries.<id>.title
// and entries.<id>.description. A new entry needs its id here and its
// title + description in each file; take them all out together.
//
// Categories:
//   feature  — new surface, new capability
//   improvement — existing thing got better
//   fix — bug killed
//   security — security-related ship

export type ChangelogCategory = "feature" | "improvement" | "fix" | "security";

export interface ChangelogEntry {
  /** Key of the entry's title and description: entries.<id> in changelog.json. */
  id: string;
  date: string; // YYYY-MM-DD
  category: ChangelogCategory;
}

export const CHANGELOG: ChangelogEntry[] = [
  { id: "russian", date: "2026-10-07", category: "feature" },
  { id: "explore_redesigned", date: "2026-10-04", category: "improvement" },
  { id: "vendors_page_look", date: "2026-10-04", category: "improvement" },
  { id: "host_vendor_pages", date: "2026-10-04", category: "feature" },
  { id: "how_it_works", date: "2026-10-03", category: "feature" },
  { id: "one_look", date: "2026-10-03", category: "improvement" },
  { id: "listing_drafts", date: "2026-10-03", category: "feature" },
  { id: "block_several_days", date: "2026-10-01", category: "feature" },
  { id: "unanswered_badge", date: "2026-09-15", category: "improvement" },
  { id: "password_reset_links", date: "2026-08-23", category: "fix" },
  { id: "vendor_messaging", date: "2026-05-04", category: "feature" },
  { id: "verification_badges", date: "2026-05-03", category: "feature" },
  { id: "english_spanish", date: "2026-05-03", category: "feature" },
  { id: "city_category_pages", date: "2026-05-03", category: "improvement" },
  { id: "faster_page_loads", date: "2026-05-03", category: "improvement" },
];
