// AI Superagents inside the vendor portal. HILUX is the only
// agent surface here — the Vendora MCP connector moved to
// /vendor/integrations (reachable from Settings).

import { useReducedMotion } from "framer-motion";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";
import { AmbientBackdrop } from "@/pages/SuperAgentsPage";
import { HiluxVendorControls } from "@/components/super-agents/HiluxVendorControls";

export default function VendorAiSuperagentsPage() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-screen flex" style={{ background: "#fafafa" }}>
      <DashboardSidebar
        items={navItems}
        title="Vendor Portal"
        backPath="/vendor/me"
      />
      <main className="flex-1 pb-24 md:pb-0 relative overflow-x-hidden text-black">
        <AmbientBackdrop disabled={!!reduceMotion} />
        <div className="relative z-10 min-h-screen">
          <HiluxVendorControls />
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}
