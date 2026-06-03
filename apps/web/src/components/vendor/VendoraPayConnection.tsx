import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  ExternalLink,
  Landmark,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Account-level VendoraPay (Stripe Express) connection — bank/payout +
// KYC. Self-contained: fetches its own account status and runs the
// onboarding / Express-dashboard flows with empty bodies (VendoraPay is
// one connection per user, not per listing). Lives on /settings.
interface PayStatus {
  onboarded?: boolean;
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  bank?: {
    last4?: string | null;
    bank_name?: string | null;
    currency?: string | null;
  } | null;
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 36%), linear-gradient(135deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.1) 48%, rgba(255,255,255,0.04) 100%)",
        border: "1px solid rgba(255,255,255,0.55)",
        backdropFilter: "blur(52px) saturate(190%)",
        WebkitBackdropFilter: "blur(52px) saturate(190%)",
        boxShadow:
          "0 26px 64px -22px rgba(0,0,0,0.30), 0 4px 14px -8px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.85), inset 0 0 0 0.5px rgba(0,0,0,0.03)",
      }}
    >
      {children}
    </div>
  );
}

function StatusDot({
  tone,
  label,
}: {
  tone: "good" | "warn" | "info" | "bad";
  label: string;
}) {
  const palette: Record<
    typeof tone,
    { dot: string; text: string; bg: string; border: string }
  > = {
    good: { dot: "#ffffff", text: "#ffffff", bg: "#18181b", border: "transparent" },
    info: { dot: "#71717a", text: "#3f3f46", bg: "rgba(0,0,0,0.06)", border: "transparent" },
    warn: { dot: "#18181b", text: "#18181b", bg: "transparent", border: "rgba(0,0,0,0.45)" },
    bad: { dot: "#18181b", text: "#18181b", bg: "transparent", border: "rgba(0,0,0,0.45)" },
  };
  const c = palette[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} aria-hidden />
      {label}
    </span>
  );
}

async function fnError(error: { message?: string; context?: Response } | null): Promise<string> {
  let detail = "Try again in a moment.";
  const ctx = error?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.clone().json();
      detail = (body?.detail || body?.error || error?.message) ?? detail;
    } catch {
      detail = error?.message ?? detail;
    }
  } else if (error?.message) {
    detail = error.message;
  }
  return detail;
}

