// Public-facing changelog entries. Add a new item at the TOP of the
// list when you ship something user-visible, and take an entry out
// when its feature is removed (Oct 2026: entries for the event
// website builder, planner workspace, saved searches and other
// retired features came out). Keep titles short (≤60
// chars) and descriptions to one or two sentences — the tone is
// "things you'll notice," not engineering specifics.
//
// Categories:
//   feature  — new surface, new capability
//   improvement — existing thing got better
//   fix — bug killed
//   security — security-related ship

export type ChangelogCategory = "feature" | "improvement" | "fix" | "security";

export interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  category: ChangelogCategory;
  title: string;
  description: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-10-04",
    category: "improvement",
    title: "Explore, redesigned",
    description:
      "Browse vendors' work in a two-column gallery, watch reels one at a time, and find every vendor and the ones you've saved, all from one page.",
  },
  {
    date: "2026-10-04",
    category: "improvement",
    title: "A new look for the vendors page",
    description:
      "Browse by category with photo tiles, keep your filters in view while you scroll, and see each vendor in a taller card.",
  },
  {
    date: "2026-10-04",
    category: "feature",
    title: "Pages for hosts and for vendors",
    description:
      "What Vendora does for someone planning an event, and what it does for event businesses, each have their own page now. The home page is simpler.",
  },
  {
    date: "2026-10-03",
    category: "feature",
    title: "How it works, step by step",
    description:
      "A new page walks hosts and vendors through Vendora, from the first search or listing to a confirmed booking.",
  },
  {
    date: "2026-10-03",
    category: "improvement",
    title: "One look across the website and apps",
    description:
      "Libre Baskerville for every word, one set of colours, gold buttons and flat cards, the same on the website and in both apps.",
  },
  {
    date: "2026-10-03",
    category: "feature",
    title: "Save a listing as a draft",
    description:
      "Vendors can save a listing part-way through and come back to finish it later.",
  },
  {
    date: "2026-10-01",
    category: "feature",
    title: "Block several days at once",
    description:
      "In the vendor app's calendar, pick any set of days and block them in one go.",
  },
  {
    date: "2026-09-15",
    category: "improvement",
    title: "Unanswered inquiries at a glance",
    description:
      "The Inbox tab in the vendor app shows a badge with how many inquiries are waiting for a reply.",
  },
  {
    date: "2026-08-23",
    category: "fix",
    title: "Password reset links work again",
    description:
      "The reset link in the email no longer says it has expired when it hasn't.",
  },
  {
    date: "2026-05-04",
    category: "feature",
    title: "Vendor-to-vendor messaging",
    description:
      "Vendors can message each other directly to coordinate on shared events, photographer to planner or florist to DJ, without looping in the host.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Verification badges",
    description:
      "Vendors can send identity, insurance and business-licence documents for review. Approved checks show as badges on their profile and cards.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "English and Spanish",
    description:
      "The website follows your browser's language, in English or Spanish, and you can switch at the bottom of any page.",
  },
  {
    date: "2026-05-03",
    category: "improvement",
    title: "City and category pages",
    description:
      "Every city with vendors has its own page, and category pages answer the questions people ask most.",
  },
  {
    date: "2026-05-03",
    category: "improvement",
    title: "Faster page loads",
    description:
      "Photos come in smaller, modern formats, and the next page starts loading as soon as you point at its link.",
  },
];
