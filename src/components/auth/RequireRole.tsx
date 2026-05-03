import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AppRole, useAuth } from "@/hooks/useAuth";

export function RequireRole({ role, children }: { role: AppRole | AppRole[]; children: ReactNode }) {
  const { session, profile, vendorMemberships, planningMemberships, loading } =
    useAuth();
  const location = useLocation();

  if (loading) {
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
  // Vendor team members access vendor portal even if profile.role isn't
  // 'vendor'. Planning collaborators access the host portal even if
  // their own profile.role isn't 'host' (e.g. a vendor invited as a
  // partner / planner).
  const matches =
    profile != null &&
    (allowed.includes(profile.role) ||
      (allowed.includes("vendor") && vendorMemberships.length > 0) ||
      (allowed.includes("host") && planningMemberships.length > 0));
  if (!matches) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}