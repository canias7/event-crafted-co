// Vendor integrations hub. Card grid of connectors grouped by
// category. Three patterns are live:
//
//   1. Vendora MCP — inline PAT panel (existing VendoraMcpPanel).
//   2. VendoraPay — KYC onboarding via vendorapay-onboard edge fn.
//      White-labeled Stripe Connect — vendors never see the word
//      "Stripe" on Vendora. VendoraPay is the sole payment
//      integration; per-merchant handle cards (Square / PayPal /
//      Venmo / Cash App / Zelle) were removed in favor of routing
//      every host payment through our own rails.
//   3. Stripe AI (MCP) — vendor pastes a Restricted API key from
//      their own external Stripe account; we forward it to
//      Anthropic mcp_servers so My Space can call the Stripe API
//      on the vendor's behalf. NOT a payment rail — purely an AI
//      integration with the vendor's external accounting tool.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Check,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { vendorNavItems } from "@/data/navItems";
import { VendoraMcpPanel } from "@/components/super-agents/VendoraMcpPanel";

type ConnectorKind = "mcp" | "vendorapay" | "stripe_mcp";

interface BaseConnector {
  id: string;
  name: string;
  category: string;
  description: string;
  brand: React.ReactNode;
}

interface McpConnector extends BaseConnector {
  kind: "mcp";
}
interface VendorapayConnector extends BaseConnector {
  // VendoraPay — white-labeled Stripe Connect onboarding. Calls
  // vendorapay-onboard which lives behind the payments.ts module.
  kind: "vendorapay";
}
interface StripeMcpConnector extends BaseConnector {
  // "Stripe AI" — vendor pastes a Stripe Restricted API key; we
  // forward it to Anthropic's mcp_servers parameter so My Space can
  // call any Stripe API on the vendor's behalf.
  kind: "stripe_mcp";
}

type Connector = McpConnector | VendorapayConnector | StripeMcpConnector;

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
  {
    id: "vendorapay",
    name: "VendoraPay",
    category: "Payments",
    description:
      "Accept card payments and payouts straight to your bank. Vendora's white-label processor handles KYC and money movement.",
    brand: (
      <BrandMark bg="rgba(255,138,76,0.18)">
        <span
          className="font-bold text-lg tracking-tight"
          style={{ color: "#c4541e" }}
        >
          V
        </span>
      </BrandMark>
    ),
    kind: "vendorapay",
  },
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
    kind: "mcp",
  },
  {
    id: "stripe-mcp",
    name: "Stripe AI",
    category: "AI assistants",
    description:
      "Connect your own external Stripe account so My Space can read balance, charges, refunds, payment links, and invoices. Scoped to whatever your restricted key allows.",
    brand: (
      <BrandMark bg="#635bff">
        <span className="text-white font-bold text-lg tracking-tight">S</span>
      </BrandMark>
    ),
    kind: "stripe_mcp",
  },
];

