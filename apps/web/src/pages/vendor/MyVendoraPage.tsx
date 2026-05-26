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
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set("view", next);
        // Switching wrapper tabs should drop any sub-page query
        // state — otherwise stale params from one panel survive
        // into the next (e.g. VendoraPay's `?tab=files&file=xyz`
        // leaking into Leads' URL).
        out.delete("tab");
        out.delete("file");
        return out;
      },
      { replace: true },
    );
  };

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={vendorNavItems} title="Vendor Portal" backPath="/" />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-4 md:px-8 pt-4 pb-2 sticky top-0 z-40 backdrop-blur-sm">
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
        <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
          {tab === "leads" && <VendorLeadsPage embedded />}
          {tab === "calendar" && <VendorAppointmentsPage embedded />}
          {tab === "vendorapay" && <VendorPaymentsPage embedded />}
        </Suspense>
      </div>
      <MobileNav items={vendorNavItems} />
    </div>
  );
}
