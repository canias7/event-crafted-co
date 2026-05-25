// Vendor integrations hub. Card grid of connectors grouped by
// category. Three patterns are live:
//
//   1. Vendora MCP — inline PAT panel (existing VendoraMcpPanel)
//   2. Stripe — OAuth onboarding via stripe-connect-onboard edge fn
//   3. Square / PayPal / Venmo / Cash App / Zelle — handle storage
//      in vendor_profiles.payment_handles JSONB. Per service, the
//      vendor types their username / link / phone / email; we save
//      it to the JSONB row and show "Connected" once filled. Hosts
//      see these on the public vendor profile as "Pay on Venmo @x"
//      style links.
//
// Why handles instead of OAuth for the latter five: Venmo / Cash
// App / Zelle are peer-to-peer with no merchant-OAuth model, and
// Square / PayPal OAuth would each be a multi-week native build
// not justified by current launch demand. Handles cover 100% of
// the actual use case ("how does the host pay me?") today, and
// can be upgraded to real OAuth per-service later without changing
// the vendor-facing surface.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Check,
  ExternalLink,
  Loader2,
  Sparkles,
  Save,
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

type ConnectorKind = "mcp" | "stripe_connect" | "handle";
type PaymentHandleKey = "square" | "paypal" | "venmo" | "cashapp" | "zelle";

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
interface StripeConnector extends BaseConnector {
  kind: "stripe_connect";
}
interface HandleConnector extends BaseConnector {
  kind: "handle";
  handleKey: PaymentHandleKey;
  placeholder: string;
  // Quick non-strict normalizer — adds @ / $ prefixes when
  // missing, leaves URLs and emails alone. Validation is
  // intentionally light; vendors enter all kinds of weird formats
  // and we don't want to reject anything that's plausibly correct.
  normalize: (raw: string) => string;
  // Builds a tappable payment URL from the saved handle. Used on
  // the public vendor profile so hosts can launch the right app
  // with a one-click. Returns null if no canonical URL exists
  // (Zelle has none — hosts paste the handle into their bank's
  // Zelle screen manually).
  toUrl?: (handle: string) => string | null;
}

type Connector = McpConnector | StripeConnector | HandleConnector;

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

// Normalizers per handle-style service. Keep these forgiving —
// vendors paste @, $, plain, URL, email; we want all of them to
// land in a useful shape without being told no.
function stripAt(s: string): string {
  return s.replace(/^@+/, "");
}
function stripDollar(s: string): string {
  return s.replace(/^\$+/, "");
}

