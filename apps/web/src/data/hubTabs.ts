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
// Tab names are shown in the visitor's language via labelKey ("portal"
// namespace); label is the English fallback.
export const VENDOR_INBOX_HUB_TABS: SubNavTab[] = [
  { label: "Inquiries", labelKey: "hub_tabs.inquiries", to: "/vendor/inbox" },
  { label: "Vendors", labelKey: "hub_tabs.vendors", to: "/vendor/partners" },
];