export default function VendorIntegrationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { ownListing } = useAuth();
  const vendorId = ownListing?.id ?? null;

  const [vendorapayConnected, setVendorapayConnected] = useState(false);
  // charges_enabled tracks whether VendoraPay KYC is complete.
  // vendorapayConnected = "we have a connected account on file";
  // chargesEnabled = "the processor has flipped charges/transfers on
  // after KYC review." Both flow from get_vendor_payment_info RPC.
  const [chargesEnabled, setChargesEnabled] = useState(false);
  // Stripe MCP (AI access) — separate from VendoraPay. Read via the
  // gated get_my_stripe_mcp_status RPC; the key value never reaches
  // the client.
  const [stripeMcpConnected, setStripeMcpConnected] = useState(false);
  const [stripeMcpLast4, setStripeMcpLast4] = useState<string | null>(null);
  // Start collapsed — every card (including the Vendora MCP / Claude
  // panel) renders as just the logo + Manage button. Clicking expands.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const refreshStripeMcpStatus = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc("get_my_stripe_mcp_status");
    const row = data as {
      connected?: boolean;
      last4?: string | null;
    } | null;
    setStripeMcpConnected(Boolean(row?.connected));
    setStripeMcpLast4(row?.last4 ?? null);
  }, []);
  useEffect(() => {
    void refreshStripeMcpStatus();
  }, [refreshStripeMcpStatus]);

  const handleStripeMcpConnect = useCallback(
    async (apiKey: string) => {
      if (actingId) return;
      setActingId("stripe-mcp");
      const { data, error } = await supabase.functions.invoke(
        "vendor-stripe-mcp-connect",
        { body: { api_key: apiKey } },
      );
      setActingId(null);
      const result = data as
        | { connected?: boolean; last4?: string; error?: string; detail?: string }
        | null;
      if (error || result?.error) {
        toast.error("Couldn't connect Stripe AI", {
          description:
            result?.detail ?? error?.message ?? "Try again in a moment.",
        });
        return;
      }
      await refreshStripeMcpStatus();
      setExpanded(null);
      toast.success("Stripe AI connected", {
        description: `My Space can now call your Stripe account · ending in ${result?.last4 ?? "••••"}.`,
      });
    },
    [actingId, refreshStripeMcpStatus],
  );

  const handleStripeMcpDisconnect = useCallback(async () => {
    if (actingId) return;
    setActingId("stripe-mcp");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc(
      "disconnect_my_stripe_mcp",
    );
    setActingId(null);
    if (error) {
      toast.error("Couldn't disconnect", { description: error.message });
      return;
    }
    await refreshStripeMcpStatus();
    toast.success("Stripe AI disconnected");
  }, [actingId, refreshStripeMcpStatus]);

  // VendoraPay status — reuses the existing get_vendor_payment_info
  // RPC (column names still say "stripe_*" under the hood because the
  // payment provider is Stripe Connect, but the vendor only ever sees
  // "VendoraPay" in the UI).
  const refreshPaymentInfo = useCallback(async () => {
    if (!vendorId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc(
      "get_vendor_payment_info",
      { p_vendor_id: vendorId },
    );
    const row = data as {
      stripe_account_id?: string | null;
      stripe_charges_enabled?: boolean | null;
    } | null;
    setVendorapayConnected(Boolean(row?.stripe_account_id));
    setChargesEnabled(Boolean(row?.stripe_charges_enabled));
  }, [vendorId]);

  useEffect(() => {
    void refreshPaymentInfo();
  }, [refreshPaymentInfo]);

  // After KYC, vendorapay-onboard sends the vendor back to
  // /vendor/integrations?vendorapay=return. Toast + re-pull status,
  // then strip the param so a refresh doesn't replay the toast.
  useEffect(() => {
    const flag = searchParams.get("vendorapay");
    if (!flag) return;
    if (flag === "return") {
      toast.success("Welcome back from VendoraPay", {
        description: "Refreshing your account status…",
      });
      void refreshPaymentInfo();
    } else if (flag === "refresh") {
      toast.info("Onboarding link expired", {
        description: "Click Manage to generate a fresh one.",
      });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("vendorapay");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, refreshPaymentInfo]);

  const handleVendorapayConnect = useCallback(async () => {
    if (!vendorId || actingId) return;
    setActingId("vendorapay");
    const { data, error } = await supabase.functions.invoke(
      "vendorapay-onboard",
      { body: { business_id: vendorId } },
    );
    if (error || !(data as { url?: string })?.url) {
      toast.error("Couldn't open VendoraPay onboarding", {
        description: error?.message ?? "Try again in a moment.",
      });
      setActingId(null);
      return;
    }
    window.location.href = (data as { url: string }).url;
  }, [vendorId, actingId]);

  const handleVendorapayDisconnect = useCallback(async () => {
    if (!vendorId || actingId) return;
    if (
      !window.confirm(
        "Disconnect VendoraPay? Your processor account stays open — Vendora just stops referencing it. You can re-connect anytime.",
      )
    ) {
      return;
    }
    setActingId("vendorapay");
    // disconnect_my_stripe_connect — RPC name is legacy; it just
    // clears stripe_account_id on vendor_payment_secrets, which is
    // the same column vendorapay-onboard writes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc(
      "disconnect_my_stripe_connect",
      { p_vendor_id: vendorId },
    );
    setActingId(null);
    if (error) {
      toast.error("Couldn't disconnect", { description: error.message });
      return;
    }
    await refreshPaymentInfo();
    toast.success("VendoraPay disconnected");
  }, [vendorId, actingId, refreshPaymentInfo]);

  // Group connectors by category for the section headings.
  const grouped = CONNECTORS.reduce<Record<string, Connector[]>>((acc, c) => {
    (acc[c.category] ||= []).push(c);
    return acc;
  }, {});

  function statusOf(c: Connector): "connected" | "available" {
    if (c.kind === "mcp") return "connected";
    if (c.kind === "vendorapay") {
      return vendorapayConnected ? "connected" : "available";
    }
    return stripeMcpConnected ? "connected" : "available";
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
                  const status = statusOf(c);
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
                            {c.kind === "vendorapay" &&
                            vendorapayConnected &&
                            !chargesEnabled ? (
                              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                Pending KYC
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                            {c.kind === "vendorapay" &&
                            vendorapayConnected &&
                            !chargesEnabled
                              ? "Finish KYC on the next step before hosts can pay you here."
                              : c.description}
                          </p>
                        </div>
                        <ConnectorActionButton
                          connector={c}
                          status={status}
                          acting={actingId === c.id}
                          expanded={isExpanded}
                          onExpand={() =>
                            setExpanded(isExpanded ? null : c.id)
                          }
                          onVendorapayConnect={handleVendorapayConnect}
                          onVendorapayDisconnect={handleVendorapayDisconnect}
                          vendorapayConnected={vendorapayConnected}
                        />
                      </div>
                      {isExpanded && c.kind === "mcp" ? (
                        <div className="border-t border-foreground/10 p-4 md:p-5">
                          <VendoraMcpPanel />
                        </div>
                      ) : null}
                      {isExpanded && c.kind === "stripe_mcp" ? (
                        <StripeMcpEditor
                          connected={stripeMcpConnected}
                          last4={stripeMcpLast4}
                          acting={actingId === "stripe-mcp"}
                          onConnect={handleStripeMcpConnect}
                          onDisconnect={handleStripeMcpDisconnect}
                        />
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

function StatusPill({
  status,
}: {
  status: "connected" | "available";
}) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
        <Check className="w-2.5 h-2.5" />
        Connected
      </span>
    );
  }
  return null;
}

function ConnectorActionButton({
  connector,
  status,
  acting,
  expanded,
  onExpand,
  onVendorapayConnect,
  onVendorapayDisconnect,
  vendorapayConnected,
}: {
  connector: Connector;
  status: "connected" | "available";
  acting: boolean;
  expanded: boolean;
  onExpand: () => void;
  onVendorapayConnect: () => void;
  onVendorapayDisconnect: () => void;
  vendorapayConnected: boolean;
}) {
  if (connector.kind === "mcp") {
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
  if (connector.kind === "vendorapay") {
    if (vendorapayConnected) {
      // When connected, show Manage (re-opens onboarding to finish or
      // update KYC) + Disconnect.
      return (
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onVendorapayConnect}
            disabled={acting}
            className="rounded-full"
          >
            {acting ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
            )}
            Manage
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onVendorapayDisconnect}
            disabled={acting}
            className="rounded-full text-destructive hover:text-destructive"
          >
            Disconnect
          </Button>
        </div>
      );
    }
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onVendorapayConnect}
        disabled={acting}
        className="rounded-full"
      >
        {acting ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
        ) : (
          <ExternalLink className="w-3.5 h-3.5 mr-1" />
        )}
        Connect
      </Button>
    );
  }
  // stripe_mcp
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onExpand}
      className="rounded-full"
    >
      {expanded ? "Hide" : status === "connected" ? "Manage" : "Connect"}
    </Button>
  );
}

