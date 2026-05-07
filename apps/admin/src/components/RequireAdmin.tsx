import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-8 text-sm text-ink/60">Loading…</div>;
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (profile?.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-900">Access denied</p>
          <p className="mt-2 text-sm text-red-800">
            Your account does not have admin privileges. If this is wrong,
            contact whoever provisioned your account.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
