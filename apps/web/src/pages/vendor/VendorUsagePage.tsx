import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, MessageSquare, Image, Zap, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVendorCredits } from "@/hooks/useVendorCredits";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { vendorNavItems as navItems } from "@/data/navItems";

// Usage hub for the vendor: live credit balance, period usage bar,
// per-action cost reference, recent ledger, and the Stripe customer
// portal entry point. Lifted out of VendorSubscriptionPage so the
// subscription page can focus on tier selection and top-up packs.

interface LedgerRow {
  created_at: string;
  delta: number;
  kind: string;
  action_type: string | null;
  balance_after: number;
  note: string | null;
}

const KIND_LABEL: Record<string, string> = {
  trial_grant: "Signup trial",
  monthly_grant: "Monthly grant",
  topup: "Top-up",
  consume: "Used",
  refund: "Refund",
  admin_adjust: "Admin adjustment",
};

export default function VendorUsagePage() {
  const { ownListing, user } = useAuth();
  const vendorId = ownListing?.id ?? null;
  const credits = useVendorCredits(user?.id ?? null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setLedger([]);
      setLedgerLoading(false);
      return;
    }
    let cancelled = false;
    setLedgerLoading(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_credit_transactions")
        .select("created_at, delta, kind, action_type, balance_after, note")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(25);
      if (cancelled) return;
      setLedger((data as LedgerRow[] | null) ?? []);
      setLedgerLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const usedThisPeriod = Math.max(0, credits.monthlyGrant - credits.balance);
  const usagePct = useMemo(() => {
    return credits.monthlyGrant > 0
      ? Math.min(100, Math.round((usedThisPeriod / credits.monthlyGrant) * 100))
      : null;
  }, [credits.monthlyGrant, usedThisPeriod]);

  async function openPortal() {
    if (!vendorId || actingId) return;
    setActingId("portal");
    const popup = window.open("about:blank", "_blank");
    const { data, error } = await supabase.functions.invoke("stripe-customer-portal", {
      body: { vendor_id: vendorId },
    });
    if (error || !data?.url) {
      if (popup && !popup.closed) popup.close();
      toast.error("Couldn't open billing portal", {
        description: error?.message ?? "Please try again in a moment.",
      });
      setActingId(null);
      return;
    }
    if (popup) popup.location.href = data.url as string;
    else window.location.href = data.url as string;
    setActingId(null);
  }

  return (
    <div className="min-h-screen flex relative bg-[var(--vendor-canvas)]">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <div
          className="px-4 md:px-8 pt-8 pb-6"
          style={{ borderBottom: "0.5px solid rgba(255,138,76,0.18)" }}
        >
          <h1 className="font-editorial text-3xl md:text-4xl">Usage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your credit balance, AI activity, and billing portal.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-5">
          {/* Credit balance + usage bar */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: "rgba(255,253,250,0.7)",
              border: "0.5px solid rgba(255,138,76,0.22)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI credits
                </p>
                <h2 className="font-editorial text-3xl mt-1 tnum">
                  {credits.initialized ? credits.balance.toLocaleString() : "—"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {credits.monthlyGrant > 0
                    ? `${usedThisPeriod.toLocaleString()} used this period of ${credits.monthlyGrant.toLocaleString()} included.`
                    : "Credits never expire. Top up any time from Subscription."}
                </p>
              </div>
              <Button
                onClick={openPortal}
                disabled={!vendorId || actingId !== null}
                variant="outline"
                className="rounded-full"
              >
                {actingId === "portal" ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                )}
                Manage billing
              </Button>
            </div>

            {usagePct !== null && (
              <div className="mt-4">
                <div className="h-2 rounded-full bg-foreground/8 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${usagePct}%`,
                      background:
                        usagePct >= 90
                          ? "#dc2626"
                          : usagePct >= 70
                            ? "#f59e0b"
                            : "#c4541e",
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {usagePct}% of your monthly allotment used.
                </p>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                HILUX reply: <span className="font-medium text-foreground">2 cr</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Image className="w-3.5 h-3.5" />
                Axion image: <span className="font-medium text-foreground">10 cr</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Mux stream: <span className="font-medium text-foreground">1 cr/min</span>
              </div>
            </div>
          </div>

          {/* Lifetime totals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <LifetimeCard label="Granted" value={credits.lifetimeGranted} />
            <LifetimeCard label="Topped up" value={credits.lifetimeToppedUp} />
            <LifetimeCard label="Used" value={credits.lifetimeConsumed} />
          </div>

          {/* Recent activity */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: "rgba(255,253,250,0.7)",
              border: "0.5px solid rgba(255,138,76,0.22)",
            }}
          >
            <h3 className="font-editorial text-2xl mb-1">Recent activity</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Every credit grant, top-up, and AI action — newest first.
            </p>
            {ledgerLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No activity yet. Once you use HILUX or Axion, entries land here.
              </p>
            ) : (
              <ul className="divide-y divide-foreground/8">
                {ledger.map((row, i) => {
                  const positive = row.delta >= 0;
                  return (
                    <li
                      key={`${row.created_at}-${i}`}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {KIND_LABEL[row.kind] ?? row.kind}
                          {row.action_type ? ` · ${row.action_type}` : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(row.created_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                          {row.note ? ` — ${row.note}` : ""}
                        </p>
                      </div>
                      <div
                        className={`text-sm font-semibold tnum shrink-0 ${
                          positive ? "text-emerald-600" : "text-foreground"
                        }`}
                      >
                        {positive ? "+" : ""}
                        {row.delta.toLocaleString()}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
      <MobileNav variant="vendor" />
    </div>
  );
}

function LifetimeCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "rgba(255,253,250,0.7)",
        border: "0.5px solid rgba(255,138,76,0.22)",
      }}
    >
      <p className="font-label text-muted-foreground text-xs">{label}</p>
      <p className="font-editorial text-2xl mt-1 tnum">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
