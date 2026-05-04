// Public-facing changelog entries. Add a new item at the TOP of the
// list when you ship something user-visible. Keep titles short (≤60
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
    date: "2026-05-04",
    category: "feature",
    title: "Inner-circle VIP portal",
    description:
      "Hosts can invite co-hosts, family, the wedding party, or any other VIPs to a private event portal — restricted view of schedule, vendor contacts, group gifts, registry, and assigned tasks. Works for any event type.",
  },
  {
    date: "2026-05-04",
    category: "feature",
    title: "Vendor-to-vendor messaging",
    description:
      "Vendors can DM each other directly to coordinate on shared events — photographer to planner, florist to DJ — without looping the host into every detail.",
  },
  {
    date: "2026-05-04",
    category: "improvement",
    title: "Cleaner sidebars",
    description:
      "Customer + vendor dashboards now top out at 10 sidebar items. Related pages live behind in-page tab strips on a hub destination — same surface area, much calmer to scan.",
  },
  {
    date: "2026-05-04",
    category: "feature",
    title: "Day-of staffing marketplace",
    description:
      "New /staffing directory for hourly-billed vendors: bartenders, waitstaff, security, valet, day-of coordinators. Hourly rates and minimum hours visible up front.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Two-factor authentication + social sign-in",
    description:
      "Optional TOTP 2FA in Settings (works with Authy, 1Password, Google Authenticator). Login + signup pages now offer Google and Apple sign-in.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "First-run onboarding tour",
    description:
      "A 4-step popover on first dashboard visit walks new hosts and vendors through the highest-leverage surfaces. Dismissable, never re-shown.",
  },
  {
    date: "2026-05-03",
    category: "security",
    title: "Admin audit log",
    description:
      "Every admin action that touches another user's data — verify a vendor, hide a review, resolve a ticket — gets logged and surfaced at /admin/audit.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Customer support inbox",
    description:
      "Built-in ticket flow at /support for both hosts and vendors. Admin queue at /admin/support with status filters and threaded replies.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Planner agency workspace",
    description:
      "Wedding planners managing multiple clients now have /planner — every event they collaborate on, with quick stats and one-click switch.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Auto-generated video meeting links",
    description:
      "Every appointment now ships with a Jitsi room link out of the box. Vendors connected to Google Calendar get an upgraded Google Meet link automatically.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Background-check verification",
    description:
      "Fourth verification kind alongside identity, insurance, and business license. Critical for in-home vendors (photographers, planners, in-home chefs).",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Bulk vendor import for admins",
    description:
      "Paste a CSV at /admin/vendors → invite emails go out + skeleton vendor profiles get created. Up to 200 rows per import.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Saved-search email alerts",
    description:
      "Opt in per saved search and get an email when new vendors match. In-app stays the default; email is one switch away.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Google Calendar sync (in + out)",
    description:
      "Connect your personal calendar from Settings. Busy events block Vendora availability automatically; accepted appointments push to Google Calendar with Meet links.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Cross-sell vendor recommendations",
    description:
      "\"Often booked with\" rails on vendor profiles + \"You might also love\" on the customer dashboard, driven by real co-booking signal.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Vendor profile completeness score",
    description:
      "Vendor dashboard now shows a 0-100 score with the next three highest-impact fields to fill in. 12 weighted checks behind the scenes.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Anniversary re-engagement campaigns",
    description:
      "Daily scan finds past clients with a 1-, 2-, or 5-year anniversary 30 days out and emails the vendor a one-click re-engagement nudge.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Multi-language with auto-detect (Spanish first)",
    description:
      "Public surfaces translate based on browser/OS language. Spanish ships first; manual override in Settings.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Event microsite for guests",
    description:
      "One branded URL hosts share with their guests — countdown, story, schedule, RSVP, registry, group gifts, gallery. Six theme palettes.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Shared photo albums",
    description:
      "Photographers + videographers deliver HD originals via /album/<token>. Hosts and guests can browse + download. Counts as social proof on the vendor profile.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Real-event galleries",
    description:
      "Vendors turn completed bookings into editorial /real-events pages. Doubles as social proof, SEO, and a viral loop.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "PWA + push notifications",
    description:
      "Install Vendora to your phone home screen. Get pushed when an inquiry, message, or proposal lands — even with the tab closed.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Trust verification badges",
    description:
      "Vendors can submit identity, insurance, and business-license documents to admin review. Approved kinds surface as visible badges on profiles + listing cards.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Vendor analytics + peer benchmarks",
    description:
      "30/90-day funnel, daily profile-view sparkline, and a card comparing reply time + booking rate + inquiries against the median for vendors in the same category.",
  },
  {
    date: "2026-05-03",
    category: "feature",
    title: "Host reputation signals for vendors",
    description:
      "Vendors see a cross-vendor reliability snapshot on every host's inquiry — response rate, booking rate, account age, vendor flags.",
  },
  {
    date: "2026-05-03",
    category: "improvement",
    title: "Programmatic SEO depth",
    description:
      "New /vendors/in/:city pages, enriched category pages with FAQ blocks, ItemList + FAQPage JSON-LD, dense internal linking. Sitemap surfaces all of it.",
  },
  {
    date: "2026-05-03",
    category: "improvement",
    title: "Faster page loads",
    description:
      "Prefetch lazy chunks on link hover + viewport. AVIF/WebP responsive images on the landing page (~92% reduction on initial payload). Eager-load above-the-fold cards.",
  },
];
