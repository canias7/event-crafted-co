// Vendor-facing changelog — the same content on every surface.
//
// SHIPPED gets a new entry whenever something vendor-visible lands;
// COMING is a light teaser list, kept vague on purpose (no dates, no
// promises). Lives here rather than in either app so the phone and the
// website can never show a different release history.
//
// Adding an entry: prepend to SHIPPED and bump LATEST_UPDATE_AT — the
// "New" badge keys off that date.

export interface ShippedUpdate {
  /** Display-only, e.g. "August 2026". */
  date: string;
  title: string;
  body: string;
}

/** Newest first. */
export const SHIPPED: ShippedUpdate[] = [
  {
    date: "August 2026",
    title: "Get verified — for real this time",
    body: "Pro and Premium vendors can now apply for the verified badge from More → Verification: confirm your identity, add your business info and documents, and our team reviews within 1–3 business days. Approved vendors get the badge on their public profile — plus an Insured marker when a certificate is on file.",
  },
  {
    date: "August 2026",
    title: "Vendora CRM — your client book",
    body: "Pro and Premium vendors get a Clients section under More: every host who's inquired, their events, private notes, and follow-up reminders that ping your phone.",
  },
  {
    date: "August 2026",
    title: "Smart Scheduling & Automations",
    body: "Set your working hours and appointment types in minutes. Pro unlocks the scheduling controls — hours, buffers, minimum notice, daily limits, and up to 5 appointment types. Premium adds the automations: instant inquiry replies, confirmations, reminders, follow-ups, review requests, and Fill Your Calendar alerts — promos only go out with your approval.",
  },
  {
    date: "August 2026",
    title: "A listing form made for your category",
    body: "Venues, catering, entertainment, media, design, beauty, rentals, experiences, corporate services — every category now gets its own tailored Create Listing flow, with custom fields you can add yourself.",
  },
  {
    date: "August 2026",
    title: "A fresh Vendora look",
    body: "Inbox, Gallery, Profile, Calendar, and More all moved to the warm cream design — serif titles, gold accents, and matching dialogs everywhere.",
  },
  {
    date: "August 2026",
    title: "Better control over your listings",
    body: "Delete a listing from anywhere (even while it's under review), save drafts, and get notified by email — and push — when a decision is made.",
  },
];

export const COMING: string[] = [
  "Pop-up notifications on Android",
  "More ways to stand out in search",
  "Host app launch",
  "Design updates on the website",
];

/** Bump when adding a SHIPPED entry — drives the "New" badge. */
export const LATEST_UPDATE_AT = "2026-08-19";

/** True while the newest entry is under three weeks old. */
export function hasFreshUpdate(): boolean {
  const ms = Date.now() - new Date(LATEST_UPDATE_AT).getTime();
  return ms < 21 * 24 * 3600_000;
}
