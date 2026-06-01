import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// Heavy launcher (its button + the lazily-loaded chat) — only pulled into
// a chunk once an actual vendor lands on a /vendor/* page. Keeping this
// gate tiny and non-lazy means the launcher bundle never ships to hosts,
// logged-out visitors, or public pages.
const MySpaceLauncher = lazy(() =>
  import("@/components/super-agents/MySpaceLauncher").then((m) => ({
    default: m.MySpaceLauncher,
  }))
);

// Mounts the floating launcher on every authenticated vendor dashboard
// page (/vendor/*). Mounted once at the app root so it's available app-
// wide without each vendor page wiring it up. Public vendor browse pages
// live under /vendors/* and are intentionally excluded.
//
// Gated on hasVendorAccess too (not just the path): the mount lives
// outside RequireRole, so without this it would flash for a frame on a
// /vendor/* URL before a logged-out/non-vendor user gets redirected, and
// render during the auth-loading splash.
export function VendorMySpaceMount() {
  const { pathname } = useLocation();
  const { hasVendorAccess } = useAuth();
  if (!hasVendorAccess) return null;
  if (!pathname.startsWith("/vendor/")) return null;
  return (
    <Suspense fallback={null}>
      <MySpaceLauncher />
    </Suspense>
  );
}
