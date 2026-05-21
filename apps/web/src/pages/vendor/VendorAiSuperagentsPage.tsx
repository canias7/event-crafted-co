// AI Superagents inside the vendor portal — same showcase content
// the public /super-agents page renders (headline + HILUX / RAPTOR /
// AXION cards). Wraps the showcase in the vendor sidebar layout so
// it sits in the portal chrome instead of standing alone.

import { useReducedMotion } from "framer-motion";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";
import { AgentsSection, AmbientBackdrop } from "@/pages/SuperAgentsPage";
import { HiluxVendorControls } from "@/components/super-agents/HiluxVendorControls";
import { HiluxSandbox } from "@/components/super-agents/HiluxSandbox";

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
        <HiluxVendorControls />
        <HiluxSandbox />
        <AgentsSection />
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}
