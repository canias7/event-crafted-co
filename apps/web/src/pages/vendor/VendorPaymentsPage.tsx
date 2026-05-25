// VendoraPay — the vendor's full money cockpit. Stripe-style internal
// nav (Overview / Transactions / Payouts / Settings) under one page
// so it feels like a real product, not a glorified Connect button.
//
// All data flows through the payments.ts module via four edge fns:
//   vendorapay-status         -> onboarded + KYC flags
//   vendorapay-balance        -> available / pending cents
//   vendorapay-transactions   -> recent balance txns
//   vendorapay-payouts        -> recent payouts + schedule
//
// When the vendor isn't onboarded, every tab still renders (with
// $0 / empty placeholders) and a single banner at the top funnels
// them into vendorapay-onboard. No tab is hidden behind a gate —
// the software is "there", even pre-verify.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  Copy,
  CreditCard,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVendorPlan, type VendorTier } from "@/hooks/useVendorPlan";
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

interface Payout {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  arrival_date: string | null;
  created_at: string;
  method: string;
  description: string | null;
}

interface PayoutsResponse {
  onboarded: boolean;
  schedule: { interval: string; delay_days: number | null } | null;
  payouts: Payout[];
}

interface Status {
  onboarded: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

type TabId = "overview" | "transactions" | "links" | "payouts" | "settings";

const TABS: Array<{ id: TabId; label: string; icon: typeof Wallet }> = [
  { id: "overview", label: "Overview", icon: Wallet },
  { id: "transactions", label: "Payments", icon: CreditCard },
  { id: "links", label: "Pay Links", icon: Link2 },
  { id: "payouts", label: "Payouts", icon: Banknote },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

interface PaymentLink {
  id: string;
  vendor_id: string;
  slug: string;
  title: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  status: "active" | "paid" | "cancelled" | "expired";
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
}

function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function kindLabel(kind: string): { label: string; tone: "in" | "out" | "neutral" } {
  switch (kind) {
    case "charge":
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

// Tier → all-in fee description for the Settings tab. Mirrors the
// server-side mapping in supabase/functions/_shared/platformFees.ts —
// keep them in sync if you change one.
const TIER_FEE_COPY: Record<
  VendorTier,
  { rate: string; vendoraCut: string; sub: string }
> = {
  free: {
    rate: "5.0% + $0.30 all-in",
    vendoraCut: "~2.1% to Vendora",
    sub: "Free plan rate. Upgrade to Pro or Studio to lower the per-charge fee.",
  },
  starter: {
    rate: "5.0% + $0.30 all-in",
    vendoraCut: "~2.1% to Vendora",
    sub: "Starter plan rate. Upgrade to Pro or Studio to lower the per-charge fee.",
  },
  pro: {
    rate: "4.0% + $0.30 all-in",
    vendoraCut: "~1.1% to Vendora",
    sub: "Pro plan rate. Upgrade to Studio for Stripe-only pricing.",
  },
  studio: {
    rate: "2.9% + $0.30 (Stripe pass-through)",
    vendoraCut: "$0 to Vendora",
    sub: "Studio plan perk: you pay only the processor's cost. Vendora takes nothing on top.",
  },
};

export default function VendorPaymentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { ownListing, user } = useAuth();
  const vendorId = ownListing?.id ?? null;
  const { tier } = useVendorPlan(user?.id ?? null);

  const tab = ((searchParams.get("tab") as TabId | null) ?? "overview") as TabId;
  const setTab = (next: TabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const [status, setStatus] = useState<Status | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payouts, setPayouts] = useState<PayoutsResponse | null>(null);
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(
    async (silent = false) => {
      if (!vendorId) return;
      if (!silent) setRefreshing(true);
      const [statusRes, balanceRes, txRes, payoutRes, linksRes] = await Promise.all([
        supabase.functions.invoke("vendorapay-status", { body: { business_id: vendorId } }),
        supabase.functions.invoke("vendorapay-balance", { body: { business_id: vendorId } }),
        supabase.functions.invoke("vendorapay-transactions", { body: { business_id: vendorId, limit: 50 } }),
        supabase.functions.invoke("vendorapay-payouts", { body: { business_id: vendorId } }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("payment_links")
          .select("id, vendor_id, slug, title, description, amount_cents, currency, status, paid_at, expires_at, created_at")
          .eq("vendor_id", vendorId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (statusRes.data) setStatus(statusRes.data as Status);
      if (balanceRes.data) setBalance(balanceRes.data as Balance);
      if (txRes.data) {
        const list = (txRes.data as { transactions?: Transaction[] }).transactions ?? [];
        setTransactions(list);
      }
      if (payoutRes.data) setPayouts(payoutRes.data as PayoutsResponse);
      if (linksRes && !linksRes.error) {
        setPaymentLinks((linksRes.data ?? []) as PaymentLink[]);
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

  const verifyBanner = useMemo(() => {
    if (!status || loading) return null;
    if (!status.onboarded) {
      return {
        title: "Verify your identity to start accepting payments",
        sub: "VendoraPay needs to know who's getting paid before money can settle. Takes about 3 minutes.",
        cta: "Get started",
      };
    }
    if (!status.details_submitted) {
      return {
        title: "Finish verifying your identity",
        sub: "You started VendoraPay setup but a few fields are still missing. Pick up where you left off.",
        cta: "Continue setup",
      };
    }
    if (!status.charges_enabled) {
      return {
        title: "We're reviewing your submission",
        sub: "Verification usually clears within a few minutes. We'll email you the moment you can accept payments.",
        cta: null,
      };
    }
    return null;
  }, [status, loading]);

  const totalGross = useMemo(
    () =>
      transactions
        .filter((t) => t.amount_cents > 0 && (t.kind === "charge" || t.kind === "payment"))
        .reduce((sum, t) => sum + t.amount_cents, 0),
    [transactions],
  );
  const totalFees = useMemo(
    () =>
      transactions
        .filter((t) => t.fee_cents > 0)
        .reduce((sum, t) => sum + t.fee_cents, 0),
    [transactions],
  );

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

          {/* Tab strip */}
          <nav className="mt-4 -mb-px flex gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const active = tab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-6">
          {/* Verify banner — appears on every tab when KYC isn't complete */}
          {verifyBanner ? (
            <section
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(135deg, rgba(255,138,76,0.1), rgba(217,119,87,0.08))",
                border: "0.5px solid rgba(255,138,76,0.3)",
              }}
            >
              <div className="flex items-start gap-4 flex-wrap">
                <div
                  className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center"
                  style={{ background: "rgba(255,138,76,0.18)" }}
                >
                  <CreditCard className="w-5 h-5" style={{ color: "#c4541e" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold">{verifyBanner.title}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{verifyBanner.sub}</p>
                </div>
                {verifyBanner.cta ? (
                  <Button onClick={handleConnect} disabled={connecting} className="rounded-full">
                    {connecting ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4 mr-1.5" />
                    )}
                    {verifyBanner.cta}
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : tab === "overview" ? (
            <OverviewTab
              balance={balance}
              transactions={transactions.slice(0, 10)}
              status={status}
              totalGross={totalGross}
              totalFees={totalFees}
              onSeeAllTransactions={() => setTab("transactions")}
            />
          ) : tab === "transactions" ? (
            <TransactionsTab transactions={transactions} status={status} />
          ) : tab === "links" ? (
            <PayLinksTab
              vendorId={vendorId}
              links={paymentLinks}
              status={status}
              onChanged={() => refresh(true)}
            />
          ) : tab === "payouts" ? (
            <PayoutsTab data={payouts} status={status} />
          ) : (
            <SettingsTab status={status} tier={tier} />
          )}
        </div>
      </main>
      <MobileNav items={vendorNavItems} />
    </div>
  );
}

// ---- Tabs --------------------------------------------------------

function OverviewTab({
  balance,
  transactions,
  status,
  totalGross,
  totalFees,
  onSeeAllTransactions,
}: {
  balance: Balance | null;
  transactions: Transaction[];
  status: Status | null;
  totalGross: number;
  totalFees: number;
  onSeeAllTransactions: () => void;
}) {
  return (
    <>
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-3">
          Balance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Available"
            sub="Ready for payout"
            value={formatMoney(balance?.available_cents ?? 0, balance?.currency)}
          />
          <StatCard
            label="Pending"
            sub="Still settling"
            value={formatMoney(balance?.pending_cents ?? 0, balance?.currency)}
          />
          <StatCard
            label="Gross volume"
            sub="Recent payments"
            value={formatMoney(totalGross, balance?.currency)}
          />
          <StatCard
            label="Fees"
            sub="Last 50 txns"
            value={formatMoney(totalFees, balance?.currency)}
          />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Recent activity
          </h2>
          {transactions.length > 0 ? (
            <button
              type="button"
              onClick={onSeeAllTransactions}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              See all
            </button>
          ) : null}
        </div>
        {transactions.length === 0 ? (
          <EmptyCard>
            {status?.charges_enabled
              ? "No transactions yet. When hosts pay you, they'll show up here."
              : "Transactions appear after your first payment."}
          </EmptyCard>
        ) : (
          <Card>
            {transactions.map((t, idx) => (
              <TransactionRow key={t.id} tx={t} showBorder={idx > 0} />
            ))}
          </Card>
        )}
      </section>
    </>
  );
}

function TransactionsTab({
  transactions,
  status,
}: {
  transactions: Transaction[];
  status: Status | null;
}) {
  if (transactions.length === 0) {
    return (
      <EmptyCard>
        {status?.charges_enabled
          ? "No transactions yet. When hosts pay you, they'll show up here."
          : "Transactions appear after your first payment."}
      </EmptyCard>
    );
  }
  return (
    <Card>
      <div className="hidden md:grid md:grid-cols-[1fr_120px_120px_140px] gap-4 px-5 py-3 border-b border-foreground/5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
        <div>Description</div>
        <div>Type</div>
        <div>Date</div>
        <div className="text-right">Amount</div>
      </div>
      {transactions.map((t) => {
        const meta = kindLabel(t.kind);
        return (
          <div
            key={t.id}
            className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_140px] gap-4 px-5 py-4 border-b border-foreground/5 last:border-b-0 items-center"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{t.description ?? meta.label}</div>
              <div className="text-[11px] text-muted-foreground md:hidden">
                {meta.label} · {formatDate(t.created_at)} · {t.status}
              </div>
            </div>
            <div className="text-xs text-muted-foreground hidden md:block">{meta.label}</div>
            <div className="text-xs text-muted-foreground hidden md:block">{formatDate(t.created_at)}</div>
            <div className="text-right">
              <div
                className={`text-sm font-semibold ${
                  meta.tone === "in" ? "text-emerald-700" : meta.tone === "out" ? "text-rose-700" : "text-foreground"
                }`}
              >
                {meta.tone === "out" ? "-" : "+"}
                {formatMoney(Math.abs(t.amount_cents), t.currency)}
              </div>
              {t.fee_cents > 0 ? (
                <div className="text-[10px] text-muted-foreground">
                  Net {formatMoney(t.net_cents, t.currency)}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function PayoutsTab({ data, status }: { data: PayoutsResponse | null; status: Status | null }) {
  const schedule = data?.schedule;
  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-3">
          Payout schedule
        </h2>
        <Card>
          <div className="p-5">
            {schedule ? (
              <div className="flex items-baseline gap-3 flex-wrap">
                <div className="text-2xl font-editorial capitalize">{schedule.interval}</div>
                {typeof schedule.delay_days === "number" ? (
                  <div className="text-sm text-muted-foreground">
                    · arrives in {schedule.delay_days} business {schedule.delay_days === 1 ? "day" : "days"}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {status?.onboarded
                  ? "Standard payout schedule. Funds arrive in your bank 2 business days after each charge settles."
                  : "Standard payout schedule: funds arrive in your bank 2 business days after each charge settles. Verify your identity to start receiving payouts."}
              </div>
            )}
          </div>
        </Card>
      </section>

      <section>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-3">
          Recent payouts
        </h2>
        {!data?.payouts || data.payouts.length === 0 ? (
          <EmptyCard>
            {status?.charges_enabled
              ? "No payouts yet. They show up after your first settled charge."
              : "Payouts begin after your first settled payment."}
          </EmptyCard>
        ) : (
          <Card>
            {data.payouts.map((p, idx) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-5 ${idx > 0 ? "border-t border-foreground/5" : ""}`}
              >
                <div className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center bg-sky-50 text-sky-700">
                  <Banknote className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {p.description ?? "Bank deposit"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                    {p.method.replace(/_/g, " ")} · arrives {formatDate(p.arrival_date)} · {p.status}
                  </div>
                </div>
                <div className="text-sm font-semibold">
                  {formatMoney(p.amount_cents, p.currency)}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function PayLinksTab({
  vendorId,
  links,
  status,
  onChanged,
}: {
  vendorId: string | null;
  links: PaymentLink[];
  status: Status | null;
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const create = useCallback(async () => {
    if (!vendorId || submitting) return;
    const cents = Math.round(parseFloat(amountDollars) * 100);
    if (!title.trim()) {
      toast.error("Title required");
      return;
    }
    if (!Number.isFinite(cents) || cents < 50) {
      toast.error("Amount must be at least $0.50");
      return;
    }
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      toast.error("Sign in required");
      setSubmitting(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("payment_links")
      .insert({
        vendor_id: vendorId,
        title: title.trim(),
        description: description.trim() || null,
        amount_cents: cents,
        created_by: userData.user.id,
      });
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't create link", { description: error.message });
      return;
    }
    toast.success("Pay link created");
    setTitle("");
    setAmountDollars("");
    setDescription("");
    setCreating(false);
    onChanged();
  }, [vendorId, title, amountDollars, description, submitting, onChanged]);

  const copyLink = useCallback((slug: string) => {
    const url = `${window.location.origin}/pay/link/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied", { description: url });
  }, []);

  const cancel = useCallback(
    async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("payment_links")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        toast.error("Couldn't cancel", { description: error.message });
        return;
      }
      toast.success("Link cancelled");
      onChanged();
    },
    [onChanged],
  );

  return (
    <div className="space-y-4">
      {/* Create form */}
      {creating ? (
        <Card>
          <div className="p-5 space-y-3">
            <h3 className="text-sm font-semibold">New pay link</h3>
            <input
              type="text"
              placeholder="What's this charge for? (e.g. Deposit for Aug 14 wedding)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.50"
                placeholder="500.00"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                className="flex-1 rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
            </div>
            <textarea
              placeholder="Optional note for the host"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none resize-none"
            />
            <div className="flex gap-2">
              <Button onClick={create} disabled={submitting} className="rounded-full">
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : null}
                Create link
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setTitle("");
                  setAmountDollars("");
                  setDescription("");
                }}
                className="rounded-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {status?.charges_enabled
              ? "Send a shareable link. Hosts pay via card; money lands in your account."
              : "Compose links now — they'll go live the moment your account is verified."}
          </p>
          <Button onClick={() => setCreating(true)} className="rounded-full">
            <Plus className="w-4 h-4 mr-1.5" />
            New pay link
          </Button>
        </div>
      )}

      {/* Existing links */}
      {links.length === 0 ? (
        <EmptyCard>No pay links yet. Click "New pay link" to create one.</EmptyCard>
      ) : (
        <Card>
          {links.map((l, idx) => (
            <div
              key={l.id}
              className={`p-5 ${idx > 0 ? "border-t border-foreground/5" : ""}`}
            >
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold truncate">{l.title}</h3>
                    <LinkStatusPill status={l.status} />
                  </div>
                  {l.description ? (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{l.description}</p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Created {formatDate(l.created_at)}
                    {l.paid_at ? ` · Paid ${formatDate(l.paid_at)}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-editorial">{formatMoney(l.amount_cents, l.currency)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {l.slug}
                  </div>
                </div>
              </div>
              {l.status === "active" ? (
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyLink(l.slug)}
                    className="rounded-full"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copy link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/pay/link/${l.slug}`, "_blank")}
                    className="rounded-full"
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancel(l.id)}
                    className="rounded-full text-muted-foreground hover:text-destructive ml-auto"
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function LinkStatusPill({ status }: { status: PaymentLink["status"] }) {
  const map: Record<PaymentLink["status"], { label: string; className: string }> = {
    active: { label: "Active", className: "bg-emerald-100 text-emerald-700" },
    paid: { label: "Paid", className: "bg-sky-100 text-sky-700" },
    cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-700" },
    expired: { label: "Expired", className: "bg-amber-100 text-amber-800" },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.className}`}>
      {m.label}
    </span>
  );
}

function SettingsTab({
  status,
  tier,
}: {
  status: Status | null;
  tier: VendorTier;
}) {
  const fee = TIER_FEE_COPY[tier];
  return (
    <div className="space-y-4">
      <SettingRow
        label="Statement descriptor"
        value="VENDORAPAY"
        sub="What your customers see on their card statement."
      />
      <SettingRow
        label={`Your fee (${tier} plan)`}
        value={fee.rate}
        sub={`${fee.vendoraCut}. ${fee.sub}`}
      />
      <SettingRow
        label="Payout cadence"
        value="Standard (2 business days)"
        sub="Funds settle to your bank 2 business days after each charge clears. Faster options are coming."
      />
      <SettingRow
        label="Currency"
        value="USD"
        sub="VendoraPay charges and pays out in US dollars."
      />
      <SettingRow
        label="Account status"
        value={
          !status
            ? "—"
            : !status.onboarded
              ? "Not connected"
              : !status.details_submitted
                ? "KYC incomplete"
                : !status.charges_enabled
                  ? "Review pending"
                  : "Active"
        }
        sub="Verification + capability state from the payments processor."
      />
    </div>
  );
}

// ---- Primitives --------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,253,250,0.7)",
        border: "0.5px solid rgba(255,138,76,0.22)",
      }}
    >
      {children}
    </div>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <div className="p-8 text-center text-sm text-muted-foreground">{children}</div>
    </Card>
  );
}

function StatCard({ label, sub, value }: { label: string; sub: string; value: string }) {
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
      <div className="text-2xl font-editorial mt-1">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function SettingRow({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <div className="p-5 flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            {label}
          </div>
          <div className="text-base font-medium mt-1">{value}</div>
        </div>
        <div className="text-xs text-muted-foreground max-w-md">{sub}</div>
      </div>
    </Card>
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
    <div className={`flex items-center gap-3 p-4 md:p-5 ${showBorder ? "border-t border-foreground/5" : ""}`}>
      <div className={`shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center ${iconTone}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{tx.description ?? meta.label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {formatDate(tx.created_at)} · {meta.label} · {tx.status}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div
          className={`text-sm font-semibold ${
            meta.tone === "in" ? "text-emerald-700" : meta.tone === "out" ? "text-rose-700" : "text-foreground"
          }`}
        >
          {meta.tone === "out" ? "-" : "+"}
          {formatMoney(Math.abs(tx.amount_cents), tx.currency)}
        </div>
        {tx.fee_cents > 0 ? (
          <div className="text-[11px] text-muted-foreground">Fee {formatMoney(tx.fee_cents, tx.currency)}</div>
        ) : null}
      </div>
    </div>
  );
}
