// Vendor integrations page — the Vendora MCP connector. Reached
// from /settings → "Integrations" row.

import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems } from "@/data/navItems";
import { VendoraMcpPanel } from "@/components/super-agents/VendoraMcpPanel";

export default function VendorIntegrationsPage() {
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

        <VendoraMcpPanel />
      </main>
      <MobileNav items={vendorNavItems} />
    </div>
  );
}
