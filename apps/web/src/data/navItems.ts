import {
  Compass,
  CalendarDays,
  Inbox,
  User,
  Settings,
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
  // Settings used to live in a separate "bottom" group; pulled into
  // the main nav so the sidebar has one continuous list.
  { labelKey: "sidebar.bottom.settings", path: "/settings", icon: Settings },
];

export const vendorNavItems: NavItem[] = [
  // Inbox hub — sub-tabs: Inquiries (default), Hosts (DMs), Partners
  // (vendor-to-vendor). The standalone Messages entry merged in here.
  // (Vendor Home — global feed + composers — removed: vendors land on
  // /vendor/me now, and the global feed lives only on the host side.)
  { labelKey: "sidebar.vendor.inbox", path: "/vendor/inbox", icon: Inbox },
  // Calendar — single page that surfaces both upcoming appointments
  // (inquiries with event_date set) and the per-day block-out grid for
  // marking dates unavailable.
  { labelKey: "sidebar.vendor.calendar", path: "/vendor/appointments", icon: CalendarDays },
  // Profile — the vendor's IG-style identity surface (posts, reels,
  // buzz, listings, edit identity). Replaces the old separate
  // "Profile (listing builder)" entry under Calendar — that page is
  // now reached from the Edit listing CTA on this profile.
  { labelKey: "sidebar.vendor.my_profile", path: "/vendor/me", icon: User },
  // Settings — pulled out of the separate bottom group so the rail
  // reads as one continuous list. Log out lives on /settings now.
  //
  // Three forward-looking "Studio" tools — AI Superagents, Vendora
  // Pay, Gallery — used to live here as sidebar entries pointing at
  // Coming Soon placeholders. Hidden until they have content so
  // vendors don't think the portal is half-built; the routes still
  // resolve directly (App.tsx) for anyone who has a deep link.
  { labelKey: "sidebar.bottom.settings", path: "/settings", icon: Settings },
];

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
