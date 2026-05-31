import {
  Briefcase,
  CalendarDays,
  Compass,
  Crown,
  Gauge,
  Images,
  Inbox,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  /** i18n key resolved by the rendering component via useTranslation. */
  labelKey: string;
  /**
   * Route this item navigates to. Optional — items without a path
   * are section headers that only expand/collapse their children
   * (e.g. "My Vendora" → Leads / Calendar / VendoraPay).
   */
  path?: string;
  /** Optional — when omitted, the row renders as text only (no icon). */
  icon?: LucideIcon;
  /**
   * Optional sub-items rendered indented beneath this item in the
   * sidebar. When the parent has a `path` it stays navigable; when
   * it doesn't, the row only toggles the section open/closed.
   */
  children?: NavItem[];
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
  // Inbox hub — sub-tabs: Inquiries (default), Hosts (DMs), Partners.
  { labelKey: "sidebar.vendor.inbox", path: "/vendor/inbox", icon: Inbox },
  // My Vendora — single page that hosts Leads / Calendar /
  // VendoraPay as switchable tabs (see MyVendoraPage). The
  // standalone /vendor/leads, /vendor/appointments, /vendor/payments
  // routes still resolve for deep-links but no longer appear in the
  // sidebar — they're reached via the tab strip on the wrapper page.
  { labelKey: "sidebar.vendor.my_vendora", path: "/vendor/my-vendora", icon: Briefcase },
  // ---- Identity + creative tools ----
  { labelKey: "sidebar.vendor.my_profile", path: "/vendor/me", icon: User },
  { labelKey: "sidebar.vendor.my_space", path: "/vendor/ai-superagents" },
  { labelKey: "sidebar.vendor.gallery", path: "/vendor/gallery", icon: Images },
  // ---- Billing for the Vendora subscription itself ----
  { labelKey: "sidebar.vendor.subscription", path: "/vendor/subscription", icon: Crown },
  { labelKey: "sidebar.vendor.usage", path: "/vendor/usage", icon: Gauge },
  // Settings — pulled out of the separate bottom group so the rail
  // reads as one continuous list. Log out lives on /settings now.
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
