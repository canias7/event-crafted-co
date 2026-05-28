import { lazy, Suspense } from "react";

import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems } from "@/data/navItems";

// My Vendora is the vendor's operations dashboard. After the
// short-lived tabbed wrapper (Leads / Calendar / VendoraPay) the
// user asked to collapse it into ONE page — the VendoraPay
// dashboard IS the My Vendora page. Leads and Calendar still
// resolve at their standalone routes (/vendor/leads,
// /vendor/appointments) for now; this page renders just the
// payments dashboard in embedded mode so it picks up the sidebar
// chrome from here without double-stacking.
const VendorPaymentsPage = lazy(
  () => import("@/pages/vendor/VendorPaymentsPage"),
);

export default function MyVendoraPage() {
  return (
    <div className="flex min-h-screen vendor-canvas my-vendora-cockpit">
      <DashboardSidebar items={vendorNavItems} title="Vendor Portal" backPath="/" />
      <div className="flex-1 min-w-0 flex flex-col">
        <Suspense fallback={<TabLoadingFallback />}>
          <VendorPaymentsPage embedded />
        </Suspense>
      </div>
      <MobileNav items={vendorNavItems} />
    </div>
  );
}

function TabLoadingFallback() {
  return (
    <div className="p-4 md:p-8 max-w-5xl space-y-4">
      <div className="h-8 w-48 rounded-full bg-foreground/5 animate-pulse" />
      <div className="h-32 rounded-2xl bg-foreground/5 animate-pulse" />
      <div className="h-32 rounded-2xl bg-foreground/5 animate-pulse" />
    </div>
  );
}