export function VendoraPayConnection() {
  const [status, setStatus] = useState<PayStatus | null>(null);
  // Gate rendering on the first status load — otherwise the "Connect
  // VendoraPay" CTA flashes (status starts null → !onboarded → shows,
  // then the real onboarded status arrives and hides it).
  const [loaded, setLoaded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("vendorapay-status", {
          body: {},
        });
        if (!cancelled && data) setStatus(data as PayStatus);
      } catch {
        // Network/throw — fall through so we still flip `loaded` and render
        // the cards (rather than getting stuck on the skeleton forever).
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    const { data, error } = await supabase.functions.invoke("vendorapay-onboard", {
      body: {},
    });
    if (error || !(data as { url?: string })?.url) {
      toast.error("Couldn't open VendoraPay onboarding", {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        description: await fnError(error as any),
      });
      setConnecting(false);
      return;
    }
    window.location.href = (data as { url: string }).url;
  }, [connecting]);

  const openDashboard = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    const { data, error } = await supabase.functions.invoke(
      "vendorapay-dashboard-link",
      { body: {} },
    );
    setOpening(false);
    if (error || !(data as { url?: string })?.url) {
      toast.error("Couldn't open Stripe Express", {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        description: await fnError(error as any),
      });
      return;
    }
    window.open((data as { url: string }).url, "_blank", "noopener,noreferrer");
  }, [opening]);

  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
        VendoraPay
      </h2>
      {!loaded ? (
        // Skeleton until the first status load resolves, so the cards
        // don't flash the wrong (not-connected) state first.
        <div className="space-y-3">
          <div className="h-28 rounded-3xl bg-foreground/5 animate-pulse" />
          <div className="h-28 rounded-3xl bg-foreground/5 animate-pulse" />
        </div>
      ) : (
      <div className="space-y-3">
        {!status?.onboarded ? (
          <div
            className="rounded-2xl p-5 flex items-start gap-4 flex-wrap"
            style={{
              background: "rgba(255,255,255,0.6)",
              border: "0.5px solid rgba(0,0,0,0.08)",
            }}
          >
            <div
              className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.16)", color: "#18181b" }}
            >
              <Landmark className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Connect VendoraPay</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md leading-relaxed">
                Set up payments to send invoices, accept cards, and get paid out
                to your bank. Verify your identity + bank (about 3 minutes) —
                we'll bring you right back here.
              </p>
            </div>
            <Button onClick={handleConnect} disabled={connecting} className="rounded-full">
              {connecting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              Connect VendoraPay
            </Button>
          </div>
        ) : null}

        {/* Payout method */}
        <GlassCard>
          <div className="p-5 flex items-start gap-4 flex-wrap">
            <div
              className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.5), rgba(0,0,0,0.05))",
                color: "#18181b",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8), inset 0 0 0 0.5px rgba(0,0,0,0.06)",
              }}
              aria-hidden
            >
              <Landmark className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-[15px] font-semibold leading-tight">Payout method</h3>
                {status?.bank?.last4 || status?.payouts_enabled ? (
                  <StatusDot tone="good" label="Connected" />
                ) : status?.onboarded ? (
                  <StatusDot tone="warn" label="Pending" />
                ) : (
                  <StatusDot tone="warn" label="Action required" />
                )}
              </div>
              {status?.bank?.last4 ? (
                <p className="text-sm text-foreground mt-1.5">
                  {status.bank.bank_name ?? "Bank"} ····{status.bank.last4}
                  {status.bank.currency ? (
                    <span className="text-xs text-muted-foreground ml-2 uppercase">
                      {status.bank.currency}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1.5 max-w-md leading-relaxed">
                  {status?.payouts_enabled
                    ? "Your bank is connected. Manage it in the VendoraPay Express dashboard."
                    : status?.onboarded
                      ? "Add your bank account in the VendoraPay Express dashboard to receive payouts."
                      : "Link a verified bank account to start receiving automated payouts."}
                </p>
              )}
              <p
                className="text-[12px] text-muted-foreground mt-3 pl-3"
                style={{ borderLeft: "2px solid rgba(0,0,0,0.25)" }}
              >
                Funds settle T+2 business days after each successful charge.
              </p>
            </div>
            {status?.onboarded ? (
              <Button variant="outline" size="sm" onClick={openDashboard} disabled={opening} className="rounded-full">
                {opening ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
                {status?.bank?.last4 ? "Manage bank" : "Add bank"}
              </Button>
            ) : (
              <Button onClick={handleConnect} disabled={connecting} size="sm" className="rounded-full">
                {connecting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Connect account
                <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
          </div>
        </GlassCard>

        {/* Business verification */}
        <GlassCard>
          <div className="p-5 flex items-start gap-4 flex-wrap">
            <div
              className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.5), rgba(0,0,0,0.05))",
                color: "#18181b",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8), inset 0 0 0 0.5px rgba(0,0,0,0.06)",
              }}
              aria-hidden
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-[15px] font-semibold leading-tight">Business verification</h3>
                {status?.charges_enabled ? (
                  <StatusDot tone="good" label="Verified" />
                ) : status?.details_submitted ? (
                  <StatusDot tone="info" label="In review" />
                ) : (
                  <StatusDot tone="bad" label="Incomplete" />
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-md leading-relaxed">
                Submit legal entity details and tax ID (EIN or SSN) to satisfy
                KYC and enable 1099-K reporting.
              </p>
              <p
                className="text-[12px] text-muted-foreground mt-3 pl-3"
                style={{ borderLeft: "2px solid rgba(0,0,0,0.25)" }}
              >
                Required by federal regulation before your first payout.
              </p>
            </div>
            {status?.onboarded ? (
              <Button variant="outline" size="sm" onClick={openDashboard} disabled={opening} className="rounded-full">
                {opening ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
                Update info
              </Button>
            ) : (
              <Button onClick={handleConnect} disabled={connecting} size="sm" className="rounded-full">
                {connecting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Start verification
                <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
          </div>
        </GlassCard>
      </div>
      )}
    </section>
  );
}
