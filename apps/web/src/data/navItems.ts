import {
  LayoutDashboard,
  Store,
  Compass,
  CalendarDays,
  FileText,
  Mail,
  MessageSquare,
  ListTodo,
  CreditCard,
  Image,
  Inbox,
  User,
  Gift,
  Settings,
  LifeBuoy,
  Wand2,
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

export const customerNavItems: NavItem[] = [
  { labelKey: "sidebar.customer.dashboard", path: "/customer/dashboard", icon: LayoutDashboard },
  { labelKey: "sidebar.customer.explore", path: "/customer/explore", icon: Compass },
  // Vendors hub — sub-tabs: Browse, Favorites, Saved searches
  { labelKey: "sidebar.customer.vendors", path: "/customer/vendors", icon: Store },
  // Inquiries hub — sub-tabs: Single, Multi-vendor blast
  { labelKey: "sidebar.customer.inquiries", path: "/customer/inquiries", icon: MessageSquare },
  { labelKey: "sidebar.customer.messages", path: "/customer/messages", icon: Mail },
  { labelKey: "sidebar.customer.events", path: "/customer/events", icon: CalendarDays },
  { labelKey: "sidebar.customer.appointments", path: "/customer/appointments", icon: CalendarDays },
  // Event hub — sub-tabs: Details, Day-of Timeline, Microsite
  { labelKey: "sidebar.customer.event", path: "/customer/event", icon: FileText },
  // Guests hub — sub-tabs: Guests, Seating
  { labelKey: "sidebar.customer.guests", path: "/customer/guests", icon: User },
  // Planning hub — sub-tabs: Tasks, Checklist, Planning Team, Planner workspace
  { labelKey: "sidebar.customer.planning", path: "/customer/tasks", icon: ListTodo },
  // Inspiration hub — sub-tabs: Mood Boards, Invitations
  { labelKey: "sidebar.customer.inspiration", path: "/customer/moodboards", icon: Image },
  // Gifts hub — sub-tabs: Registry, Group gifts
  { labelKey: "sidebar.customer.gifts", path: "/customer/registry", icon: Gift },
];

export const customerNavBottomItems: NavItem[] = [
  { labelKey: "sidebar.bottom.payments", path: "/customer/payments", icon: CreditCard },
  { labelKey: "sidebar.bottom.support", path: "/support", icon: LifeBuoy },
  { labelKey: "sidebar.bottom.settings", path: "/settings", icon: Settings },
];

export const vendorNavItems: NavItem[] = [
  { labelKey: "sidebar.vendor.dashboard", path: "/vendor/dashboard", icon: LayoutDashboard },
  // Inbox hub — sub-tabs: Inquiries (default), Hosts (DMs), Partners
  // (vendor-to-vendor). The standalone Messages entry merged in here.
  { labelKey: "sidebar.vendor.inbox", path: "/vendor/inbox", icon: Inbox },
  // Calendar hub — sub-tabs: Appointments, Availability
  { labelKey: "sidebar.vendor.calendar", path: "/vendor/appointments", icon: CalendarDays },
  { labelKey: "sidebar.vendor.listing", path: "/vendor/listing", icon: Store },
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