function StripeMcpEditor({
  connected,
  last4,
  acting,
  onConnect,
  onDisconnect,
}: {
  connected: boolean;
  last4: string | null;
  acting: boolean;
  onConnect: (apiKey: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="border-t border-foreground/10 p-4 md:p-5 space-y-4">
      {connected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Connected
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Restricted key ending in <span className="font-mono">{last4 ?? "••••"}</span>. My Space can now call your Stripe account for any operation this key has scopes for.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-destructive hover:text-destructive"
              onClick={() => void onDisconnect()}
              disabled={acting}
            >
              {acting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Disconnect"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
            <p>
              <strong className="text-foreground">How to set this up:</strong>
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                Go to{" "}
                <a
                  href="https://dashboard.stripe.com/apikeys/create?name=Vendora+My+Space&permissions[]=rak_balance_read&permissions[]=rak_charge_read&permissions[]=rak_charge_write&permissions[]=rak_customer_read&permissions[]=rak_customer_write&permissions[]=rak_invoice_read&permissions[]=rak_invoice_write&permissions[]=rak_payment_link_write&permissions[]=rak_refund_write&permissions[]=rak_subscription_read&permissions[]=rak_subscription_write"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-foreground hover:text-[#c4541e]"
                >
                  Stripe Dashboard → Create restricted key
                </a>
                {" "}(pre-filled with sensible AI scopes).
              </li>
              <li>Copy the key (starts with <span className="font-mono">rk_live_</span> or <span className="font-mono">rk_test_</span>).</li>
              <li>Paste it below and Connect.</li>
            </ol>
            <p>
              The key never leaves Vendora's server. You can revoke it anytime in Stripe.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="rk_live_…"
              className="font-mono text-sm flex-1"
              disabled={acting}
            />
            <Button
              size="sm"
              className="rounded-full shrink-0"
              onClick={async () => {
                const v = draft.trim();
                if (!v) return;
                await onConnect(v);
                setDraft("");
              }}
              disabled={acting || draft.trim().length === 0}
            >
              {acting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Connect"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
