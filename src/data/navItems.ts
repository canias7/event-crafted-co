import {
  LayoutDashboard,
  Store,
  CalendarDays,
  FileText,
  Mail,
  MessageSquare,
  CheckSquare,
  ListTodo,
  CreditCard,
  Image,
  Inbox,
  User,
  Users,
  Gift,
  Settings,
  TrendingUp,
  ShieldCheck,
  LifeBuoy,
  History,
  MailCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
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
  { label: "Dashboard", path: "/customer/dashboard", icon: LayoutDashboard },
  // Vendors hub — sub-tabs: Browse, Favorites, Saved searches
  { label: "Vendors", path: "/customer/vendors", icon: Store },
  // Inquiries hub — sub-tabs: Single, Multi-vendor blast
  { label: "Inquiries", path: "/customer/inquiries", icon: MessageSquare },
  { label: "Messages", path: "/customer/messages", icon: Mail },
  { label: "Appointments", path: "/customer/appointments", icon: CalendarDays },
  // Event hub — sub-tabs: Details, Day-of Timeline, Microsite
  { label: "Event", path: "/customer/event", icon: FileText },
  // Guests hub — sub-tabs: Guests, Seating
  { label: "Guests", path: "/customer/guests", icon: User },
  // Planning hub — sub-tabs: Tasks, Checklist, Planning Team, Planner workspace
  { label: "Planning", path: "/customer/tasks", icon: ListTodo },
  // Inspiration hub — sub-tabs: Mood Boards, Invitations
  { label: "Inspiration", path: "/customer/moodboards", icon: Image },
  // Gifts hub — sub-tabs: Registry, Group gifts
  { label: "Gifts", path: "/customer/registry", icon: Gift },
];

export const customerNavBottomItems: NavItem[] = [
  { label: "Payments", path: "/customer/payments", icon: CreditCard },
  { label: "Support", path: "/support", icon: LifeBuoy },
  { label: "Settings", path: "/settings", icon: Settings },
];

export const vendorNavItems: NavItem[] = [
  { label: "Dashboard", path: "/vendor/dashboard", icon: LayoutDashboard },
  { label: "Inbox", path: "/vendor/inbox", icon: Inbox },
  { label: "Messages", path: "/vendor/messages", icon: Mail },
  { label: "Analytics", path: "/vendor/analytics", icon: TrendingUp },
  // Calendar hub — sub-tabs: Appointments, Availability
  { label: "Calendar", path: "/vendor/appointments", icon: CalendarDays },
  // Profile aggregates packages, portfolio, showcase clips, real events,
  // verifications, imported reviews — already a single page.
  { label: "Profile", path: "/vendor/profile", icon: User },
  // Library hub — sub-tabs: Message templates, Contract templates
  { label: "Library", path: "/vendor/templates", icon: FileText },
  { label: "Team", path: "/vendor/team", icon: Users },
  { label: "Payments", path: "/vendor/payments", icon: CreditCard },
];

export const vendorNavBottomItems: NavItem[] = [
  { label: "Support", path: "/support", icon: LifeBuoy },
  { label: "Settings", path: "/settings", icon: Settings },
];

// Lookup map so DashboardSidebar can find the bottom items without
// every page having to pass them explicitly. Keyed by reference on
// the main nav array, so importing customerNavItems automatically
// gives you the bottom group too.
const NAV_BOTTOMS = new WeakMap<NavItem[], NavItem[]>();

export function getBottomNav(main: NavItem[]): NavItem[] | undefined {
  return NAV_BOTTOMS.get(main);
}

export const adminNavItems: NavItem[] = [
  { label: "Overview", path: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Vendors", path: "/admin/vendors", icon: Store },
  { label: "Verifications", path: "/admin/verifications", icon: ShieldCheck },
  { label: "Inquiries", path: "/admin/inquiries", icon: MessageSquare },
  { label: "Reviews", path: "/admin/reviews", icon: CheckSquare },
  { label: "Inspiration", path: "/admin/inspiration", icon: FileText },
  { label: "Support", path: "/admin/support", icon: LifeBuoy },
  { label: "Audit log", path: "/admin/audit", icon: History },
  { label: "Email health", path: "/admin/email-deliverability", icon: MailCheck },
  { label: "Settings", path: "/settings", icon: Settings },
];

NAV_BOTTOMS.set(customerNavItems, customerNavBottomItems);
NAV_BOTTOMS.set(vendorNavItems, vendorNavBottomItems);
