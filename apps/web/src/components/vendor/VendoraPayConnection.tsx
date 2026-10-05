import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import i18n from "@/i18n";

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
      className="rounded-2xl overflow-hidden"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
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
    good: { dot: "#ffffff", text: "#ffffff", bg: "#14161a", border: "transparent" },
    info: { dot: "#71717a", text: "#3f3f46", bg: "rgba(0,0,0,0.06)", border: "transparent" },
    warn: { dot: "#14161a", text: "#14161a", bg: "transparent", border: "rgba(0,0,0,0.45)" },
    bad: { dot: "#14161a", text: "#14161a", bg: "transparent", border: "rgba(0,0,0,0.45)" },
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
  let detail = i18n.t("pay.try_again", { ns: "vendorPayments" });
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
  const { t } = useTranslation("vendorPayments");
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
      toast.error(t("pay.onboarding_failed"), {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        description: await fnError(error as any),
      });
      setConnecting(false);
      return;
    }
    window.location.href = (data as { url: string }).url;
  }, [connecting, t]);

  const openDashboard = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    const { data, error } = await supabase.functions.invoke(
      "vendorapay-dashboard-link",
      { body: {} },
    );
    setOpening(false);
    if (error || !(data as { url?: string })?.url) {
      toast.error(t("pay.express_failed"), {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        description: await fnError(error as any),
      });
      return;
    }
    window.open((data as { url: string }).url, "_blank", "noopener,noreferrer");
  }, [opening, t]);

  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-border">
        VendoraPay
      </h2>
      {!loaded ? (
        // Skeleton until the first status load resolves, so the cards
        // don't flash the wrong (not-connected) state first.
        <div className="space-y-3">
          <div className="h-28 rounded-2xl bg-foreground/5 animate-pulse" />
          <div className="h-28 rounded-2xl bg-foreground/5 animate-pulse" />
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
              style={{ background: "rgba(0,0,0,0.16)", color: "#14161a" }}
            >
              <Landmark className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">{t("pay.connect_title")}</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md leading-relaxed">
                {t("pay.connect_body")}
              </p>
            </div>
            <Button onClick={handleConnect} disabled={connecting} className="rounded-full">
              {connecting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              {t("pay.connect_button")}
            </Button>
          </div>
        ) : null}

        {/* Payout method */}
        <GlassCard>
          <div className="p-5 flex items-start gap-4 flex-wrap">
            <div
              className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center"
              style={{
                background: "hsl(var(--muted))",
                color: "#14161a",
              }}
              aria-hidden
            >
              <Landmark className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-[15px] font-semibold leading-tight">{t("pay.payout_method")}</h3>
                {status?.bank?.last4 || status?.payouts_enabled ? (
                  <StatusDot tone="good" label={t("pay.status.connected")} />
                ) : status?.onboarded ? (
                  <StatusDot tone="warn" label={t("pay.status.pending")} />
                ) : (
                  <StatusDot tone="warn" label={t("pay.status.action_required")} />
                )}
              </div>
              {status?.bank?.last4 ? (
                <p className="text-sm text-foreground mt-1.5">
                  {status.bank.bank_name ?? t("pay.bank")} ····{status.bank.last4}
                  {status.bank.currency ? (
                    <span className="text-xs text-muted-foreground ml-2 uppercase">
                      {status.bank.currency}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1.5 max-w-md leading-relaxed">
                  {status?.payouts_enabled
                    ? t("pay.bank_connected")
                    : status?.onboarded
                      ? t("pay.add_bank_in_dashboard")
                      : t("pay.link_bank")}
                </p>
              )}
              <p
                className="text-[12px] text-muted-foreground mt-3 pl-3"
                style={{ borderLeft: "2px solid rgba(0,0,0,0.25)" }}
              >
                {t("pay.settle_note")}
              </p>
            </div>
            {status?.onboarded ? (
              <Button variant="outline" size="sm" onClick={openDashboard} disabled={opening} className="rounded-full">
                {opening ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
                {status?.bank?.last4 ? t("pay.manage_bank") : t("pay.add_bank")}
              </Button>
            ) : (
              <Button onClick={handleConnect} disabled={connecting} size="sm" className="rounded-full">
                {connecting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                {t("pay.connect_account")}
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
                background: "hsl(var(--muted))",
                color: "#14161a",
              }}
              aria-hidden
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-[15px] font-semibold leading-tight">{t("pay.verification_title")}</h3>
                {status?.charges_enabled ? (
                  <StatusDot tone="good" label={t("pay.status.verified")} />
                ) : status?.details_submitted ? (
                  <StatusDot tone="info" label={t("pay.status.in_review")} />
                ) : (
                  <StatusDot tone="bad" label={t("pay.status.incomplete")} />
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-md leading-relaxed">
                {t("pay.verification_body")}
              </p>
              <p
                className="text-[12px] text-muted-foreground mt-3 pl-3"
                style={{ borderLeft: "2px solid rgba(0,0,0,0.25)" }}
              >
                {t("pay.verification_note")}
              </p>
            </div>
            {status?.onboarded ? (
              <Button variant="outline" size="sm" onClick={openDashboard} disabled={opening} className="rounded-full">
                {opening ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
                {t("pay.update_info")}
              </Button>
            ) : (
              <Button onClick={handleConnect} disabled={connecting} size="sm" className="rounded-full">
                {connecting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                {t("pay.start_verification")}
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
