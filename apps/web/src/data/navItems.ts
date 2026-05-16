import {
  LayoutDashboard,
  Store,
  Compass,
  CalendarDays,
  Inbox,
  User,
  Settings,
  LifeBuoy,
  Wand2,
  Home,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  /** i18n key resolved by the rendering component via useTranslation. */
  labelKey: string;
  path: string;
  icon: LucideIcon;
}

// Sidebar layout philosophy: keep the main nav at ≤10 items so the
// sidebar fits in one viewport and the most-used surfaces are one
// click away. Related pages get reached via in-page <SubNavTabs>
// strips on the destination, not by adding more sidebar entries.
//
// Direct URLs to the "hidden" pages (e.g. /customer/seating) still
// resolve — we just don't repeat them in the sidebar.

// Host portal nav — strict mirror of apps/host-mobile/app/(host)/_layout.tsx.
// Mobile exposes exactly four primary tabs (Explore / Inbox / Events /
// Profile) plus Settings reached from the Profile screen. The web
// sidebar matches.
export const customerNavItems: NavItem[] = [
  { labelKey: "sidebar.customer.explore", path: "/customer/explore", icon: Compass },
  { labelKey: "sidebar.customer.inquiries", path: "/customer/inquiries", icon: Inbox },
  { labelKey: "sidebar.customer.events", path: "/customer/events", icon: CalendarDays },
  { labelKey: "sidebar.customer.profile", path: "/customer/profile", icon: User },
];

export const customerNavBottomItems: NavItem[] = [
  { labelKey: "sidebar.bottom.support", path: "/support", icon: LifeBuoy },
  { labelKey: "sidebar.bottom.settings", path: "/settings", icon: Settings },
];

export const vendorNavItems: NavItem[] = [
  { labelKey: "sidebar.vendor.dashboard", path: "/vendor/dashboard", icon: LayoutDashboard },
  // Home hub — global feed (posts/reels/buzz) + composers, mirroring
  // the vendor mobile Home tab.
  { labelKey: "sidebar.vendor.home", path: "/vendor/home", icon: Home },
  // Inbox hub — sub-tabs: Inquiries (default), Hosts (DMs), Partners
  // (vendor-to-vendor). The standalone Messages entry merged in here.
  { labelKey: "sidebar.vendor.inbox", path: "/vendor/inbox", icon: Inbox },
  // Calendar hub — sub-tabs: Appointments, Availability
  { labelKey: "sidebar.vendor.calendar", path: "/vendor/appointments", icon: CalendarDays },
  // Profile — the vendor's IG-style identity surface (posts, reels,
  // buzz, listings, edit identity). Replaces the old separate
  // "Profile (listing builder)" entry under Calendar — that page is
  // now reached from the Edit listing CTA on this profile.
  { labelKey: "sidebar.vendor.my_profile", path: "/vendor/me", icon: User },
  // Studio hub — image editor + AI agent (auto-reply, lead qualifying).
  { labelKey: "sidebar.vendor.studio", path: "/vendor/studio", icon: Wand2 },
];

export const vendorNavBottomItems: NavItem[] = [
  { labelKey: "sidebar.bottom.support", path: "/support", icon: LifeBuoy },
  { labelKey: "sidebar.bottom.settings", path: "/settings", icon: Settings },
];

// Lookup map so DashboardSidebar can find the bottom items without
// every page having to pass them explicitly. Keyed by reference on
// the main nav array, so importing customerNavItems automatically
// gives you the bottom group too.
const NAV_BOTTOMS = new WeakMap<NavItem[], NavItem[]>();

export function getBottomNav(main: NavItem[]): NavItem[] | undefined {
  return NAV_BOTTOMS.get(main);
}

NAV_BOTTOMS.set(customerNavItems, customerNavBottomItems);
NAV_BOTTOMS.set(vendorNavItems, vendorNavBottomItems);
