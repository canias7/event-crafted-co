// Sub-nav tab groups for each consolidated nav hub. Each page in a
// hub imports its group and renders <SubNavTabs tabs={...} /> at the
// top so the user can move between siblings without going back to the
// sidebar.

import type { SubNavTab } from "@/components/shared/SubNavTabs";

// ─── Vendor hubs ───
// (Customer hubs were removed when the host portal was mirrored to
// mobile — mobile inbox / events / profile have no sub-tabs.)

// Inbox hub — two surfaces sharing one tab strip, mirroring vendor
// mobile inbox (inquiries / partners). The "Hosts" tab (no-inquiry
// host DMs) was dropped along with VendorMessagesPage and the
// find_or_create_direct_thread RPC — host → vendor messaging always
// goes through an inquiry now.
export const VENDOR_INBOX_HUB_TABS: SubNavTab[] = [
  { label: "Inquiries", to: "/vendor/inbox" },
  { label: "Partners", to: "/vendor/partners" },
];

// Old name kept as an alias so VendorPartnersPage's existing import
// keeps working without a churn-y rename.
export const VENDOR_MESSAGES_HUB_TABS = VENDOR_INBOX_HUB_TABS;

export const VENDOR_CALENDAR_HUB_TABS: SubNavTab[] = [
  { label: "Appointments", to: "/vendor/appointments" },
  { label: "Availability", to: "/vendor/availability" },
];
