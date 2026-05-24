// Vendor integrations hub. Card grid of connectors grouped by
// category. Some are functional (Vendora MCP, Stripe Connect),
// the rest render with a Coming soon pill so the catalog is
// visible to vendors and signals what's on the roadmap.
//
// Each connector card carries:
//   • Brand mark (lucide icon for generic, inline SVG for branded
//     payment processors)
//   • Name + one-line description
//   • Status: connected / available / coming_soon
//   • Action: Manage (connected), Connect (available),
//     Coming soon (disabled)
//
// New connectors plug in by appending to the CONNECTORS array;
// no router or settings change required.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Check,
  ExternalLink,
  Loader2,
  Sparkles,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { vendorNavItems } from "@/data/navItems";
import { VendoraMcpPanel } from "@/components/super-agents/VendoraMcpPanel";

type ConnectorStatus = "connected" | "available" | "coming_soon";
type ConnectorAction =
  | { kind: "expand"; key: string }
  | { kind: "stripe_connect" }
  | { kind: "none" };

interface Connector {
  id: string;
  name: string;
  category: string;
  description: string;
  // Tiny inline brand mark. Lucide icons get an explicit ReactNode
  // wrapper so the API stays uniform across icon styles.
  brand: React.ReactNode;
  // Default action when the connector hasn't been touched yet.
  action: ConnectorAction;
}

function BrandMark({
  children,
  bg,
}: {
  children: React.ReactNode;
  bg: string;
}) {
  return (
    <div
      className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center"
      style={{ background: bg }}
    >
      {children}
    </div>
  );
}

const CONNECTORS: Connector[] = [
  // ───── AI assistants ─────────────────────────────────────────
  {
    id: "vendora-mcp",
    name: "Claude (MCP)",
    category: "AI assistants",
    description:
      "Manage listings, inquiries, and analytics via Claude with a personal access token.",
    brand: (
      <BrandMark bg="rgba(217,119,87,0.18)">
        <Sparkles className="w-5 h-5" style={{ color: "#cf6e3a" }} />
      </BrandMark>
    ),
    action: { kind: "expand", key: "vendora-mcp" },
  },
  // ───── Payments ──────────────────────────────────────────────
  // Stripe is the only one that's actually wired today via the
  // existing stripe-connect-onboard edge function. The others are
  // listed so vendors see them on the roadmap.
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    description:
      "Accept card payments and payouts directly to your bank. KYC handled by Stripe.",
    brand: (
      <BrandMark bg="#635bff">
        <span className="text-white font-bold text-lg tracking-tight">S</span>
      </BrandMark>
    ),
    action: { kind: "stripe_connect" },
  },
  {
    id: "square",
    name: "Square",
    category: "Payments",
    description:
      "Sync Square account so payments + payouts land in your existing Square dashboard.",
    brand: (
      <BrandMark bg="#000000">
        <span className="text-white font-bold text-lg tracking-tight">□</span>
      </BrandMark>
    ),
    action: { kind: "none" },
  },
  {
    id: "paypal",
    name: "PayPal",
    category: "Payments",
    description:
      "PayPal Business connection for vendors who already collect host deposits there.",
    brand: (
      <BrandMark bg="#003087">
        <span className="text-white font-bold text-sm tracking-tight">PP</span>
      </BrandMark>
    ),
    action: { kind: "none" },
  },
  {
    id: "venmo",
    name: "Venmo",
    category: "Payments",
    description:
      "Venmo Business profile for casual deposits — popular with smaller events.",
    brand: (
      <BrandMark bg="#3D95CE">
        <span className="text-white font-bold text-lg italic">V</span>
      </BrandMark>
    ),
    action: { kind: "none" },
  },
  {
    id: "cashapp",
    name: "Cash App",
    category: "Payments",
    description:
      "Cash App Business handle so hosts can $-tag you for final balances.",
    brand: (
      <BrandMark bg="#00D632">
        <span className="text-white font-bold text-lg">$</span>
      </BrandMark>
    ),
    action: { kind: "none" },
  },
  {
    id: "zelle",
    name: "Zelle",
    category: "Payments",
    description:
      "Bank-to-bank transfers (US only). Best for vendors avoiding processor fees on big balances.",
    brand: (
      <BrandMark bg="#6D1ED4">
        <span className="text-white font-bold text-lg">Z</span>
      </BrandMark>
    ),
    action: { kind: "none" },
  },
];

