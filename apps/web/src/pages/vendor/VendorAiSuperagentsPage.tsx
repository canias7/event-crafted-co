// AI Superagents inside the vendor portal. Left-side picker lists
// HILUX / RAPTOR / AXION; the right pane swaps to whichever the
// vendor clicks. Only HILUX has a working agent today; RAPTOR and
// AXION show the marketing pitch + capability list under a "Coming
// soon" stamp.

import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";
import { AmbientBackdrop } from "@/pages/SuperAgentsPage";
import { AgentPicker, type AgentKey } from "@/components/super-agents/AgentPicker";
import { AxionLogo, RaptorLogo } from "@/components/super-agents/AgentLogos";
import { HiluxVendorControls } from "@/components/super-agents/HiluxVendorControls";
import { HiluxSandbox } from "@/components/super-agents/HiluxSandbox";
import { HiluxActivityLog } from "@/components/super-agents/HiluxActivityLog";
import { ComingSoonPanel } from "@/components/super-agents/ComingSoonPanel";

const COMING_SOON_COPY: Record<
  Exclude<AgentKey, "HILUX">,
  React.ComponentProps<typeof ComingSoonPanel>
> = {
  RAPTOR: {
    name: "RAPTOR 3.5",
    role: "Wordsmith",
    tagline: "Writes your listing copy in your voice.",
    about:
      "Drops the blank-page anxiety. Studies your past replies, your reviews, and the markets you serve, then drafts every word your listing needs — bio, FAQs, package descriptions — in a voice that sounds like you on your best day.",
    capabilities: [
      "One-prompt bios, FAQs, and package descriptions",
      "Tone-matched to your existing reviews + replies",
      "Multilingual — English, Spanish, French, more",
      "A/B tests headline variants against real inquiries",
    ],
    accent: "#7aa8ff",
    Logo: RaptorLogo,
    selfContained: true,
  },
  AXION: {
    name: "AXION 9.1",
    role: "Visuals",
    tagline: "Turns one phone photo into a portfolio.",
    about:
      "Generates, restyles, and cleans up listing photography on demand. Drop in a snapshot from last week's setup — Axion returns ten editorial-grade variants ready to publish, with consistent color, framing, and brand feel.",
    capabilities: [
      "Phone photo → editorial portfolio in seconds",
      "Restyles existing galleries to one cohesive look",
      "Generates lifestyle hero shots from scratch",
      "Auto-crops + retouches for every aspect ratio",
    ],
    accent: "#d066ff",
    Logo: AxionLogo,
    selfContained: true,
  },
};

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
              <>
                <HiluxVendorControls />
                <HiluxActivityLog />
                <HiluxSandbox />
              </>
            ) : selected === "RAPTOR" ? (
              <ComingSoonPanel {...COMING_SOON_COPY.RAPTOR} />
            ) : (
              <ComingSoonPanel {...COMING_SOON_COPY.AXION} />
            )}
          </div>
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}
