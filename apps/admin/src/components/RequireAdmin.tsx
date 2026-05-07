import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, profile, loading, error } = useAuth();

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-900">Sign-in failed</p>
          <p className="mt-2 text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  if (loading || !session) {
    return <div className="p-8 text-sm text-ink/60">Loading…</div>;
  }

  if (profile?.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md rounded border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-900">Access denied</p>
          <p className="mt-2 text-sm text-red-800">
            The configured admin account does not have admin privileges.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
