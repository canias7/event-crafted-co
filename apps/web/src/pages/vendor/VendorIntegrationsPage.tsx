// Vendor integrations page — segmented MCP / CLI picker at the top,
// the chosen surface below. Reached from /settings → "Integrations"
// row. MCP is the live Vendora MCP connector panel; CLI is a
// placeholder for a connector we'll wire up later.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Sparkles, Terminal } from "lucide-react";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems } from "@/data/navItems";
import { VendoraMcpPanel } from "@/components/super-agents/VendoraMcpPanel";

type IntegrationKey = "mcp" | "cli";

interface Tab {
  key: IntegrationKey;
  label: string;
  Icon: typeof Sparkles;
  ready: boolean;
}

const TABS: Tab[] = [
  { key: "mcp", label: "MCP", Icon: Sparkles, ready: true },
  { key: "cli", label: "CLI", Icon: Terminal, ready: false },
];

export default function VendorIntegrationsPage() {
  const [active, setActive] = useState<IntegrationKey>("mcp");
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar
        items={vendorNavItems}
        title="Vendor Portal"
        backPath="/settings"
      />
      <main className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ChevronLeft className="w-3 h-3" />
            Settings
          </button>
          <h1 className="font-editorial text-3xl">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Plug your Vendora account into Claude and other AI clients.
          </p>
        </div>

        <div className="px-4 md:px-8 pt-2">
          {/* Segmented picker — dark pill bar, active tab as a
              white chip. The CLI tab stays tappable to show its
              "Coming soon" placeholder body. */}
          <div className="inline-flex items-center gap-1 rounded-full bg-foreground/90 p-1 shadow-sm">
            {TABS.map((t) => {
              const isActive = active === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActive(t.key)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                    isActive
                      ? "bg-background text-foreground"
                      : "text-background/75 hover:text-background"
                  }`}
                >
                  <t.Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {active === "mcp" ? (
          <VendoraMcpPanel />
        ) : (
          <ComingSoon
            label="CLI"
            blurb="A first-class command-line client for power users — manage inquiries, draft replies, and tweak HILUX from your terminal. Wiring this up next."
          />
        )}
      </main>
      <MobileNav items={vendorNavItems} />
    </div>
  );
}

function ComingSoon({ label, blurb }: { label: string; blurb: string }) {
  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          background: "rgba(255,253,250,0.6)",
          border: "0.5px dashed rgba(0,0,0,0.18)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <p className="text-[11px] uppercase tracking-[0.2em] text-black/55 mb-2">
          Coming soon
        </p>
        <h2 className="font-editorial text-2xl text-black mb-3">{label}</h2>
        <p className="text-sm text-black/65 max-w-md mx-auto leading-relaxed">
          {blurb}
        </p>
      </div>
    </div>
  );
}
