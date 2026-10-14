// Sign-in role chooser. /login lands here; the user picks Host or Vendor
// and we forward to /login/host or /login/vendor. Simple centred layout
// (AuthLayout).

import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout, AuthRoleChooser } from "@/components/auth/AuthLayout";

export default function LoginRoleChooserPage() {
  // Already authenticated? Skip the chooser and drop them in the
  // portal they belong to. (Catches users who hit /login from an
  // old tab while already signed in elsewhere.)
  const { session, hasVendorAccess, hasHostAccess, loading } = useAuth();
  if (!loading && session) {
    if (hasVendorAccess) return <Navigate to="/vendor/me" replace />;
    if (hasHostAccess) return <Navigate to="/customer/explore" replace />;
  }
  return (
    <AuthLayout side="signin">
      <AuthRoleChooser
        side="signin"
        hostTo="/login/host"
        vendorTo="/login/vendor"
        otherTo="/signup"
        LinkComponent={Link}
      />
    </AuthLayout>
  );
}
