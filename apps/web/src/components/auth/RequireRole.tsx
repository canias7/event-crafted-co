import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AppRole, useAuth } from "@/hooks/useAuth";

export function RequireRole({ role, children }: { role: AppRole | AppRole[]; children: ReactNode }) {
  const { session, profile, hasVendorAccess, planningMemberships, loading } =
    useAuth();
  const location = useLocation();

  // Still-loading covers two cases:
  //  1. Initial AuthProvider mount before getSession() resolves.
  //  2. Session is set but profile is still being fetched (the
  //     auth listener defers loadProfile() to setTimeout(0)).
  // Without case 2 we'd briefly compute matches=false on a fresh
  // post-signup session and bounce the user back to "/" — which
  // looks like "nothing happened after signing up."
  if (loading || (session && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-label text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const allowed = Array.isArray(role) ? role : [role];
  // Multi-role: every authenticated non-admin profile is a host by
  // default. "vendor" access is granted when the user owns a vendor
  // application (any status) or is a team member of someone else's
  // vendor — that's `hasVendorAccess`. Planning collaborators get host
  // access too, even if they were originally a vendor-only account.
  const matches =
    profile != null &&
    ((allowed.includes("admin") && profile.role === "admin") ||
      (allowed.includes("vendor") && hasVendorAccess) ||
      (allowed.includes("host") &&
        (profile.role !== "admin" || planningMemberships.length > 0)));
  if (!matches) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}