// VendoraPay dashboard. The vendor's money cockpit:
//   - Status hero: are you set up to receive payments?
//   - Balance: available + pending cents
//   - Recent transactions: charges, fees, payouts, refunds
//
// Data sources (all behind the payments.ts module):
//   vendorapay-status        -> onboarded + KYC flags
//   vendorapay-balance       -> available / pending cents + currency
//   vendorapay-transactions  -> last 25 balance transactions
//
// When the vendor isn't onboarded, the page shows an inline CTA that
// kicks them into the same vendorapay-onboard flow that lives on the
// Integrations page — no need to navigate away.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { vendorNavItems } from "@/data/navItems";

interface Balance {
  available_cents: number;
  pending_cents: number;
  currency: string;
  onboarded: boolean;
}

interface Transaction {
  id: string;
  kind: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  currency: string;
  status: string;
  created_at: string;
  description: string | null;
}

interface Status {
  onboarded: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function kindLabel(kind: string): { label: string; tone: "in" | "out" | "neutral" } {
  switch (kind) {
    case "charge":
      return { label: "Payment", tone: "in" };
    case "payment":
      return { label: "Payment", tone: "in" };
    case "refund":
      return { label: "Refund", tone: "out" };
    case "payout":
      return { label: "Payout", tone: "out" };
    case "application_fee":
    case "stripe_fee":
      return { label: "Platform fee", tone: "out" };
    case "adjustment":
      return { label: "Adjustment", tone: "neutral" };
    default:
      return { label: kind.replace(/_/g, " "), tone: "neutral" };
  }
}

export default function VendorPaymentsPage() {
  const navigate = useNavigate();
  const { ownListing } = useAuth();
  const vendorId = ownListing?.id ?? null;

  const [status, setStatus] = useState<Status | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(
    async (silent = false) => {
      if (!vendorId) return;
      if (!silent) setRefreshing(true);
      const [statusRes, balanceRes, txRes] = await Promise.all([
        supabase.functions.invoke("vendorapay-status", { body: { business_id: vendorId } }),
        supabase.functions.invoke("vendorapay-balance", { body: { business_id: vendorId } }),
        supabase.functions.invoke("vendorapay-transactions", { body: { business_id: vendorId, limit: 25 } }),
      ]);
      if (statusRes.data) setStatus(statusRes.data as Status);
      if (balanceRes.data) setBalance(balanceRes.data as Balance);
      if (txRes.data) {
        const list = (txRes.data as { transactions?: Transaction[] }).transactions ?? [];
        setTransactions(list);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [vendorId],
  );

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const handleConnect = useCallback(async () => {
    if (!vendorId || connecting) return;
    setConnecting(true);
    const { data, error } = await supabase.functions.invoke("vendorapay-onboard", {
      body: { business_id: vendorId },
    });
    if (error || !(data as { url?: string })?.url) {
      let detail = "Try again in a moment.";
      const ctx = (error as { context?: Response } | null)?.context;
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
      toast.error("Couldn't open VendoraPay onboarding", { description: detail });
      setConnecting(false);
      return;
    }
    window.location.href = (data as { url: string }).url;
  }, [vendorId, connecting]);

  const heroBadge = useMemo(() => {
    if (!status) return null;
    if (!status.onboarded) {
      return { label: "Not connected", className: "bg-slate-100 text-slate-700" };
    }
    if (!status.details_submitted) {
      return { label: "KYC incomplete", className: "bg-amber-100 text-amber-800" };
    }
    if (!status.charges_enabled) {
      return { label: "Review pending", className: "bg-amber-100 text-amber-800" };
    }
    return { label: "Active", className: "bg-emerald-100 text-emerald-700" };
  }, [status]);

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={vendorNavItems} title="Vendor Portal" backPath="/settings" />
      <main className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40">
          <button
            type="button"
            onClick={() => navigate("/vendor/me")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ChevronLeft className="w-3 h-3" />
            Profile
          </button>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-editorial text-3xl">VendoraPay</h1>
              <p className="text-sm text-muted-foreground">
                Accept card payments and track payouts from one place.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh(false)}
              disabled={refreshing || loading}
              className="rounded-full"
            >
              {refreshing ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-4xl space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Status hero */}
              <section
                className="rounded-2xl p-5 md:p-6"
                style={{
                  background: "linear-gradient(135deg, rgba(255,138,76,0.08), rgba(217,119,87,0.08))",
                  border: "0.5px solid rgba(255,138,76,0.25)",
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="shrink-0 w-12 h-12 rounded-xl inline-flex items-center justify-center"
                    style={{ background: "rgba(255,138,76,0.18)" }}
                  >
                    <CreditCard className="w-6 h-6" style={{ color: "#c4541e" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold">Account status</h2>
                      {heroBadge ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${heroBadge.className}`}
                        >
                          {heroBadge.label}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {!status?.onboarded
                        ? "Connect VendoraPay to accept card payments. Funds settle straight to your bank."
                        : !status.details_submitted
                          ? "Finish identity verification to start accepting payments."
                          : !status.charges_enabled
                            ? "We're reviewing your submission. This usually clears within minutes."
                            : "You're set up to accept card payments. Receipts and payouts run automatically."}
                    </p>
                    <div className="mt-4 flex gap-2 flex-wrap">
                      {!status?.onboarded ? (
                        <Button onClick={handleConnect} disabled={connecting} className="rounded-full">
                          {connecting ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-4 h-4 mr-1.5" />
                          )}
                          Connect VendoraPay
                        </Button>
                      ) : !status.details_submitted || !status.charges_enabled ? (
                        <Button onClick={handleConnect} disabled={connecting} variant="outline" className="rounded-full">
                          {connecting ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-4 h-4 mr-1.5" />
                          )}
                          Continue setup
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              {/* Balance */}
              <section>
                <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-3">
                  Balance
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <BalanceCard
                    label="Available"
                    sub="Settled funds ready for payout"
                    cents={balance?.available_cents ?? 0}
                    currency={balance?.currency ?? "usd"}
                  />
                  <BalanceCard
                    label="Pending"
                    sub="Recent payments still settling"
                    cents={balance?.pending_cents ?? 0}
                    currency={balance?.currency ?? "usd"}
                  />
                </div>
              </section>

              {/* Transactions */}
              <section>
                <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-3">
                  Recent activity
                </h2>
                {transactions.length === 0 ? (
                  <div
                    className="rounded-2xl p-8 text-center"
                    style={{
                      background: "rgba(255,253,250,0.7)",
                      border: "0.5px solid rgba(255,138,76,0.22)",
                    }}
                  >
                    <p className="text-sm text-muted-foreground">
                      {status?.onboarded && status.charges_enabled
                        ? "No transactions yet. When hosts pay you, they'll show up here."
                        : "Transactions appear after your first payment."}
                    </p>
                  </div>
                ) : (
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: "rgba(255,253,250,0.7)",
                      border: "0.5px solid rgba(255,138,76,0.22)",
                    }}
                  >
                    {transactions.map((t, idx) => (
                      <TransactionRow
                        key={t.id}
                        tx={t}
                        showBorder={idx > 0}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
      <MobileNav items={vendorNavItems} />
    </div>
  );
}

function BalanceCard({
  label,
  sub,
  cents,
  currency,
}: {
  label: string;
  sub: string;
  cents: number;
  currency: string;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "rgba(255,253,250,0.7)",
        border: "0.5px solid rgba(255,138,76,0.22)",
      }}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-3xl font-editorial mt-1">{formatMoney(cents, currency)}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function TransactionRow({ tx, showBorder }: { tx: Transaction; showBorder: boolean }) {
  const meta = kindLabel(tx.kind);
  const Icon = meta.tone === "in" ? ArrowDownRight : meta.tone === "out" ? ArrowUpRight : ArrowDownRight;
  const iconTone =
    meta.tone === "in"
      ? "text-emerald-600 bg-emerald-50"
      : meta.tone === "out"
        ? "text-rose-600 bg-rose-50"
        : "text-slate-600 bg-slate-50";
  return (
    <div
      className={`flex items-center gap-3 p-4 md:p-5 ${showBorder ? "border-t border-foreground/5" : ""}`}
    >
      <div className={`shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center ${iconTone}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {tx.description ?? meta.label}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {formatDate(tx.created_at)} · {meta.label} · {tx.status}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div
          className={`text-sm font-semibold ${
            meta.tone === "in"
              ? "text-emerald-700"
              : meta.tone === "out"
                ? "text-rose-700"
                : "text-foreground"
          }`}
        >
          {meta.tone === "out" ? "-" : "+"}
          {formatMoney(Math.abs(tx.amount_cents), tx.currency)}
        </div>
        {tx.fee_cents > 0 ? (
          <div className="text-[11px] text-muted-foreground">
            Fee {formatMoney(tx.fee_cents, tx.currency)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
