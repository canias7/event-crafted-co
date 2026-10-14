// Sign-up role chooser. /signup lands here; the user picks Host or
// Vendor and we forward them to the right intake.
//
// Hosts: /signup/host — self-serve, routes to /customer/onboarding.
// Vendors: /signup/vendor — same form, routes to /vendor/me where
// they can create their first listing. The old /vendor-apply
// hand-reviewed flow was retired.
//
// Note: one email = one role. The DB enforces this with triggers
// (block_vendor_insert_if_host / block_host_onboard_if_vendor).
//
// Visual: the simple centred sign-in layout (AuthLayout).

import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout, AuthRoleChooser } from "@/components/auth/AuthLayout";

export default function SignupRoleChooserPage() {
  // Already authenticated? Skip the chooser and drop them in the
  // portal they belong to. (Mostly catches users who land on /signup
  // from an old bookmark after they've already created an account.)
  const { session, hasVendorAccess, hasHostAccess, loading } = useAuth();
  if (!loading && session) {
    if (hasVendorAccess) return <Navigate to="/vendor/me" replace />;
    if (hasHostAccess) return <Navigate to="/customer/explore" replace />;
  }
  return (
    <AuthLayout side="signup">
      <AuthRoleChooser
        side="signup"
        hostTo="/signup/host"
        vendorTo="/signup/vendor"
        otherTo="/login"
        LinkComponent={Link}
      />
    </AuthLayout>
  );
}
