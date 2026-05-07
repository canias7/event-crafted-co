import { Link, useLocation } from "react-router-dom";
import { Inbox } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const PORTAL_PREFIXES = ["/customer/", "/vendor/", "/admin/", "/settings"];

// Mobile-only floating Inbox shortcut. Replaces the old top-right
// notification bell — notifications moved to /settings, the bell
// was leaving a stacked / bugged second icon on the dashboard
// because VendorDashboard rendered its own Bell button right next
// to it. The Inbox icon is the higher-traffic destination anyway:
// it's the surface vendors check most often when they pop the app
// open from a phone notification.
export function MobilePortalBell() {
  const location = useLocation();
  const { session, profile } = useAuth();

  if (!session || !profile) return null;
  const onPortal = PORTAL_PREFIXES.some(
    (p) =>
      location.pathname === p ||
      location.pathname.startsWith(p) ||
      location.pathname === "/settings",
  );
  if (!onPortal) return null;

  // Vendors get the merged Inbox hub (Inquiries / Hosts / Partners).
  // Customers go to their own inquiries surface. Admins go to the
  // admin inquiries page, falling back to the dashboard.
  const inboxPath =
    profile.role === "vendor"
      ? "/vendor/inbox"
      : profile.role === "admin"
        ? "/admin/inquiries"
        : "/customer/inquiries";

  return (
    <div className="lg:hidden fixed top-3 right-3 z-50">
      <Link
        to={inboxPath}
        aria-label="Open inbox"
        className="w-10 h-10 rounded-full bg-background/85 backdrop-blur-sm border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <Inbox className="w-4 h-4" />
      </Link>
    </div>
  );
}
