import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "./NotificationBell";

const PORTAL_PREFIXES = ["/customer/", "/vendor/", "/admin/", "/settings"];

/**
 * Mobile-only floating notification bell. Renders at top-right on portal
 * pages so users on small screens have access to the bell (the desktop
 * sidebar's bell is hidden on mobile).
 */
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

  return (
    <div className="lg:hidden fixed top-3 right-3 z-50 bg-background/85 backdrop-blur-sm rounded-full border border-border shadow-sm">
      <NotificationBell variant="light" />
    </div>
  );
}
