// Sign-in role chooser. /login lands here; the user picks Host or Vendor
// and we forward to /login/host or /login/vendor. Split layout in the home
// page's format (AuthSplitLayout): venue video on the left, choice on the right.

import { Link, Navigate } from "react-router-dom";
import { CalendarHeart, Store } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AuthSplitLayout, AuthRoleChooser } from "@/components/auth/AuthSplitLayout";

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
    <AuthSplitLayout side="signin">
      <AuthRoleChooser
        side="signin"
        hostTo="/login/host"
        vendorTo="/login/vendor"
        otherTo="/signup"
        hostIcon={<CalendarHeart className="h-5 w-5 md:h-6 md:w-6" />}
        vendorIcon={<Store className="h-5 w-5 md:h-6 md:w-6" />}
        LinkComponent={Link}
      />
    </AuthSplitLayout>
  );
}
