// Sub-nav tab groups for each consolidated nav hub. Each page in a
// hub imports its group and renders <SubNavTabs tabs={...} /> at the
// top so the user can move between siblings without going back to the
// sidebar.

import type { SubNavTab } from "@/components/shared/SubNavTabs";

// ─── Customer hubs ───

export const VENDORS_HUB_TABS: SubNavTab[] = [
  { label: "Browse", to: "/customer/vendors", exact: true },
  { label: "Favorites", to: "/customer/favorites" },
  { label: "Saved searches", to: "/customer/saved-searches" },
];

export const INQUIRIES_HUB_TABS: SubNavTab[] = [
  { label: "Inquiries", to: "/customer/inquiries", exact: true },
  { label: "Send to many", to: "/customer/inquiry-blast" },
];

export const EVENT_HUB_TABS: SubNavTab[] = [
  { label: "Details", to: "/customer/event" },
  { label: "Day-of timeline", to: "/customer/timeline" },
  { label: "Microsite", to: "/customer/microsite" },
];

export const GUESTS_HUB_TABS: SubNavTab[] = [
  { label: "Guests", to: "/customer/guests" },
  { label: "Seating", to: "/customer/seating" },
];

export const PLANNING_HUB_TABS: SubNavTab[] = [
  { label: "Tasks", to: "/customer/tasks" },
  { label: "Checklist", to: "/customer/checklist" },
  { label: "Team", to: "/customer/planning-team" },
  { label: "Planner workspace", to: "/planner" },
];

export const INSPIRATION_HUB_TABS: SubNavTab[] = [
  { label: "Mood boards", to: "/customer/moodboards" },
  { label: "Invitations", to: "/customer/invitations" },
];

export const GIFTS_HUB_TABS: SubNavTab[] = [
  { label: "Registry", to: "/customer/registry" },
  { label: "Group gifts", to: "/customer/gifts" },
];

// ─── Vendor hubs ───

export const VENDOR_MESSAGES_HUB_TABS: SubNavTab[] = [
  { label: "Hosts", to: "/vendor/messages", exact: true },
  { label: "Partners", to: "/vendor/partners" },
];

export const VENDOR_CALENDAR_HUB_TABS: SubNavTab[] = [
  { label: "Appointments", to: "/vendor/appointments" },
  { label: "Availability", to: "/vendor/availability" },
];

// Profile = vendor identity / account-level (business name, category,
// public URL slug, social handles, verification). Listing = the
// customer-facing surface that shows on the public vendor page (bio,
// location, pricing, packages, photos, team, availability, etc.).
export const VENDOR_PROFILE_HUB_TABS: SubNavTab[] = [
  { label: "Profile", to: "/vendor/profile", exact: true },
  { label: "Listing", to: "/vendor/listing" },
];

export const VENDOR_LIBRARY_HUB_TABS: SubNavTab[] = [
  { label: "Message templates", to: "/vendor/templates" },
  { label: "Contracts", to: "/vendor/contracts" },
];
