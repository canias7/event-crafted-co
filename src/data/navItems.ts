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
  Heart,
  Image,
  Inbox,
  User,
  Users,
  Clock,
  Gift,
  Settings,
  TrendingUp,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const customerNavItems: NavItem[] = [
  { label: "Dashboard", path: "/customer/dashboard", icon: LayoutDashboard },
  { label: "Vendors", path: "/customer/vendors", icon: Store },
  { label: "Inquiries", path: "/customer/inquiries", icon: MessageSquare },
  { label: "Messages", path: "/customer/messages", icon: MessageSquare },
  { label: "Guests", path: "/customer/guests", icon: User },
  { label: "Seating", path: "/customer/seating", icon: Users },
  { label: "Appointments", path: "/customer/appointments", icon: CalendarDays },
  { label: "Event Details", path: "/customer/event", icon: FileText },
  { label: "Day-of Timeline", path: "/customer/timeline", icon: Clock },
  { label: "Invitations", path: "/customer/invitations", icon: Mail },
  { label: "Checklist", path: "/customer/checklist", icon: CheckSquare },
  { label: "Tasks", path: "/customer/tasks", icon: ListTodo },
  { label: "Payments", path: "/customer/payments", icon: CreditCard },
  { label: "Favorites", path: "/customer/favorites", icon: Heart },
  { label: "Saved searches", path: "/customer/saved-searches", icon: Store },
  { label: "Mood Boards", path: "/customer/moodboards", icon: Image },
  { label: "Registry", path: "/customer/registry", icon: Gift },
  { label: "Planning Team", path: "/customer/planning-team", icon: Users },
  { label: "Settings", path: "/settings", icon: Settings },
];

export const vendorNavItems: NavItem[] = [
  { label: "Dashboard", path: "/vendor/dashboard", icon: LayoutDashboard },
  { label: "Inbox", path: "/vendor/inbox", icon: Inbox },
  { label: "Messages", path: "/vendor/messages", icon: MessageSquare },
  { label: "Analytics", path: "/vendor/analytics", icon: TrendingUp },
  { label: "Templates", path: "/vendor/templates", icon: FileText },
  { label: "Profile", path: "/vendor/profile", icon: User },
  { label: "Team", path: "/vendor/team", icon: Users },
  { label: "Appointments", path: "/vendor/appointments", icon: CalendarDays },
  { label: "Availability", path: "/vendor/availability", icon: Clock },
  { label: "Payments", path: "/vendor/payments", icon: CreditCard },
  { label: "Contracts", path: "/vendor/contracts", icon: FileText },
  { label: "Settings", path: "/settings", icon: Settings },
];

export const adminNavItems: NavItem[] = [
  { label: "Overview", path: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Vendors", path: "/admin/vendors", icon: Store },
  { label: "Verifications", path: "/admin/verifications", icon: ShieldCheck },
  { label: "Inquiries", path: "/admin/inquiries", icon: MessageSquare },
  { label: "Reviews", path: "/admin/reviews", icon: CheckSquare },
  { label: "Inspiration", path: "/admin/inspiration", icon: FileText },
  { label: "Settings", path: "/settings", icon: Settings },
];
