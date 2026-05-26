import { lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems } from "@/data/navItems";

// Lazy-load each sub-page so we don't ship the Calendar and
// VendoraPay bundles to a user who only ever looks at Leads.
// Suspense fallback renders below the always-present tab strip so
// the user can still switch tabs while a panel is loading.
const VendorLeadsPage = lazy(() => import("@/pages/vendor/VendorLeadsPage"));
const VendorAppointmentsPage = lazy(
  () => import("@/pages/vendor/VendorAppointmentsPage"),
);
const VendorPaymentsPage = lazy(
  () => import("@/pages/vendor/VendorPaymentsPage"),
);

type Tab = "leads" | "calendar" | "vendorapay";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "leads", label: "Leads" },
  { id: "calendar", label: "Calendar" },
  { id: "vendorapay", label: "VendoraPay" },
];

// My Vendora — single-page shell that hosts Leads / Calendar /
// VendoraPay as switchable tabs. Each tab renders the existing
// page component in embedded mode (sidebar/mobile-nav suppressed)
// so we don't double-stack the chrome.
//
// The active tab is reflected in `?view=` so refreshes and shared
// links land on the same view. Default is leads. The param name
// is `view` (not `tab`) deliberately — VendorPaymentsPage uses
// `?tab=` internally for its OWN sub-tabs (Overview/Files/Disputes/
// Settings), and the two would clash if they shared the param.
export default function MyVendoraPage() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("view");
  const tab: Tab = useMemo(() => {
    return rawTab === "calendar" || rawTab === "vendorapay" ? rawTab : "leads";
  }, [rawTab]);

  const setTab = (next: Tab) => {
    // Switching wrapper tabs wipes ALL sub-page query state, not
    // just the known params. Each tab is a fresh view; carrying
    // forward stale filters/selections from a sibling tab (e.g.
    // Leads' `?status=won` showing up in the Calendar URL) is
    // worse than starting clean. `view` is the only param the
    // wrapper itself reads, so it's the only one we preserve.
    setParams(new URLSearchParams({ view: next }), { replace: true });
  };

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={vendorNavItems} title="Vendor Portal" backPath="/" />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-4 md:px-8 pt-4 pb-2 sticky top-0 z-40 backdrop-blur-sm border-b border-foreground/5">
          <div
            role="tablist"
            className="flex items-center gap-1 overflow-x-auto scrollbar-hide"
          >
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`whitespace-nowrap text-sm h-8 px-3 inline-flex items-center rounded-full transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        <Suspense fallback={<TabLoadingFallback />}>
          {tab === "leads" && <VendorLeadsPage embedded />}
          {tab === "calendar" && <VendorAppointmentsPage embedded />}
          {tab === "vendorapay" && <VendorPaymentsPage embedded />}
        </Suspense>
      </div>
      <MobileNav items={vendorNavItems} />
    </div>
  );
}

// Loading state while a tab's bundle is being fetched. Keeps the
// page's vertical rhythm so the tab strip doesn't snap up against
// a near-empty viewport, and gives the user a small visual cue
// rather than a plain text label.
function TabLoadingFallback() {
  return (
    <div className="p-4 md:p-8 max-w-5xl space-y-4">
      <div className="h-8 w-48 rounded-full bg-foreground/5 animate-pulse" />
      <div className="h-32 rounded-2xl bg-foreground/5 animate-pulse" />
      <div className="h-32 rounded-2xl bg-foreground/5 animate-pulse" />
    </div>
  );
}
