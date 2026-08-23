import {
  BadgeCheck,
  Briefcase,
  CalendarDays,
  Compass,
  Crown,
  Gauge,
  Images,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Settings,
  Sparkles,
  User,
  Users,
  Zap,
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
  /**
   * When true, active-state matches the full path INCLUDING the query
   * string (pathname + search), not just the pathname. Lets two items
   * that share a pathname but differ by `?query` (e.g. Overview vs
   * Workspace, both on /vendor/my-vendora) highlight independently.
   */
  exact?: boolean;
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

// Vendor portal nav — STRICT mirror of the vendor app's tab bar
// (apps/vendor-mobile/app/(vendor)/_layout.tsx): Inbox · Gallery ·
// My Profile · Calendar · More. A vendor moving between phone and web
// finds the identical map — same names, same grouping, same order.
// The "More" section carries the same rows as the app's More tab;
// web-only power surfaces live under "Web studio" so the web still
// feels like the elevated sibling, not a different product.
export const vendorNavItems: NavItem[] = [
  { labelKey: "sidebar.vendor.inbox", path: "/vendor/inbox", icon: Inbox },
  { labelKey: "sidebar.vendor.gallery", path: "/vendor/gallery", icon: Images },
  { labelKey: "sidebar.vendor.my_profile", path: "/vendor/me", icon: User },
  { labelKey: "sidebar.vendor.calendar", path: "/vendor/appointments", icon: CalendarDays },
  {
    labelKey: "sidebar.vendor.more",
    icon: MoreHorizontal,
    children: [
      { labelKey: "sidebar.vendor.edit_profile", path: "/vendor/edit-profile", icon: Pencil },
      { labelKey: "sidebar.vendor.subscription", path: "/vendor/subscription", icon: Crown },
      { labelKey: "sidebar.vendor.verification", path: "/vendor/verification", icon: BadgeCheck },
      { labelKey: "sidebar.vendor.scheduling", path: "/vendor/scheduling", icon: Zap },
      { labelKey: "sidebar.vendor.crm", path: "/vendor/crm", icon: Users },
      { labelKey: "sidebar.vendor.team", path: "/vendor/team", icon: Sparkles },
      { labelKey: "sidebar.vendor.setup", path: "/vendor/setup", icon: ListChecks },
      { labelKey: "sidebar.vendor.updates", path: "/vendor/updates", icon: Megaphone },
      { labelKey: "sidebar.bottom.settings", path: "/settings", icon: Settings },
    ],
  },
  {
    labelKey: "sidebar.vendor.web_studio",
    icon: LayoutDashboard,
    children: [
      { labelKey: "sidebar.vendor.overview", path: "/vendor/overview", icon: LayoutDashboard },
      { labelKey: "sidebar.vendor.workspace", path: "/vendor/workspace", icon: Briefcase },
      { labelKey: "sidebar.vendor.usage", path: "/vendor/usage", icon: Gauge },
    ],
  },
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
