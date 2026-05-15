// Sub-nav tab groups for each consolidated nav hub. Each page in a
// hub imports its group and renders <SubNavTabs tabs={...} /> at the
// top so the user can move between siblings without going back to the
// sidebar.

import type { SubNavTab } from "@/components/shared/SubNavTabs";

// ─── Vendor hubs ───
// (Customer hubs were removed when the host portal was mirrored to
// mobile — mobile inbox / events / profile have no sub-tabs.)

// Inbox hub — three surfaces sharing one tab strip:
//   - Inquiries: structured leads (the table view at /vendor/inbox)
//   - Hosts: casual host DMs at /vendor/messages
//   - Partners: vendor-to-vendor coordination at /vendor/partners
// Inquiries comes first because it's the highest-signal surface and
// the sidebar entry now lands the user there by default.
export const VENDOR_INBOX_HUB_TABS: SubNavTab[] = [
  { label: "Inquiries", to: "/vendor/inbox" },
  { label: "Hosts", to: "/vendor/messages", exact: true },
  { label: "Partners", to: "/vendor/partners" },
];

// Old name kept as an alias so any in-flight imports don't break
// during the merge — both existing callers (VendorMessagesPage,
// VendorPartnersPage) get the new three-tab strip automatically.
export const VENDOR_MESSAGES_HUB_TABS = VENDOR_INBOX_HUB_TABS;

export const VENDOR_CALENDAR_HUB_TABS: SubNavTab[] = [
  { label: "Appointments", to: "/vendor/appointments" },
  { label: "Availability", to: "/vendor/availability" },
];
