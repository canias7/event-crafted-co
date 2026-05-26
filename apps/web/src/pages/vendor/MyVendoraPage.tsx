import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems } from "@/data/navItems";

import VendorLeadsPage from "@/pages/vendor/VendorLeadsPage";
import VendorAppointmentsPage from "@/pages/vendor/VendorAppointmentsPage";
import VendorPaymentsPage from "@/pages/vendor/VendorPaymentsPage";

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
// The active tab is reflected in `?tab=` so refreshes and shared
// links land on the same view. Default is leads.
export default function MyVendoraPage() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const tab: Tab = useMemo(() => {
    return rawTab === "calendar" || rawTab === "vendorapay" ? rawTab : "leads";
  }, [rawTab]);

  const setTab = (next: Tab) => {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set("tab", next);
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
        {tab === "leads" && <VendorLeadsPage embedded />}
        {tab === "calendar" && <VendorAppointmentsPage embedded />}
        {tab === "vendorapay" && <VendorPaymentsPage embedded />}
      </div>
      <MobileNav items={vendorNavItems} />
    </div>
  );
}
