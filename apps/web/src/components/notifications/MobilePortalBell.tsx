import { Link, useLocation } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// Mobile-only floating inbox shortcut, scoped to the dashboard
// pages only. The chat-bubble icon mirrors DoorDash's "current
// dash" surface — single tap from the dashboard to the inbox hub.
// On every other page (Calendar, Listing, Studio, etc.) this is
// hidden so it doesn't compete with page chrome.
const DASHBOARD_PATHS = new Set([
  "/vendor/home",
  "/customer/explore",
]);

export function MobilePortalBell() {
  const location = useLocation();
  const { session, profile } = useAuth();

  if (!session || !profile) return null;
  if (!DASHBOARD_PATHS.has(location.pathname)) return null;

  // The dashboard URL itself tells us which side we're on (multi-role
  // users can be on either /vendor/home or /customer/explore, so we
  // no longer infer it from the profile.role).
  const inboxPath = location.pathname.startsWith("/vendor")
    ? "/vendor/inbox"
    : "/customer/inquiries";

  return (
    <div className="lg:hidden fixed top-3 right-3 z-50">
      <Link
        to={inboxPath}
        aria-label="Open inbox"
        className="w-10 h-10 rounded-full bg-background/85 backdrop-blur-sm border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageSquare className="w-4 h-4" />
      </Link>
    </div>
  );
}