const CONNECTORS: Connector[] = [
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
    kind: "stripe_connect",
  },
  {
    id: "square",
    name: "Square",
    category: "Payments",
    description:
      "Vendors with a Square account can drop their checkout URL or username so hosts see a Pay-with-Square button.",
    brand: (
      <BrandMark bg="#000000">
        <span className="text-white font-bold text-lg tracking-tight">□</span>
      </BrandMark>
    ),
    kind: "handle",
    handleKey: "square",
    placeholder: "square.link/u/yourname or @username",
    normalize: (raw) => raw.trim(),
    toUrl: (h) => {
      const trimmed = h.trim();
      if (!trimmed) return null;
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      // Square Checkout vanity URLs look like square.link/u/<name>.
      // Plain @handle isn't a public URL on Square; surface as text
      // only by returning null.
      if (trimmed.startsWith("@")) return null;
      if (/^square\.link\//i.test(trimmed)) return `https://${trimmed}`;
      return null;
    },
  },
  {
    id: "paypal",
    name: "PayPal",
    category: "Payments",
    description:
      "PayPal.me link or email — hosts get a Pay-with-PayPal button that pre-fills your handle.",
    brand: (
      <BrandMark bg="#003087">
        <span className="text-white font-bold text-sm tracking-tight">PP</span>
      </BrandMark>
    ),
    kind: "handle",
    handleKey: "paypal",
    placeholder: "paypal.me/yourname or you@email.com",
    normalize: (raw) => raw.trim(),
    toUrl: (h) => {
      const trimmed = h.trim();
      if (!trimmed) return null;
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      if (/^paypal\.me\//i.test(trimmed)) return `https://${trimmed}`;
      if (/@/.test(trimmed)) {
        return `https://www.paypal.com/paypalme/${trimmed.split("@")[0]}`;
      }
      return null;
    },
  },
  {
    id: "venmo",
    name: "Venmo",
    category: "Payments",
    description:
      "Your @username — hosts on mobile get a one-tap link that opens the Venmo app.",
    brand: (
      <BrandMark bg="#3D95CE">
        <span className="text-white font-bold text-lg italic">V</span>
      </BrandMark>
    ),
    kind: "handle",
    handleKey: "venmo",
    placeholder: "@yourname",
    normalize: (raw) => {
      const t = raw.trim();
      if (!t) return "";
      return "@" + stripAt(t);
    },
    toUrl: (h) =>
      h ? `https://venmo.com/${stripAt(h.trim())}` : null,
  },
  {
    id: "cashapp",
    name: "Cash App",
    category: "Payments",
    description:
      "Your $cashtag — hosts get a one-tap link that opens the Cash App and pre-fills your tag.",
    brand: (
      <BrandMark bg="#00D632">
        <span className="text-white font-bold text-lg">$</span>
      </BrandMark>
    ),
    kind: "handle",
    handleKey: "cashapp",
    placeholder: "$yourtag",
    normalize: (raw) => {
      const t = raw.trim();
      if (!t) return "";
      return "$" + stripDollar(t);
    },
    toUrl: (h) =>
      h ? `https://cash.app/${stripDollar(h.trim()) ? "$" + stripDollar(h.trim()) : ""}` : null,
  },
  {
    id: "zelle",
    name: "Zelle",
    category: "Payments",
    description:
      "Email or phone number on your bank's Zelle. Hosts paste it into their bank's Zelle screen to pay.",
    brand: (
      <BrandMark bg="#6D1ED4">
        <span className="text-white font-bold text-lg">Z</span>
      </BrandMark>
    ),
    kind: "handle",
    handleKey: "zelle",
    placeholder: "you@email.com or (555) 555-5555",
    normalize: (raw) => raw.trim(),
    // No canonical Zelle URL — host pastes into their own bank's app.
  },
];

type HandleMap = Partial<Record<PaymentHandleKey, string>>;

export default function VendorIntegrationsPage() {
  const navigate = useNavigate();
  const { ownListing } = useAuth();
  const vendorId = ownListing?.id ?? null;

  const [stripeConnected, setStripeConnected] = useState(false);
  const [handles, setHandles] = useState<HandleMap>({});
  const [expanded, setExpanded] = useState<string | null>("vendora-mcp");
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    (async () => {
      // The vendor reads their OWN payment info via the gated RPC,
      // not direct table select. The two columns
      // (payment_handles + stripe_account_id) are revoked from
      // authenticated to block scraping; the RPC re-grants by
      // caller relationship (owner OR has-inquiry-with-vendor).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc(
        "get_vendor_payment_info",
        { p_vendor_id: vendorId },
      );
      if (cancelled) return;
      const row = data as {
        stripe_account_id?: string | null;
        payment_handles?: HandleMap | null;
      } | null;
      setStripeConnected(Boolean(row?.stripe_account_id));
      setHandles({ ...(row?.payment_handles ?? {}) });
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

  async function saveHandle(key: PaymentHandleKey, raw: string) {
    if (!vendorId || actingId) return;
    const normalized = (CONNECTORS.find(
      (c) => c.kind === "handle" && (c as HandleConnector).handleKey === key,
    ) as HandleConnector | undefined)?.normalize(raw) ?? raw.trim();
    setActingId(key);
    // Optimistic local update — keystrokes feel instant.
    const next: HandleMap = { ...handles };
    if (normalized) next[key] = normalized;
    else delete next[key];
    setHandles(next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({ payment_handles: next })
      .eq("id", vendorId);
    setActingId(null);
    if (error) {
      // Roll back the local map so the input doesn't lie about
      // persisted state.
      setHandles(handles);
      toast.error("Couldn't save", { description: error.message });
      return;
    }
    toast.success(
      normalized ? `${key.toUpperCase()} updated` : `${key.toUpperCase()} cleared`,
    );
  }

  const grouped = useMemo(() => {
    return CONNECTORS.reduce<Record<string, Connector[]>>((acc, c) => {
      (acc[c.category] ||= []).push(c);
      return acc;
    }, {});
  }, []);

  function statusOf(c: Connector): "connected" | "available" {
    if (c.kind === "mcp") return "connected";
    if (c.kind === "stripe_connect") {
      return stripeConnected ? "connected" : "available";
    }
    return handles[c.handleKey] ? "connected" : "available";
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
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                            {c.description}
                          </p>
                        </div>
                        <ConnectorActionButton
                          connector={c}
                          status={status}
                          acting={actingId === c.id || actingId === (c.kind === "handle" ? c.handleKey : "")}
                          expanded={isExpanded}
                          onExpand={() =>
                            setExpanded(isExpanded ? null : c.id)
                          }
                          onStripeConnect={handleStripeConnect}
                        />
                      </div>
                      {/* Inline expand panel — MCP renders its full
                          token UI, handle-style processors render a
                          tiny input + Save row. */}
                      {isExpanded && c.kind === "mcp" ? (
                        <div className="border-t border-foreground/10 p-4 md:p-5">
                          <VendoraMcpPanel />
                        </div>
                      ) : null}
                      {isExpanded && c.kind === "handle" ? (
                        <HandleEditor
                          connector={c}
                          value={handles[c.handleKey] ?? ""}
                          saving={actingId === c.handleKey}
                          onSave={(next) => saveHandle(c.handleKey, next)}
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
  onStripeConnect,
}: {
  connector: Connector;
  status: "connected" | "available";
  acting: boolean;
  expanded: boolean;
  onExpand: () => void;
  onStripeConnect: () => void;
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
  if (connector.kind === "stripe_connect") {
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
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onExpand}
      className="rounded-full"
    >
      {expanded ? "Hide" : status === "connected" ? "Edit" : "Add"}
    </Button>
  );
}

function HandleEditor({
  connector,
  value,
  saving,
  onSave,
}: {
  connector: HandleConnector;
  value: string;
  saving: boolean;
  onSave: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Sync draft if the parent prop changes (e.g., a fresh load
  // after navigation). Doesn't clobber while user is typing.
  useEffect(() => {
    if (!saving) setDraft(value);
  }, [value, saving]);

  const previewUrl = connector.toUrl?.(connector.normalize(draft));
  const changed = draft.trim() !== value.trim();

  return (
    <div className="border-t border-foreground/10 p-4 md:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connector.placeholder}
          maxLength={120}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (changed) onSave(draft);
            }
          }}
          className="flex-1"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(draft)}
          disabled={saving || !changed}
          className="rounded-full"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5 mr-1" />
          )}
          Save
        </Button>
      </div>
      {previewUrl ? (
        <p className="text-[11px] text-muted-foreground">
          Hosts will see:{" "}
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground/80 hover:text-foreground underline underline-offset-2"
          >
            {previewUrl.replace(/^https?:\/\//, "")}
          </a>
        </p>
      ) : value ? (
        <p className="text-[11px] text-muted-foreground">
          Saved as:{" "}
          <span className="text-foreground/80 font-mono">{value}</span>
        </p>
      ) : null}
    </div>
  );
}
