// AI Superagents inside the vendor portal. Left-side picker has
// two surfaces:
//   - HILUX: the always-on background agent.
//   - Vendora for Claude: the MCP connector that brings the
//     vendor's account into Claude.ai / Claude Code as a copilot.
//
// RAPTOR and AXION as separate "agents" are retired — the MCP
// connector covers both copywriting and visual workflows because
// the vendor can just ask Claude to do them.

import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";
import { AmbientBackdrop } from "@/pages/SuperAgentsPage";
import { AgentPicker, type AgentKey } from "@/components/super-agents/AgentPicker";
import { HiluxVendorControls } from "@/components/super-agents/HiluxVendorControls";
import { VendoraForClaudePanel } from "@/components/super-agents/VendoraForClaudePanel";

export default function VendorAiSuperagentsPage() {
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState<AgentKey>("HILUX");

  return (
    <div className="min-h-screen flex" style={{ background: "#fafafa" }}>
      <DashboardSidebar
        items={navItems}
        title="Vendor Portal"
        backPath="/vendor/me"
      />
      <main className="flex-1 pb-24 md:pb-0 relative overflow-x-hidden text-black">
        <AmbientBackdrop disabled={!!reduceMotion} />
        <div className="relative z-10 flex flex-col md:flex-row min-h-screen">
          <AgentPicker selected={selected} onSelect={setSelected} />
          <div className="flex-1 min-w-0">
            {selected === "HILUX" ? (
              <HiluxVendorControls />
            ) : (
              <VendoraForClaudePanel />
            )}
          </div>
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}