export default function VendorIntegrationsPage() {
  const navigate = useNavigate();
  const { ownListing } = useAuth();
  const vendorId = ownListing?.id ?? null;

  // Connected-status lookup. Currently only Stripe has a real
  // backing column (vendor_profiles.stripe_account_id); the others
  // default to 'available' / 'coming_soon' until they ship.
  const [stripeConnected, setStripeConnected] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<string | null>("vendora-mcp");
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_profiles")
        .select("stripe_account_id")
        .eq("id", vendorId)
        .maybeSingle();
      if (cancelled) return;
      setStripeConnected(
        Boolean((data as { stripe_account_id?: string | null } | null)?.stripe_account_id),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const handleStripeConnect = useCallback(async () => {
    if (!vendorId || actingId) return;
    setActingId("stripe");
    const { data, error } = await supabase.functions.invoke(
      "stripe-connect-onboard",
      { body: { vendor_id: vendorId } },
    );
    if (error || !(data as { url?: string })?.url) {
      toast.error("Couldn't open Stripe onboarding", {
        description: error?.message ?? "Try again in a moment.",
      });
      setActingId(null);
      return;
    }
    window.location.href = (data as { url: string }).url;
  }, [vendorId, actingId]);

  // Group connectors into category sections, preserving array order.
  const grouped = CONNECTORS.reduce<Record<string, Connector[]>>((acc, c) => {
    (acc[c.category] ||= []).push(c);
    return acc;
  }, {});

  function statusFor(c: Connector): ConnectorStatus {
    if (c.id === "vendora-mcp") return "connected"; // panel handles its own state
    if (c.id === "stripe") return stripeConnected ? "connected" : "available";
    return "coming_soon";
  }

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
            Connect Vendora to the tools you already use.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-8">
          {Object.entries(grouped).map(([category, items]) => (
            <section key={category}>
              <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-3">
                {category}
              </h2>
              <div className="space-y-2.5">
                {items.map((c) => {
                  const status = statusFor(c);
                  const isExpanded = expanded === c.id;
                  return (
                    <div
                      key={c.id}
                      className="rounded-2xl overflow-hidden"
                      style={{
                        background: "rgba(255,253,250,0.7)",
                        border: "0.5px solid rgba(255,138,76,0.22)",
                      }}
                    >
                      <div className="flex items-center gap-4 p-4 md:p-5">
                        {c.brand}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[15px] font-semibold leading-tight">
                              {c.name}
                            </h3>
                            <StatusPill status={status} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                            {c.description}
                          </p>
                        </div>
                        <ConnectorAction
                          connector={c}
                          status={status}
                          acting={actingId === c.id}
                          expanded={isExpanded}
                          onExpand={() =>
                            setExpanded(isExpanded ? null : c.id)
                          }
                          onStripeConnect={handleStripeConnect}
                        />
                      </div>
                      {/* Inline expand for the MCP connector — the
                          existing VendoraMcpPanel surfaces token
                          mint + scope info. Keeps the user on the
                          integrations page instead of opening yet
                          another sub-route. */}
                      {isExpanded && c.id === "vendora-mcp" ? (
                        <div className="border-t border-foreground/10 p-4 md:p-5">
                          <VendoraMcpPanel />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
      <MobileNav items={vendorNavItems} />
    </div>
  );
}

function StatusPill({ status }: { status: ConnectorStatus }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
        <Check className="w-2.5 h-2.5" />
        Connected
      </span>
    );
  }
  if (status === "coming_soon") {
    return (
      <span className="inline-flex items-center rounded-full bg-foreground/8 text-muted-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
        Coming soon
      </span>
    );
  }
  return null;
}

function ConnectorAction({
  connector,
  status,
  acting,
  expanded,
  onExpand,
  onStripeConnect,
}: {
  connector: Connector;
  status: ConnectorStatus;
  acting: boolean;
  expanded: boolean;
  onExpand: () => void;
  onStripeConnect: () => void;
}) {
  if (status === "coming_soon") {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="rounded-full"
      >
        Coming soon
      </Button>
    );
  }
  if (connector.action.kind === "expand") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onExpand}
        className="rounded-full"
      >
        {expanded ? "Hide" : "Manage"}
      </Button>
    );
  }
  if (connector.action.kind === "stripe_connect") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onStripeConnect}
        disabled={acting}
        className="rounded-full"
      >
        {acting ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
        ) : (
          <ExternalLink className="w-3.5 h-3.5 mr-1" />
        )}
        {status === "connected" ? "Manage" : "Connect"}
      </Button>
    );
  }
  // Fallback — should never hit; CreditCard so TS knows the import
  // isn't dead while we wait for the rest of the connectors to
  // get real actions.
  return (
    <Button variant="outline" size="sm" disabled className="rounded-full">
      <CreditCard className="w-3.5 h-3.5 mr-1" />
      Coming soon
    </Button>
  );
}
