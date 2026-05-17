import {
  Compass,
  CalendarDays,
  Inbox,
  User,
  Settings,
  Sparkles,
  CreditCard,
  Images,
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
  { labelKey: "sidebar.bottom.settings", path: "/settings", icon: Settings },
];

export const vendorNavItems: NavItem[] = [
  // Home hub — global feed (posts/reels/buzz) + composers, mirroring
  // the vendor mobile Home tab. Acts as the vendor's primary landing
  // (the old separate Dashboard entry was removed — its KPIs live in
  // the Profile page now).
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
  // Three forward-looking tools that used to live under a single
  // "Studio" tab. Each ships as a Coming Soon placeholder for now;
  // sidebar entries exist so the future work has stable URLs.
  { labelKey: "sidebar.vendor.ai_superagents", path: "/vendor/ai-superagents", icon: Sparkles },
  { labelKey: "sidebar.vendor.pay", path: "/vendor/pay", icon: CreditCard },
  { labelKey: "sidebar.vendor.gallery", path: "/vendor/gallery", icon: Images },
];

export const vendorNavBottomItems: NavItem[] = [
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

// Cross-cutting pages like /settings and /support don't know which
// dashboard the user came from — without this, they default to the
// vendor sidebar whenever the user has vendor access, even if they
// were just browsing /customer/*. Side-stable sessionStorage flag
// flipped by DashboardSidebar lets these pages stay on the right rail.
type Side = "host" | "vendor";
const SIDE_KEY = "vendora.lastDashboardSide";

export function setLastDashboardSide(side: Side) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SIDE_KEY, side);
  } catch {
    /* private mode / quota — ignore */
  }
}

export function getLastDashboardSide(): Side | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(SIDE_KEY);
    return v === "host" || v === "vendor" ? v : null;
  } catch {
    return null;
  }
}

export function pickNavForSide(side: Side): NavItem[] {
  return side === "vendor" ? vendorNavItems : customerNavItems;
}
