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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileEdit,
  FileText,
  Landmark,
  Link2,
  Loader2,
  Mail,
  Plug,
  Plus,
  RefreshCw,
  ScrollText,
  Settings as SettingsIcon,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVendorPlan, type VendorTier } from "@/hooks/useVendorPlan";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { vendorNavItems } from "@/data/navItems";
import {
  ListingPicker,
  type ListingOpt,
} from "@/components/vendor/ListingPicker";
import { LogoCropperModal } from "@/components/vendor/LogoCropperModal";
import { InvoicePreview } from "@/components/vendor/InvoicePreview";
import {
  CONTRACT_TEMPLATES,
  INVOICE_TEMPLATES,
  PROPOSAL_TEMPLATES,
  type DocTemplate,
  type InvoiceTemplate,
} from "@/data/vendorapayTemplates";

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
  /**
   * PaymentIntent id when the underlying source is a charge.
   * Required for refunds — `id` is a balance-txn id which
   * Stripe's refunds.create rejects.
   */
  payment_intent_id: string | null;
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
  bank?: {
    bank_name: string | null;
    last4: string | null;
    currency: string | null;
  } | null;
}

type TabId = "overview" | "transactions" | "files" | "customers" | "links" | "payouts" | "disputes" | "integrations" | "settings";

const TABS: Array<{ id: TabId; label: string; icon: typeof Wallet }> = [
  { id: "overview", label: "Overview", icon: Wallet },
  { id: "transactions", label: "Payments", icon: CreditCard },
  // "Files" rolls up Invoices, Contracts, Proposals, Scheduling,
  // Services, and Questionnaires under a single tab with its own
  // internal sub-nav (HoneyBook-style "All files" surface).
  { id: "files", label: "Files", icon: FileText },
  { id: "customers", label: "Customers", icon: Users },
  { id: "links", label: "Pay Links", icon: Link2 },
  { id: "payouts", label: "Payouts", icon: Banknote },
  { id: "disputes", label: "Disputes", icon: AlertTriangle },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

// Sub-tabs inside the Files tab. Only Invoices is fully implemented
// today — the rest render a "coming soon" placeholder. URL state
// uses `?tab=files&file=<id>` (the default Invoices is omitted from
// the URL to keep links clean).
type FileTabId = "invoices" | "contracts" | "proposals";

const FILES_TABS: Array<{
  id: FileTabId;
  label: string;
  icon: typeof Wallet;
  description: string;
}> = [
  {
    id: "invoices",
    label: "Invoices",
    icon: FileText,
    description: "Build a multi-line invoice, email it to the host, get paid via card.",
  },
  {
    id: "contracts",
    label: "Contracts",
    icon: ScrollText,
    description: "Send signable contracts and track e-signatures.",
  },
  {
    id: "proposals",
    label: "Proposals",
    icon: FileEdit,
    description: "Pitch packages with line-items and let hosts accept in one click.",
  },
];

interface InvoiceLineItem {
  name: string;
  description?: string | null;
  qty: number;
  unit_price_cents: number;
  total_cents: number;
}

interface Invoice {
  id: string;
  vendor_id: string;
  slug: string;
  invoice_number: string;
  bill_to_name: string | null;
  bill_to_email: string | null;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  line_items: InvoiceLineItem[];
  subtotal_cents: number;
  tax_rate_bps: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "cancelled" | "overdue";
  sent_at: string | null;
  paid_at: string | null;
  /** Latest decline reason from Stripe, when buyer's last attempt failed. */
  payment_failure_message?: string | null;
  /** Cleared on successful payment; non-null means a failed attempt is pending retry. */
  payment_failed_at?: string | null;
  payment_attempts?: number;
  created_at: string;
}

interface PaymentLink {
  id: string;
  vendor_id: string;
  slug: string;
  title: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  status: "active" | "paid" | "cancelled" | "expired" | "scheduled";
  paid_at: string | null;
  expires_at: string | null;
  activate_at: string | null;
  parent_link_id: string | null;
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
  const { user } = useAuth();
  const { tier, loading: tierLoading } = useVendorPlan(user?.id ?? null);

  // Per-listing scope (mirrors Calendar + Leads). Each vendor_profile
  // has its own stripe_account_id, so switching listings switches the
  // Stripe data shown here. Auto-selects the first approved listing.
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    null,
  );
  const [listingPickerOpen, setListingPickerOpen] = useState(false);
  const vendorId = selectedListingId;

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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(
    async (silent = false) => {
      if (!vendorId) {
        // No listing yet — flip loading off so the empty state shows
        // instead of an infinite spinner. (Vendor without a listing
        // can't use VendoraPay; render the "set up your profile" prompt.)
        setLoading(false);
        return;
      }
      if (!silent) setRefreshing(true);
      try {
        const [statusRes, balanceRes, txRes, payoutRes, linksRes, invoicesRes] = await Promise.all([
          supabase.functions.invoke("vendorapay-status", { body: { business_id: vendorId } }),
          supabase.functions.invoke("vendorapay-balance", { body: { business_id: vendorId } }),
          supabase.functions.invoke("vendorapay-transactions", { body: { business_id: vendorId, limit: 50 } }),
          supabase.functions.invoke("vendorapay-payouts", { body: { business_id: vendorId } }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("payment_links")
            .select("id, vendor_id, slug, title, description, amount_cents, currency, status, paid_at, expires_at, activate_at, parent_link_id, created_at")
            .eq("vendor_id", vendorId)
            .order("created_at", { ascending: false })
            .limit(50),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("invoices")
            .select("id, vendor_id, slug, invoice_number, bill_to_name, bill_to_email, issue_date, due_date, notes, line_items, subtotal_cents, tax_rate_bps, tax_cents, total_cents, currency, status, sent_at, paid_at, payment_failure_message, payment_failed_at, payment_attempts, created_at")
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
        if (invoicesRes && !invoicesRes.error) {
          setInvoices((invoicesRes.data ?? []) as Invoice[]);
        }
      } catch (err) {
        // One bad fetch shouldn't trap the page in loading state.
        // Log and let the UI render with whatever we have (likely empty
        // states for the failing sections).
        console.error("[vendor-payments] refresh failed", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [vendorId],
  );

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  // Fetch all listings owned by this vendor for the picker. Auto-
  // selects the first approved one; otherwise leaves selection null
  // so the "connect VendoraPay" path still works for a pre-approval
  // vendor (the connect handler tolerates a missing business_id).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setListingsLoading(true);
      const { data } = await supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, location, application_status, logo_url, default_tax_pct",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const rows = (data ?? []) as ListingOpt[];
      setListings(rows);
      const firstApproved = rows.find(
        (l) => l.application_status === "approved",
      );
      setSelectedListingId((prev) => prev ?? firstApproved?.id ?? null);
      setListingsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleConnect = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    // Server auto-creates a vendor_profile if business_id is omitted,
    // so the connect button works even before the vendor has a listing.
    const { data, error } = await supabase.functions.invoke("vendorapay-onboard", {
      body: vendorId ? { business_id: vendorId } : {},
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

  // Open the vendor's Stripe Express dashboard in a new tab. Used by
  // the "payouts gated" verify banner (the vendor finishes the
  // missing requirement on Stripe's side, not ours).
  const openExpressDashboard = useCallback(async () => {
    if (!vendorId) return;
    const { data, error } = await supabase.functions.invoke(
      "vendorapay-dashboard-link",
      { body: { business_id: vendorId } },
    );
    if (error || !(data as { url?: string })?.url) {
      toast.error("Couldn't open Stripe dashboard", {
        description: error?.message ?? "Try again in a moment.",
      });
      return;
    }
    window.open((data as { url: string }).url, "_blank", "noopener,noreferrer");
  }, [vendorId]);

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
    // Charges work, payouts don't — Stripe needs one more thing
    // (often the SSN's last 4 or a business address) before money
    // can settle to the bank. Surface it loudly so vendors don't
    // wonder why their balance is stuck.
    if (!status.payouts_enabled) {
      return {
        title: "One more step before payouts can land",
        sub: "You're accepting payments, but Stripe needs a final detail before they settle to your bank. Finish in the Stripe dashboard.",
        cta: "Open Stripe dashboard",
        action: "dashboard" as const,
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

          {/* Internal VendoraPay tab strip (Overview / Payments / etc.) */}
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
          {/* Listing picker — every Stripe query is scoped to whichever
              listing the vendor picks here. Each vendor_profile has its
              own stripe_account_id so the picker swaps the entire money
              view (balance / transactions / payouts). Hidden when the
              vendor hasn't created any listings yet (the "no listing"
              banner below handles that case). */}
          {(listings.length > 0 || listingsLoading) && (
            <ListingPicker
              listings={listings}
              loading={listingsLoading}
              selectedId={selectedListingId}
              onSelect={(id) => {
                setSelectedListingId(id);
                setListingPickerOpen(false);
              }}
              open={listingPickerOpen}
              onOpenChange={setListingPickerOpen}
            />
          )}

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
                  <Button
                    onClick={
                      verifyBanner.action === "dashboard"
                        ? openExpressDashboard
                        : handleConnect
                    }
                    disabled={connecting}
                    className="rounded-full"
                  >
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

          {/* Inline banner when the vendor has no listing yet. Skips
              the "set up profile" step — the connect handler will
              auto-create a draft vendor_profile on the server so the
              user can jump straight to Stripe Express. */}
          {!vendorId && !loading ? (
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
                  <h2 className="text-base font-semibold">Connect VendoraPay to start accepting payments</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Verify your identity + bank account with Stripe (3 min).
                    No need to finish your full vendor profile first.
                  </p>
                </div>
                <Button onClick={handleConnect} disabled={connecting} className="rounded-full">
                  {connecting ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <ExternalLink className="w-4 h-4 mr-1.5" />
                  )}
                  Connect VendoraPay
                </Button>
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
              invoices={invoices}
              vendorId={vendorId}
              totalGross={totalGross}
              totalFees={totalFees}
              onSeeAllTransactions={() => setTab("transactions")}
            />
          ) : tab === "transactions" ? (
            <TransactionsTab
              transactions={transactions}
              status={status}
              vendorId={vendorId}
              onRefunded={() => refresh(false)}
            />
          ) : tab === "files" ? (
            <FilesTab
              vendorId={vendorId}
              listing={listings.find((l) => l.id === selectedListingId) ?? null}
              invoices={invoices}
              status={status}
              onChanged={() => refresh(true)}
            />
          ) : tab === "customers" ? (
            <CustomersTab
              vendorId={vendorId}
              listing={listings.find((l) => l.id === selectedListingId) ?? null}
              invoices={invoices}
              onChanged={() => refresh(true)}
            />
          ) : tab === "links" ? (
            <PayLinksTab
              vendorId={vendorId}
              links={paymentLinks}
              status={status}
              onChanged={() => refresh(true)}
            />
          ) : tab === "payouts" ? (
            <PayoutsTab data={payouts} status={status} />
          ) : tab === "disputes" ? (
            <DisputesTab vendorId={vendorId} />
          ) : tab === "integrations" ? (
            <IntegrationsTab status={status} vendorId={vendorId} />
          ) : (
            <SettingsTab status={status} tier={tier} tierLoading={tierLoading} />
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
  invoices,
  vendorId,
  totalGross,
  totalFees,
  onSeeAllTransactions,
}: {
  balance: Balance | null;
  transactions: Transaction[];
  status: Status | null;
  invoices: Invoice[];
  vendorId: string | null;
  totalGross: number;
  totalFees: number;
  onSeeAllTransactions: () => void;
}) {
  // Business pulse: derived KPIs that read the data already loaded
  // plus a tiny extra fetch for customer count + active recurring
  // rules so MRR + audience size show alongside Stripe balance.
  const outstandingCents = useMemo(
    () =>
      invoices
        .filter((i) => (i.status === "sent" || i.status === "overdue") && !i.paid_at)
        .reduce((s, i) => s + i.total_cents, 0),
    [invoices],
  );

  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [mrrCents, setMrrCents] = useState<number | null>(null);
  useEffect(() => {
    if (!vendorId) {
      setCustomerCount(null);
      setMrrCents(null);
      return;
    }
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [{ count: cc }, { data: rrs }] = await Promise.all([
        db
          .from("vendor_customers")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", vendorId),
        db
          .from("vendor_recurring_invoices")
          .select("interval, line_items, tax_pct")
          .eq("vendor_id", vendorId)
          .eq("active", true),
      ]);
      if (cancelled) return;
      setCustomerCount(typeof cc === "number" ? cc : 0);
      // Normalize each cadence to a monthly-equivalent so MRR
      // gives a single comparable number across intervals.
      const monthly = (rrs ?? []).reduce((sum: number, r: { interval: string; line_items: Array<{ qty: number; unit_price_cents: number; total_cents?: number }>; tax_pct: number }) => {
        const subtotal = (r.line_items ?? []).reduce(
          (s, it) => s + (it.total_cents ?? it.qty * it.unit_price_cents),
          0,
        );
        const taxBps = Math.round((r.tax_pct ?? 0) * 100);
        const total = subtotal + Math.round((subtotal * taxBps) / 10_000);
        const perMonth =
          r.interval === "weekly"
            ? (total * 52) / 12
            : r.interval === "biweekly"
              ? (total * 26) / 12
              : r.interval === "monthly"
                ? total
                : r.interval === "quarterly"
                  ? total / 3
                  : r.interval === "yearly"
                    ? total / 12
                    : 0;
        return sum + perMonth;
      }, 0);
      setMrrCents(Math.round(monthly));
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  return (
    <>
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-3">
          Business pulse
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <StatCard
            label="Outstanding"
            sub={`${invoices.filter((i) => (i.status === "sent" || i.status === "overdue") && !i.paid_at).length} unpaid invoice${
              invoices.filter((i) => (i.status === "sent" || i.status === "overdue") && !i.paid_at).length === 1 ? "" : "s"
            }`}
            value={formatMoney(outstandingCents, balance?.currency)}
          />
          <StatCard
            label="MRR forecast"
            sub="From active recurring rules"
            value={mrrCents == null ? "—" : formatMoney(mrrCents, balance?.currency)}
          />
          <StatCard
            label="Customers"
            sub="Saved on your list"
            value={customerCount == null ? "—" : customerCount.toLocaleString()}
          />
        </div>
      </section>

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
  vendorId,
  onRefunded,
}: {
  transactions: Transaction[];
  status: Status | null;
  vendorId: string | null;
  onRefunded: () => void;
}) {
  const [refundFor, setRefundFor] = useState<Transaction | null>(null);
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
    <>
      <Card>
        <div className="hidden md:grid md:grid-cols-[1fr_120px_120px_140px_100px] gap-4 px-5 py-3 border-b border-foreground/5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          <div>Description</div>
          <div>Type</div>
          <div>Date</div>
          <div className="text-right">Amount</div>
          <div className="text-right">Action</div>
        </div>
        {transactions.map((t) => {
          const meta = kindLabel(t.kind);
          // Only refund actual card charges that resolved to a PI.
          // Adjustments / fees / payouts don't refund through this
          // flow, and a charge without an exposed PI id (legacy or
          // not-yet-resolved) can't be refunded either.
          const canRefund = t.kind === "charge" && t.amount_cents > 0 && Boolean(t.payment_intent_id);
          return (
            <div
              key={t.id}
              className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_140px_100px] gap-4 px-5 py-4 border-b border-foreground/5 last:border-b-0 items-center"
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
              <div className="text-right">
                {canRefund ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRefundFor(t)}
                    className="rounded-full text-xs text-muted-foreground hover:text-destructive"
                  >
                    Refund
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </Card>
      {refundFor ? (
        <RefundModal
          tx={refundFor}
          vendorId={vendorId}
          onClose={() => setRefundFor(null)}
          onDone={() => {
            setRefundFor(null);
            onRefunded();
          }}
        />
      ) : null}
    </>
  );
}

function RefundModal({
  tx,
  vendorId,
  onClose,
  onDone,
}: {
  tx: Transaction;
  vendorId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amountDollars, setAmountDollars] = useState((tx.amount_cents / 100).toFixed(2));
  const [reason, setReason] = useState<"requested_by_customer" | "duplicate" | "fraudulent">("requested_by_customer");
  const [submitting, setSubmitting] = useState(false);

  // Use the resolved PI id from listTransactions (server-side
  // expansion of balance-txn.source.payment_intent). The Transaction
  // .id field is a balance-txn id (txn_*), which refunds.create
  // rejects with resource_missing.
  const handle = useCallback(async () => {
    if (!vendorId || submitting || !tx.payment_intent_id) return;
    const cents = Math.round(parseFloat(amountDollars) * 100);
    if (!Number.isFinite(cents) || cents < 50 || cents > tx.amount_cents) {
      toast.error("Enter a valid amount up to the original charge.");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("vendorapay-refund", {
      body: {
        business_id: vendorId,
        payment_intent_id: tx.payment_intent_id,
        amount_cents: cents === tx.amount_cents ? undefined : cents,
        reason,
      },
    });
    setSubmitting(false);
    if (error || (data as { error?: string })?.error) {
      let detail = "Try again.";
      const ctx = (error as { context?: Response } | null)?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          detail = (body?.detail || body?.error) ?? detail;
        } catch {
          detail = error?.message ?? detail;
        }
      } else if (error?.message) {
        detail = error.message;
      } else if ((data as { error?: string })?.error) {
        detail = (data as { error: string }).error;
      }
      toast.error("Refund failed", { description: detail });
      return;
    }
    toast.success("Refund issued");
    onDone();
  }, [vendorId, submitting, amountDollars, reason, tx, onDone]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Refund payment</h3>
        <p className="text-xs text-muted-foreground mt-1">{tx.description ?? "VendoraPay charge"}</p>
        <p className="text-2xl font-editorial mt-3">{formatMoney(tx.amount_cents, tx.currency)}</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Refund amount
            </label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.50"
                max={(tx.amount_cents / 100).toFixed(2)}
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                className="flex-1 rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="mt-1 w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
            >
              <option value="requested_by_customer">Requested by customer</option>
              <option value="duplicate">Duplicate charge</option>
              <option value="fraudulent">Fraudulent</option>
            </select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            VendoraPay reverses its platform fee proportionally on refunds. Funds return to the host's card in 5–10 business days.
          </p>
        </div>

        <div className="mt-5 flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={submitting} className="rounded-full">
            Cancel
          </Button>
          <Button onClick={handle} disabled={submitting} className="rounded-full">
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Refund {formatMoney(Math.round(parseFloat(amountDollars || "0") * 100), tx.currency)}
          </Button>
        </div>
      </div>
    </div>
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

// Wrapper for the Files tab — owns the secondary nav and dispatches
// to the right sub-surface. Today only Invoices is wired up; the rest
// render a friendly "coming soon" card with the same shape so the IA
// is visible to vendors and ready to fill in.
function FilesTab(props: {
  vendorId: string | null;
  listing: ListingOpt | null;
  invoices: Invoice[];
  status: Status | null;
  onChanged: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const fileTab = ((searchParams.get("file") as FileTabId | null) ?? "invoices") as FileTabId;
  const setFileTab = (next: FileTabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "invoices") params.delete("file");
    else params.set("file", next);
    setSearchParams(params, { replace: true });
  };
  const meta = FILES_TABS.find((t) => t.id === fileTab) ?? FILES_TABS[0];

  return (
    <div className="space-y-5">
      <nav className="flex gap-1 overflow-x-auto -mt-1">
        {FILES_TABS.map((t) => {
          const active = fileTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setFileTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
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

      {fileTab === "invoices" ? (
        <InvoicesTab {...props} />
      ) : fileTab === "contracts" ? (
        <DocumentCanvas
          vendorId={props.vendorId}
          listing={props.listing}
          kind="contract"
          starter={CONTRACT_TEMPLATES[0]}
        />
      ) : fileTab === "proposals" ? (
        <DocumentCanvas
          vendorId={props.vendorId}
          listing={props.listing}
          kind="proposal"
          starter={PROPOSAL_TEMPLATES[0]}
        />
      ) : null}
    </div>
  );
}

// Long-form template gallery used by Contracts and Proposals. The
// vendor previews any template in a modal and copies the body to
// their own document for now — the dedicated builders are still
// upstream. AI generation lands here next.

// Brand-only invoice template. Renders the full invoice document
// (header + meta + items + totals + notes + footer) as a preview of
// what'll land on the real PDF, with three editable controls:
// business name, city, and logo. Everything else is static
// placeholder text so the vendor can see the document shape without
// having to fill anything in here — actual invoice creation happens
// elsewhere.
function InvoiceCanvas({
  brandName,
  setBrandName,
  brandLocation,
  setBrandLocation,
  brandLogoUrl,
  brandTaxPct,
  setBrandTaxPct,
  category,
  onPickLogo,
  uploadingLogo,
}: {
  brandName: string;
  setBrandName: (v: string) => void;
  brandLocation: string;
  setBrandLocation: (v: string) => void;
  brandLogoUrl: string;
  brandTaxPct: string;
  setBrandTaxPct: (v: string) => void;
  category: string | null;
  onPickLogo: (file: File) => void | Promise<void>;
  uploadingLogo: boolean;
}) {
  const accent = "rgb(30,80,180)";
  const displayName = brandName.trim() || "[Your Business Name]";
  const displayLocation = brandLocation.trim() || "[City, State]";
  // Editable: bare input with a subtle hover/focus highlight so the
  // vendor can tell it's interactive without it looking like a form.
  const editableCls =
    "bg-transparent border-0 outline-none rounded px-1 -mx-1 transition-colors hover:bg-foreground/[0.05] focus:bg-foreground/[0.08]";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Crop step — file picked → opens LogoCropperModal; only after
  // the user confirms a crop do we hand the (cropped) JPEG to the
  // upload handler. Cancel discards.
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  return (
    <Card>
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-foreground/5">
        <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
          Invoice template
        </p>
        <span
          className="text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5"
          style={{
            background: "rgba(255,138,76,0.12)",
            color: "#c4541e",
            border: "0.5px solid rgba(255,138,76,0.3)",
          }}
        >
          AI builder soon
        </span>
      </div>

      <div className="bg-white px-6 sm:px-10 py-8 sm:py-10">
        <header className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            {/* Editable logo — click the avatar to pick a new image */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingLogo}
              className="relative group w-14 h-14 rounded-full ring-1 ring-foreground/10 shrink-0 overflow-hidden disabled:opacity-60"
              title="Change logo"
              aria-label="Change logo"
            >
              {brandLogoUrl ? (
                <img
                  src={brandLogoUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full inline-flex items-center justify-center"
                  style={{ background: "rgba(30,80,180,0.10)" }}
                >
                  <CreditCard className="w-6 h-6" style={{ color: accent }} />
                </div>
              )}
              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100">
                {uploadingLogo ? "…" : "Change"}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPendingFile(f);
                e.target.value = "";
              }}
            />
            {pendingFile && (
              <LogoCropperModal
                file={pendingFile}
                onCancel={() => setPendingFile(null)}
                onApply={(cropped) => {
                  setPendingFile(null);
                  void onPickLogo(cropped);
                }}
              />
            )}
            <div className="min-w-0">
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="[Your Business Name]"
                className={`block w-full text-xl font-bold tracking-tight ${editableCls}`}
              />
              {category && (
                <p className="text-[11px] mt-1 font-semibold text-muted-foreground tracking-wider">
                  {category}
                </p>
              )}
              <div className="mt-2" style={{ width: 36, height: 2, background: accent }} />
            </div>
          </div>
          <div className="text-right">
            <p
              className="text-[10px] font-bold"
              style={{ color: accent, letterSpacing: "0.22em" }}
            >
              INVOICE
            </p>
            <p className="text-base font-bold mt-1 tabular-nums text-muted-foreground">
              VND-XXXX
            </p>
          </div>
        </header>

        {/* Meta — Bill from is editable; rest is static placeholder */}
        <section className="mt-8 grid grid-cols-1 sm:grid-cols-4 gap-5">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Bill from
            </p>
            <p className="text-sm font-medium mt-1.5">{displayName}</p>
            <input
              type="text"
              value={brandLocation}
              onChange={(e) => setBrandLocation(e.target.value)}
              placeholder="[City, State]"
              className={`block w-full mt-0.5 text-xs text-muted-foreground ${editableCls}`}
            />
          </div>
          <StaticMeta label="Bill to" value="[Client name]" sub="[client@email.com]" />
          <StaticMeta label="Issued" value="[Today]" />
          <StaticMeta label="Due" value="[Due date]" />
        </section>

        {/* Items — static placeholder rows */}
        <section className="mt-10">
          <div
            className="grid grid-cols-[1fr_64px_120px_120px] gap-2 pb-2"
            style={{ borderBottom: "1px solid #e8e3dd" }}
          >
            {(["Item", "Qty", "Unit price", "Amount"] as const).map((h, i) => (
              <div
                key={h}
                className="text-[10px] font-semibold text-muted-foreground"
                style={{
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  textAlign: i === 0 ? "left" : "right",
                }}
              >
                {h}
              </div>
            ))}
          </div>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="grid grid-cols-[1fr_64px_120px_120px] gap-2 py-2.5 items-center text-muted-foreground"
              style={{ borderBottom: "1px solid rgba(232,227,221,0.6)" }}
            >
              <span className="text-sm">[Service or product {n}]</span>
              <span className="text-sm text-right tabular-nums">1</span>
              <span className="text-sm text-right tabular-nums">$0.00</span>
              <span className="text-sm text-right tabular-nums font-semibold">$0.00</span>
            </div>
          ))}
        </section>

        {/* Totals — static */}
        <section className="mt-6 flex justify-end">
          <div className="w-full sm:w-[280px] text-sm space-y-1.5">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">$0.00</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span>Tax</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={brandTaxPct}
                  onChange={(e) => setBrandTaxPct(e.target.value)}
                  className={`w-12 text-right tabular-nums ${editableCls}`}
                />
                <span>%</span>
              </span>
              <span className="tabular-nums">$0.00</span>
            </div>
            <div
              className="flex items-center justify-between pt-3 mt-2"
              style={{ borderTop: `2px solid ${accent}` }}
            >
              <span
                className="text-[10px] font-semibold uppercase"
                style={{ letterSpacing: "0.18em", color: accent }}
              >
                Total due
              </span>
              <span
                className="font-bold tabular-nums text-lg"
                style={{ color: accent }}
              >
                $0.00
              </span>
            </div>
          </div>
        </section>

        {/* Notes — static placeholder */}
        <section className="mt-10 pt-6" style={{ borderTop: "1px solid #e8e3dd" }}>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Notes
          </p>
          <p className="text-sm leading-relaxed mt-2 text-muted-foreground">
            [Add any scope details, delivery notes, or schedule expectations here so the recipient knows what's included.]
          </p>
        </section>

        <footer
          className="mt-10 pt-5 flex items-center justify-between text-[11px] text-muted-foreground flex-wrap gap-2"
          style={{ borderTop: "1px solid #e8e3dd" }}
        >
          <span>Thank you for your business.</span>
          <span>
            Powered by <span className="font-semibold text-foreground/70">VendoraPay</span>
          </span>
        </footer>
      </div>
    </Card>
  );
}

function StaticMeta({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="text-sm mt-1.5 text-muted-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// Single editable contract / proposal template. Vendor types title +
// body inline; Save persists to vendor_document_defaults keyed by
// (vendor_id, kind). First-time vendors get the starter content
// from CONTRACT_TEMPLATES[0] / PROPOSAL_TEMPLATES[0] as a seed.
function DocumentCanvas({
  vendorId,
  listing,
  kind,
  starter,
}: {
  vendorId: string | null;
  listing: ListingOpt | null;
  kind: "contract" | "proposal";
  starter: DocTemplate;
}) {
  const [title, setTitle] = useState(starter.title);
  const [body, setBody] = useState(starter.content);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialRef = useRef({ title: starter.title, body: starter.content });

  // Fetch the vendor's saved default for this kind. If they have
  // one, hydrate the canvas from it; otherwise leave the starter
  // seed in place.
  useEffect(() => {
    if (!vendorId) {
      setTitle(starter.title);
      setBody(starter.content);
      initialRef.current = { title: starter.title, body: starter.content };
      setLoaded(false);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_document_defaults")
        .select("template_data")
        .eq("vendor_id", vendorId)
        .eq("kind", kind)
        .maybeSingle();
      if (cancelled) return;
      if (data?.template_data) {
        const d = data.template_data as { title?: string; body?: string };
        const t = d.title ?? starter.title;
        const b = d.body ?? starter.content;
        setTitle(t);
        setBody(b);
        initialRef.current = { title: t, body: b };
      } else {
        setTitle(starter.title);
        setBody(starter.content);
        initialRef.current = { title: starter.title, body: starter.content };
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId, kind, starter.title, starter.content]);

  const dirty = title !== initialRef.current.title || body !== initialRef.current.body;

  const save = useCallback(async () => {
    if (!vendorId || saving || !dirty) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_document_defaults")
      .upsert(
        {
          vendor_id: vendorId,
          kind,
          template_data: { title, body },
        },
        { onConflict: "vendor_id,kind" },
      );
    setSaving(false);
    if (error) {
      toast.error("Couldn't save template", { description: error.message });
      return;
    }
    initialRef.current = { title, body };
    toast.success(`${kind === "contract" ? "Contract" : "Proposal"} template saved`);
  }, [vendorId, saving, dirty, kind, title, body]);

  const displayName = listing?.business_name?.trim() || "[Your Business Name]";
  const displayLocation = listing?.location?.trim() || "[City, State]";
  const editableCls =
    "bg-transparent border-0 outline-none rounded px-1 -mx-1 transition-colors hover:bg-foreground/[0.05] focus:bg-foreground/[0.08]";

  return (
    <div className="space-y-4">
      <Card>
        <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-foreground/5">
          <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
            {kind === "contract" ? "Contract template" : "Proposal template"}
          </p>
          <span
            className="text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5"
            style={{
              background: "rgba(255,138,76,0.12)",
              color: "#c4541e",
              border: "0.5px solid rgba(255,138,76,0.3)",
            }}
          >
            AI builder soon
          </span>
        </div>

        <div className="bg-white px-6 sm:px-10 py-8 sm:py-10">
          <header className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              {listing?.logo_url ? (
                <img
                  src={listing.logo_url}
                  alt={displayName}
                  className="w-14 h-14 rounded-full object-cover ring-1 ring-foreground/10 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-foreground/5 inline-flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight">{displayName}</h2>
                <p className="text-[11px] mt-0.5 text-muted-foreground tracking-wider">
                  {displayLocation}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p
                className="text-[10px] font-bold text-muted-foreground"
                style={{ letterSpacing: "0.22em" }}
              >
                {kind === "contract" ? "CONTRACT" : "PROPOSAL"}
              </p>
              <p className="text-[11px] mt-1 text-muted-foreground">
                Template
              </p>
            </div>
          </header>

          <hr className="my-7 border-foreground/10" />

          <div className="space-y-6">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`${kind === "contract" ? "Contract" : "Proposal"} title`}
              disabled={!loaded}
              className={`block w-full text-2xl font-bold tracking-tight ${editableCls}`}
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your template body here…"
              disabled={!loaded}
              rows={Math.max(18, body.split("\n").length + 2)}
              className={`block w-full text-[15px] leading-7 resize-none ${editableCls}`}
              style={{ fontFamily: "ui-serif, Georgia, 'Times New Roman', serif" }}
            />
          </div>

          <footer
            className="mt-10 pt-5 flex items-center justify-between text-[11px] text-muted-foreground flex-wrap gap-2"
            style={{ borderTop: "1px solid #e8e3dd" }}
          >
            <span>{displayName}</span>
            <span>
              Powered by <span className="font-semibold text-foreground/70">VendoraPay</span>
            </span>
          </footer>
        </div>
      </Card>

      <Card>
        <div className="p-4 flex justify-end">
          <Button
            onClick={save}
            disabled={saving || !dirty || !vendorId}
            className="rounded-full"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Save template
          </Button>
        </div>
      </Card>
    </div>
  );
}

interface DomainDnsRecord {
  record?: string;
  name: string;
  type: string;
  value: string;
  priority?: number;
  ttl?: string | number;
  status?: string;
}

interface DomainRow {
  domain: string;
  status: string;
  verified_at: string | null;
  dns_records: DomainDnsRecord[];
}

// Lets a vendor connect their own email domain so buyer receipts go
// out from noreply@<their-domain> instead of the platform default.
// Talks to vendorapay-email-domain (which proxies Resend) and to
// vendor_email_domains (RLS-gated reads).
function SenderDomainCard({ vendorId }: { vendorId: string | null }) {
  const [row, setRow] = useState<DomainRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingDomain, setSubmittingDomain] = useState("");
  const [busy, setBusy] = useState<"create" | "verify" | "remove" | null>(null);

  const refresh = useCallback(async () => {
    if (!vendorId) {
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_email_domains")
      .select("domain, status, verified_at, dns_records")
      .eq("vendor_id", vendorId)
      .maybeSingle();
    setRow((data as DomainRow | null) ?? null);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const callDomain = useCallback(
    async (action: "create" | "verify" | "remove", domain?: string) => {
      if (!vendorId) return;
      setBusy(action);
      const { data, error } = await supabase.functions.invoke(
        "vendorapay-email-domain",
        { body: { action, vendor_id: vendorId, domain } },
      );
      setBusy(null);
      if (error || !(data as { ok?: boolean })?.ok) {
        const detail =
          (error as { context?: Response } | null)?.context &&
          typeof (error as { context: Response }).context.json === "function"
            ? await (error as { context: Response }).context
                .clone()
                .json()
                .then((b) => b?.detail ?? b?.error)
                .catch(() => null)
            : (data as { detail?: string; error?: string })?.detail ??
              (data as { error?: string })?.error;
        toast.error(
          action === "create"
            ? "Couldn't connect domain"
            : action === "verify"
              ? "Couldn't verify domain"
              : "Couldn't remove domain",
          { description: detail ?? error?.message ?? undefined },
        );
        return;
      }
      if (action === "create") {
        setSubmittingDomain("");
        toast.success("Domain added", {
          description: "Set the DNS records below, then click Verify.",
        });
      } else if (action === "verify") {
        const verified = (data as { verified?: boolean }).verified;
        if (verified) {
          toast.success("Domain verified");
        } else {
          toast.message("Still pending", {
            description: "DNS hasn't propagated yet. Try again in a minute.",
          });
        }
      } else {
        toast.success("Domain removed");
      }
      await refresh();
    },
    [vendorId, refresh],
  );

  const onConnect = () => {
    if (!submittingDomain.trim()) return;
    void callDomain("create", submittingDomain.trim());
  };

  if (loading) {
    return (
      <Card>
        <div className="p-5 text-sm text-muted-foreground">Loading sender domain…</div>
      </Card>
    );
  }

  const verified = row?.status === "verified";

  return (
    <Card>
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Send from your own domain</h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
              {row
                ? verified
                  ? "Buyer receipts now go out from your domain."
                  : "Add the DNS records below to verify. Until then, emails fall back to the VendoraPay sender."
                : "Hook up a domain you own (e.g. yourbusiness.com) so receipts send from noreply@yourbusiness.com instead of the platform default."}
            </p>
          </div>
          {row ? (
            <span
              className="text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5"
              style={
                verified
                  ? {
                      background: "rgba(34,197,94,0.14)",
                      color: "#0a7c4a",
                      border: "0.5px solid rgba(34,197,94,0.35)",
                    }
                  : {
                      background: "rgba(255,138,76,0.14)",
                      color: "#c4541e",
                      border: "0.5px solid rgba(255,138,76,0.35)",
                    }
              }
            >
              {verified ? "Verified" : row.status || "Pending"}
            </span>
          ) : null}
        </div>

        {row ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-foreground/[0.03]">
              <span className="text-sm font-medium tnum">{row.domain}</span>
              <div className="flex gap-2">
                {!verified && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => callDomain("verify")}
                    disabled={busy === "verify"}
                  >
                    {busy === "verify" ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : null}
                    Check verification
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Remove ${row.domain}?`)) void callDomain("remove");
                  }}
                  disabled={busy === "remove"}
                >
                  {busy === "remove" ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : null}
                  Remove
                </Button>
              </div>
            </div>

            {!verified && row.dns_records.length > 0 && (
              <div className="rounded-lg overflow-hidden" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-foreground/[0.03]">
                  Add these DNS records at your domain registrar
                </div>
                <div className="divide-y divide-foreground/5">
                  {row.dns_records.map((r, i) => (
                    <div key={i} className="px-3 py-2.5 text-xs space-y-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">
                          {r.type}
                        </span>
                        {r.record && (
                          <span className="text-[10px] text-muted-foreground">
                            ({r.record})
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-[60px_1fr] gap-x-3 gap-y-1 font-mono">
                        <span className="text-muted-foreground">Name</span>
                        <span className="break-all">{r.name}</span>
                        <span className="text-muted-foreground">Value</span>
                        <span className="break-all">{r.value}</span>
                        {r.priority != null && (
                          <>
                            <span className="text-muted-foreground">Priority</span>
                            <span>{r.priority}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="yourbusiness.com"
              value={submittingDomain}
              onChange={(e) => setSubmittingDomain(e.target.value)}
              className="flex-1 min-w-[200px] rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
            />
            <Button
              onClick={onConnect}
              disabled={busy === "create" || !submittingDomain.trim() || !vendorId}
              className="rounded-full"
            >
              {busy === "create" ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : null}
              Connect domain
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function InvoicesTab({
  vendorId,
  listing,
  invoices,
  onChanged,
}: {
  vendorId: string | null;
  listing: ListingOpt | null;
  invoices: Invoice[];
  status: Status | null;
  onChanged: () => void;
}) {
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Brand fields — the only editable parts of the invoice template
  // surface today. Initialized from the selected listing; saving
  // upserts back into vendor_profiles so future invoices (and any
  // public invoice page) read the new values.
  const taxPctToString = (n: number | null | undefined) =>
    n ? String(n) : "";
  const [brandName, setBrandName] = useState(listing?.business_name ?? "");
  const [brandLocation, setBrandLocation] = useState(listing?.location ?? "");
  const [brandLogoUrl, setBrandLogoUrl] = useState(listing?.logo_url ?? "");
  const [brandTaxPct, setBrandTaxPct] = useState(taxPctToString(listing?.default_tax_pct));
  const [savingBrand, setSavingBrand] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const initialBrandRef = useRef({
    name: listing?.business_name ?? "",
    location: listing?.location ?? "",
    logoUrl: listing?.logo_url ?? "",
    taxPct: taxPctToString(listing?.default_tax_pct),
  });

  // Resync when the vendor picks a different listing.
  useEffect(() => {
    setBrandName(listing?.business_name ?? "");
    setBrandLocation(listing?.location ?? "");
    setBrandLogoUrl(listing?.logo_url ?? "");
    setBrandTaxPct(taxPctToString(listing?.default_tax_pct));
    initialBrandRef.current = {
      name: listing?.business_name ?? "",
      location: listing?.location ?? "",
      logoUrl: listing?.logo_url ?? "",
      taxPct: taxPctToString(listing?.default_tax_pct),
    };
  }, [
    listing?.id,
    listing?.business_name,
    listing?.location,
    listing?.logo_url,
    listing?.default_tax_pct,
  ]);

  const brandDirty =
    brandName !== initialBrandRef.current.name ||
    brandLocation !== initialBrandRef.current.location ||
    brandTaxPct !== initialBrandRef.current.taxPct ||
    brandLogoUrl !== initialBrandRef.current.logoUrl;

  const uploadLogo = useCallback(
    async (file: File) => {
      if (!vendorId) {
        toast.error("Pick a listing first.");
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("Logo must be an image file.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Logo must be under 5 MB.");
        return;
      }
      setUploadingLogo(true);
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${vendorId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("vendor-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) {
        setUploadingLogo(false);
        toast.error("Couldn't upload logo", { description: upErr.message });
        return;
      }
      const { data: pub } = supabase.storage.from("vendor-logos").getPublicUrl(path);
      setBrandLogoUrl(pub.publicUrl);
      setUploadingLogo(false);
      toast.success("Logo updated", { description: "Click Save to apply." });
    },
    [vendorId],
  );

  const saveBrand = useCallback(async () => {
    if (!vendorId || savingBrand || !brandDirty) return;
    setSavingBrand(true);
    const parsedTax = parseFloat(brandTaxPct);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        business_name: brandName.trim() || null,
        location: brandLocation.trim() || null,
        logo_url: brandLogoUrl || null,
        default_tax_pct: Number.isFinite(parsedTax) && parsedTax >= 0 ? parsedTax : 0,
      })
      .eq("id", vendorId);
    setSavingBrand(false);
    if (error) {
      toast.error("Couldn't save", { description: error.message });
      return;
    }
    initialBrandRef.current = {
      name: brandName,
      location: brandLocation,
      logoUrl: brandLogoUrl,
      taxPct: brandTaxPct,
    };
    toast.success("Business info saved");
    onChanged();
  }, [vendorId, savingBrand, brandDirty, brandName, brandLocation, brandLogoUrl, brandTaxPct, onChanged]);

  const sendInvoice = useCallback(async (id: string) => {
    setSendingId(id);
    const { error } = await supabase.functions.invoke("vendorapay-invoice-send", {
      body: { invoice_id: id },
    });
    setSendingId(null);
    if (error) {
      toast.error("Couldn't send invoice", { description: error.message });
      return;
    }
    toast.success("Invoice email sent");
    onChanged();
  }, [onChanged]);

  const cancelInvoice = useCallback(async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("invoices")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Couldn't cancel", { description: error.message });
      return;
    }
    toast.success("Invoice cancelled");
    onChanged();
  }, [onChanged]);

  const copyInvoiceLink = useCallback((slug: string) => {
    const url = `${window.location.origin}/pay/invoice/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied", { description: url });
  }, []);

  // Persist current composer state as the vendor's default for this
  return (
    <div className="space-y-4">
      {/* Brand-editable invoice template — only the Bill From block
          (business name + city) and the Logo are interactive. The
          rest is a static visual reference for the vendor so they
          can see how their saved branding will land on the real
          document. Saving writes back to vendor_profiles so the
          public invoice page picks it up next time. */}
      <InvoiceCanvas
        brandName={brandName}
        setBrandName={setBrandName}
        brandLocation={brandLocation}
        setBrandLocation={setBrandLocation}
        brandLogoUrl={brandLogoUrl}
        brandTaxPct={brandTaxPct}
        setBrandTaxPct={setBrandTaxPct}
        category={listing?.category ?? null}
        onPickLogo={uploadLogo}
        uploadingLogo={uploadingLogo}
      />
      <Card>
        <div className="p-4 flex justify-end">
          <Button
            onClick={saveBrand}
            disabled={savingBrand || !brandDirty || !vendorId}
            className="rounded-full"
          >
            {savingBrand ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : null}
            Save template
          </Button>
        </div>
      </Card>

      <SenderDomainCard vendorId={vendorId} />

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <EmptyCard>No invoices yet. Click "New invoice" to compose one.</EmptyCard>
      ) : (
        <Card>
          {invoices.map((inv, idx) => (
            <div key={inv.id} className={`p-5 ${idx > 0 ? "border-t border-foreground/5" : ""}`}>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold">{inv.invoice_number}</h3>
                    <InvoiceStatusPill status={inv.status} />
                    {inv.payment_failed_at && !inv.paid_at && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-rose-100 text-rose-700">
                        Card declined
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {inv.bill_to_name || inv.bill_to_email || "No recipient"} ·{" "}
                    {inv.line_items.length} line{inv.line_items.length === 1 ? "" : "s"} ·{" "}
                    Issued {formatDate(inv.issue_date)}
                    {inv.due_date ? ` · Due ${formatDate(inv.due_date)}` : ""}
                  </p>
                  {inv.payment_failed_at && !inv.paid_at && inv.payment_failure_message && (
                    <p className="text-xs text-rose-700 mt-1">
                      Buyer's last attempt failed: {inv.payment_failure_message}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-editorial">{formatMoney(inv.total_cents, inv.currency)}</div>
                  {inv.paid_at ? (
                    <div className="text-[10px] text-emerald-700 mt-0.5">Paid {formatDate(inv.paid_at)}</div>
                  ) : inv.sent_at ? (
                    <div className="text-[10px] text-muted-foreground mt-0.5">Sent {formatDate(inv.sent_at)}</div>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {inv.status === "draft" ? (
                  <Button
                    onClick={() => sendInvoice(inv.id)}
                    disabled={sendingId === inv.id || !inv.bill_to_email}
                    size="sm"
                    className="rounded-full"
                  >
                    {sendingId === inv.id ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Mail className="w-3.5 h-3.5 mr-1" />
                    )}
                    Send to host
                  </Button>
                ) : null}
                {(inv.status === "sent" || inv.status === "overdue") ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendInvoice(inv.id)}
                    disabled={sendingId === inv.id || !inv.bill_to_email}
                    className="rounded-full"
                  >
                    {sendingId === inv.id ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Mail className="w-3.5 h-3.5 mr-1" />
                    )}
                    Resend
                  </Button>
                ) : null}
                {(inv.status === "sent" || inv.status === "overdue") ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyInvoiceLink(inv.slug)}
                    className="rounded-full"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copy link
                  </Button>
                ) : null}
                {(inv.status === "sent" || inv.status === "overdue") ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/pay/invoice/${inv.slug}`, "_blank")}
                    className="rounded-full"
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                    Preview
                  </Button>
                ) : null}
                {(inv.status === "draft" || inv.status === "sent" || inv.status === "overdue") ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancelInvoice(inv.id)}
                    className="rounded-full text-muted-foreground hover:text-destructive ml-auto"
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function InvoiceStatusPill({ status }: { status: Invoice["status"] }) {
  const map: Record<Invoice["status"], { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-slate-100 text-slate-700" },
    sent: { label: "Sent", className: "bg-emerald-100 text-emerald-700" },
    paid: { label: "Paid", className: "bg-sky-100 text-sky-700" },
    cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-700" },
    overdue: { label: "Overdue", className: "bg-rose-100 text-rose-700" },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.className}`}>
      {m.label}
    </span>
  );
}

interface RecurringRule {
  id: string;
  vendor_id: string;
  customer_id: string;
  interval: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  line_items: Array<{ name: string; qty: number; unit_price_cents: number }>;
  notes: string | null;
  tax_pct: number;
  active: boolean;
  next_run_at: string;
  last_run_at: string | null;
}

interface Customer {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

// Customers list for the active listing. Vendors can add, edit, and
// remove client records here; later flows (re-bill, send a new
// invoice from a customer card) read from this table. Bare CRUD —
// no edge function needed because RLS gates writes by vendor_id.
function CustomersTab({
  vendorId,
  listing,
  invoices,
  onChanged,
}: {
  vendorId: string | null;
  listing: ListingOpt | null;
  invoices: Invoice[];
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [form, setForm] = useState<{ email: string; name: string; phone: string; notes: string }>({
    email: "",
    name: "",
    phone: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<Customer | null>(null);
  const [recurringTarget, setRecurringTarget] = useState<{
    customer: Customer;
    existing: RecurringRule | null;
  } | null>(null);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Group invoices by bill_to_email so each customer row can show
  // count + total billed + a per-invoice list on expand. Cheaper
  // than a second DB roundtrip and stays in sync with whatever
  // the parent already has loaded.
  const invoicesByEmail = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    for (const inv of invoices) {
      const k = (inv.bill_to_email ?? "").toLowerCase();
      if (!k) continue;
      const list = map.get(k) ?? [];
      list.push(inv);
      map.set(k, list);
    }
    return map;
  }, [invoices]);

  const refresh = useCallback(async () => {
    if (!vendorId) {
      setRows([]);
      setRecurringRules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [{ data: cs, error: csErr }, { data: rrs }] = await Promise.all([
      db
        .from("vendor_customers")
        .select("id, email, name, phone, notes, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
      db
        .from("vendor_recurring_invoices")
        .select(
          "id, vendor_id, customer_id, interval, line_items, notes, tax_pct, active, next_run_at, last_run_at",
        )
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
    ]);
    if (!csErr) setRows((cs ?? []) as Customer[]);
    setRecurringRules((rrs ?? []) as RecurringRule[]);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startNew = () => {
    setForm({ email: "", name: "", phone: "", notes: "" });
    setEditing("new");
  };

  const startEdit = (c: Customer) => {
    setForm({
      email: c.email,
      name: c.name ?? "",
      phone: c.phone ?? "",
      notes: c.notes ?? "",
    });
    setEditing(c);
  };

  const save = useCallback(async () => {
    if (!vendorId || saving) return;
    const email = form.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Valid email required");
      return;
    }
    setSaving(true);
    const payload = {
      vendor_id: vendorId,
      email,
      name: form.name.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { error } =
      editing === "new"
        ? await db
            .from("vendor_customers")
            .upsert(payload, { onConflict: "vendor_id,email" })
        : await db
            .from("vendor_customers")
            .update(payload)
            .eq("id", (editing as Customer).id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save", { description: error.message });
      return;
    }
    setEditing(null);
    toast.success(editing === "new" ? "Customer added" : "Customer updated");
    await refresh();
  }, [vendorId, saving, form, editing, refresh]);

  const remove = useCallback(
    async (c: Customer) => {
      if (!confirm(`Remove ${c.name ?? c.email}?`)) return;
      setDeletingId(c.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_customers")
        .delete()
        .eq("id", c.id);
      setDeletingId(null);
      if (error) {
        toast.error("Couldn't remove", { description: error.message });
        return;
      }
      toast.success("Customer removed");
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold">Customers</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Everyone you've billed. Save a customer once and reuse them on every invoice.
            </p>
          </div>
          <Button onClick={startNew} disabled={!vendorId} className="rounded-full" size="sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New customer
          </Button>
        </div>
      </Card>

      {editing && (
        <Card>
          <div className="p-5 space-y-3">
            <h3 className="text-sm font-semibold">
              {editing === "new" ? "New customer" : `Edit ${editing.name ?? editing.email}`}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="email"
                placeholder="email@example.com (required)"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={editing !== "new"}
                className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none disabled:opacity-60"
              />
              <input
                type="text"
                placeholder="Name (optional)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none md:col-span-2"
              />
            </div>
            <textarea
              placeholder="Notes (optional — venue contacts, dietary, preferences, …)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none resize-none"
            />
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving} className="rounded-full">
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Save customer
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)} className="rounded-full">
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <EmptyCard>Loading customers…</EmptyCard>
      ) : rows.length === 0 ? (
        <EmptyCard>No customers yet. Click "New customer" to add your first.</EmptyCard>
      ) : (
        <Card>
          {rows.map((c, idx) => {
            const custInvoices = invoicesByEmail.get(c.email.toLowerCase()) ?? [];
            const paidTotal = custInvoices
              .filter((i) => i.status === "paid")
              .reduce((s, i) => s + i.total_cents, 0);
            const expanded = expandedId === c.id;
            const custRecurring = recurringRules.find(
              (r) => r.customer_id === c.id,
            );
            return (
              <div
                key={c.id}
                className={`p-4 ${idx > 0 ? "border-t border-foreground/5" : ""}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                    className="text-left min-w-0 flex-1 hover:opacity-80 transition-opacity"
                  >
                    <p className="text-sm font-semibold">
                      {c.name?.trim() || c.email}
                    </p>
                    {c.name && (
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    )}
                    {c.phone && (
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                    )}
                    {c.notes && (
                      <p className="text-xs text-muted-foreground mt-1 max-w-md">{c.notes}</p>
                    )}
                    {custInvoices.length > 0 && (
                      <p className="text-[11px] mt-1 text-muted-foreground">
                        {custInvoices.length} invoice{custInvoices.length === 1 ? "" : "s"}
                        {paidTotal > 0 ? ` · ${formatMoney(paidTotal)} paid` : ""}
                        <span className="ml-2 text-[10px] uppercase tracking-wider">
                          {expanded ? "▾" : "▸"}
                        </span>
                      </p>
                    )}
                    {custRecurring && (
                      <p
                        className="text-[11px] mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
                        style={{
                          background: custRecurring.active
                            ? "rgba(34,197,94,0.12)"
                            : "rgba(125,119,110,0.12)",
                          color: custRecurring.active ? "#0a7c4a" : "#6b6259",
                        }}
                      >
                        <span className="font-semibold uppercase tracking-wider">
                          {custRecurring.active ? "Recurring" : "Paused"}
                        </span>
                        <span>
                          {custRecurring.interval} ·{" "}
                          {custRecurring.active
                            ? `next ${new Date(custRecurring.next_run_at).toLocaleDateString()}`
                            : "no upcoming"}
                        </span>
                      </p>
                    )}
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => setSendTarget(c)}
                      className="rounded-full"
                    >
                      <Mail className="w-3.5 h-3.5 mr-1" />
                      Send invoice
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRecurringTarget({ customer: c, existing: custRecurring ?? null })
                      }
                      className="rounded-full"
                      title={custRecurring ? "Edit recurring" : "Set up recurring"}
                    >
                      {custRecurring ? "Recurring" : "Recurring…"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(c)}
                      className="rounded-full"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(c)}
                      disabled={deletingId === c.id}
                      className="rounded-full text-muted-foreground hover:text-destructive"
                    >
                      {deletingId === c.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
                {expanded && custInvoices.length > 0 && (
                  <div
                    className="mt-3 rounded-lg overflow-hidden"
                    style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}
                  >
                    {custInvoices.map((inv, ii) => (
                      <div
                        key={inv.id}
                        className={`px-3 py-2 flex items-center justify-between gap-2 text-xs ${
                          ii > 0 ? "border-t border-foreground/5" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold tnum">
                              {inv.invoice_number || "—"}
                            </span>
                            <InvoiceStatusPill status={inv.status} />
                            {inv.payment_failed_at && !inv.paid_at && (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-rose-100 text-rose-700">
                                Card declined
                              </span>
                            )}
                          </div>
                          <span className="text-muted-foreground">
                            {formatDate(inv.issue_date)}
                            {inv.due_date ? ` · due ${formatDate(inv.due_date)}` : ""}
                          </span>
                          {inv.payment_failed_at && !inv.paid_at && inv.payment_failure_message && (
                            <p className="text-[11px] text-rose-700 mt-1">
                              {inv.payment_failure_message}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold tnum">
                            {formatMoney(inv.total_cents, inv.currency)}
                          </span>
                          <a
                            href={`/pay/invoice/${inv.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-medium text-foreground/70 hover:text-foreground"
                          >
                            View
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <SendInvoiceDialog
        open={!!sendTarget}
        onOpenChange={(v) => !v && setSendTarget(null)}
        vendorId={vendorId}
        listing={listing}
        customer={sendTarget}
        onSent={onChanged}
      />

      <RecurringDialog
        open={!!recurringTarget}
        onOpenChange={(v) => !v && setRecurringTarget(null)}
        vendorId={vendorId}
        listing={listing}
        customer={recurringTarget?.customer ?? null}
        existing={recurringTarget?.existing ?? null}
        onSaved={() => {
          setRecurringTarget(null);
          void refresh();
        }}
      />
    </div>
  );
}

// Compose and send an invoice in one step. Bill-to defaults from the
// passed customer; line items, notes, and dates the vendor fills in
// each time. Tax rate auto-pulls from the listing's saved default.
// On submit: inserts the invoice row, upserts the customer (in case
// the vendor edited name/phone), then calls vendorapay-invoice-send
// which emails the buyer via the existing branded receipt path.
// Schedule recurring invoices for a customer. Vendor picks an
// interval, defines the line items, sets a tax rate, and the
// scan-vendorapay-recurring scheduled function takes care of
// generating + emailing each one on cadence. No card-on-file —
// buyer pays each invoice through the existing /pay/invoice link.
function RecurringDialog({
  open,
  onOpenChange,
  vendorId,
  listing,
  customer,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendorId: string | null;
  listing: ListingOpt | null;
  customer: Customer | null;
  existing: RecurringRule | null;
  onSaved?: () => void;
}) {
  const defaultTax = listing?.default_tax_pct
    ? Number(listing.default_tax_pct).toString()
    : "";
  const [interval, setIntervalVal] = useState<RecurringRule["interval"]>("monthly");
  const [nextRun, setNextRun] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");
  const [taxPct, setTaxPct] = useState(defaultTax);
  const [items, setItems] = useState<
    Array<{ name: string; qty: string; price: string }>
  >([{ name: "", qty: "1", price: "" }]);
  const [active, setActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Resync when the dialog opens with new context.
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setIntervalVal(existing.interval);
      setNextRun(existing.next_run_at.slice(0, 10));
      setNotes(existing.notes ?? "");
      setTaxPct(String(existing.tax_pct ?? 0));
      setItems(
        existing.line_items.length > 0
          ? existing.line_items.map((it) => ({
              name: it.name,
              qty: String(it.qty),
              price: (it.unit_price_cents / 100).toString(),
            }))
          : [{ name: "", qty: "1", price: "" }],
      );
      setActive(existing.active);
    } else {
      setIntervalVal("monthly");
      const d = new Date();
      d.setDate(d.getDate() + 1);
      setNextRun(d.toISOString().slice(0, 10));
      setNotes("");
      setTaxPct(defaultTax);
      setItems([{ name: "", qty: "1", price: "" }]);
      setActive(true);
    }
  }, [open, existing, defaultTax]);

  const subtotalCents = items.reduce((sum, it) => {
    const q = parseInt(it.qty || "0", 10);
    const p = Math.round(parseFloat(it.price || "0") * 100);
    return sum + (Number.isFinite(q) && Number.isFinite(p) ? q * p : 0);
  }, 0);
  const taxRateBps = Math.round(parseFloat(taxPct || "0") * 100);
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
  const totalCents = subtotalCents + taxCents;

  const updateRow = (i: number, key: "name" | "qty" | "price", v: string) =>
    setItems((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: v } : row)));
  const addRow = () => setItems((r) => [...r, { name: "", qty: "1", price: "" }]);
  const removeRow = (i: number) =>
    setItems((r) => r.filter((_, idx) => idx !== i));

  const save = useCallback(async () => {
    if (!vendorId || !customer || submitting) return;
    const parsedItems = items
      .map((it) => ({
        name: it.name.trim(),
        qty: parseInt(it.qty || "0", 10),
        unit_price_cents: Math.round(parseFloat(it.price || "0") * 100),
      }))
      .filter((it) => it.name && it.qty > 0 && it.unit_price_cents > 0);
    if (parsedItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    setSubmitting(true);
    const payload = {
      vendor_id: vendorId,
      customer_id: customer.id,
      interval,
      next_run_at: new Date(`${nextRun}T09:00:00Z`).toISOString(),
      line_items: parsedItems,
      notes: notes.trim() || null,
      tax_pct: parseFloat(taxPct || "0") || 0,
      active,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { error } = existing
      ? await db
          .from("vendor_recurring_invoices")
          .update(payload)
          .eq("id", existing.id)
      : await db.from("vendor_recurring_invoices").insert(payload);
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't save recurring", { description: error.message });
      return;
    }
    toast.success(existing ? "Recurring updated" : "Recurring set up", {
      description: `Next invoice sends ${new Date(nextRun).toLocaleDateString()}.`,
    });
    onOpenChange(false);
    onSaved?.();
  }, [
    vendorId,
    customer,
    submitting,
    items,
    interval,
    nextRun,
    notes,
    taxPct,
    active,
    existing,
    onOpenChange,
    onSaved,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit recurring invoice" : "Set up recurring invoice"}
          </DialogTitle>
          <DialogDescription>
            {customer ? `For ${customer.name ?? customer.email}` : ""}
            {" · "}
            Auto-generates and emails on the cadence you pick.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-20 shrink-0">
                Interval
              </span>
              <select
                value={interval}
                onChange={(e) =>
                  setIntervalVal(e.target.value as RecurringRule["interval"])
                }
                className="flex-1 rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              >
                <option value="weekly">Every week</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-20 shrink-0">
                First send
              </span>
              <input
                type="date"
                value={nextRun}
                onChange={(e) => setNextRun(e.target.value)}
                className="flex-1 rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
            </div>
          </div>

          <div
            className="rounded-lg p-3 space-y-2"
            style={{ background: "rgba(255,138,76,0.06)" }}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Line items (repeated each cycle)
            </div>
            {items.map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_56px_96px_24px] gap-2 items-center"
              >
                <input
                  type="text"
                  placeholder="Service / item"
                  value={row.name}
                  onChange={(e) => updateRow(idx, "name", e.target.value)}
                  className="rounded-md border-0 px-2.5 py-1.5 text-sm bg-background ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Qty"
                  value={row.qty}
                  onChange={(e) => updateRow(idx, "qty", e.target.value)}
                  className="rounded-md border-0 px-2.5 py-1.5 text-sm bg-background ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Price"
                    value={row.price}
                    onChange={(e) => updateRow(idx, "price", e.target.value)}
                    className="flex-1 rounded-md border-0 px-2.5 py-1.5 text-sm bg-background ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={items.length === 1}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={addRow}
              className="rounded-full text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add line item
            </Button>
            <div className="border-t border-foreground/5 pt-3 space-y-1 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoney(subtotalCents)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  Tax
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={taxPct}
                    onChange={(e) => setTaxPct(e.target.value)}
                    className="w-12 rounded-md border-0 px-1.5 py-0.5 text-xs bg-background ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none text-right tabular-nums"
                  />
                  <span className="text-xs">%</span>
                </span>
                <span className="tabular-nums">{formatMoney(taxCents)}</span>
              </div>
              <div className="flex items-center justify-between font-semibold pt-1 border-t border-foreground/5">
                <span>Total per cycle</span>
                <span className="tabular-nums">{formatMoney(totalCents)}</span>
              </div>
            </div>
          </div>

          <textarea
            placeholder="Optional note that goes on every recurring invoice"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none resize-none"
          />

          {existing && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4"
              />
              Active — uncheck to pause future invoices
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={submitting || !vendorId}
              className="rounded-full"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : null}
              {existing ? "Save changes" : "Schedule recurring"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SendInvoiceDialog({
  open,
  onOpenChange,
  vendorId,
  listing,
  customer,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendorId: string | null;
  listing: ListingOpt | null;
  customer: Customer | null;
  onSent?: () => void;
}) {
  const defaultTax = listing?.default_tax_pct
    ? Number(listing.default_tax_pct).toString()
    : "";
  const [billToName, setBillToName] = useState(customer?.name ?? "");
  const [billToEmail, setBillToEmail] = useState(customer?.email ?? "");
  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [taxPct, setTaxPct] = useState(defaultTax);
  const [items, setItems] = useState<
    Array<{ name: string; qty: string; price: string }>
  >([{ name: "", qty: "1", price: "" }]);
  const [submitting, setSubmitting] = useState(false);

  // Resync prefills when the modal reopens for a different customer.
  useEffect(() => {
    if (!open) return;
    setBillToName(customer?.name ?? "");
    setBillToEmail(customer?.email ?? "");
    setIssueDate(new Date().toISOString().slice(0, 10));
    setDueDate("");
    setNotes("");
    setTaxPct(defaultTax);
    setItems([{ name: "", qty: "1", price: "" }]);
  }, [open, customer?.id, customer?.name, customer?.email, defaultTax]);

  const subtotalCents = items.reduce((sum, it) => {
    const q = parseInt(it.qty || "0", 10);
    const p = Math.round(parseFloat(it.price || "0") * 100);
    return sum + (Number.isFinite(q) && Number.isFinite(p) ? q * p : 0);
  }, 0);
  const taxRateBps = Math.round(parseFloat(taxPct || "0") * 100);
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
  const totalCents = subtotalCents + taxCents;

  const updateRow = (i: number, key: "name" | "qty" | "price", v: string) =>
    setItems((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: v } : row)));
  const addRow = () =>
    setItems((r) => [...r, { name: "", qty: "1", price: "" }]);
  const removeRow = (i: number) =>
    setItems((r) => r.filter((_, idx) => idx !== i));

  const send = useCallback(async () => {
    if (!vendorId || submitting) return;
    if (!billToEmail.trim()) {
      toast.error("Bill-to email required");
      return;
    }
    if (totalCents < 50) {
      toast.error("Invoice total must be at least $0.50");
      return;
    }
    const parsedItems = items
      .map((it) => ({
        name: it.name.trim(),
        qty: parseInt(it.qty || "0", 10),
        unit_price_cents: Math.round(parseFloat(it.price || "0") * 100),
      }))
      .filter(
        (it) => it.name && it.qty > 0 && it.unit_price_cents > 0,
      )
      .map((it) => ({
        name: it.name,
        qty: it.qty,
        unit_price_cents: it.unit_price_cents,
        total_cents: it.qty * it.unit_price_cents,
      }));
    if (parsedItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setSubmitting(false);
      toast.error("Sign in required");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    // Upsert the customer record so the vendor's directory stays
    // in sync even when they send to a new email from this dialog.
    await db.from("vendor_customers").upsert(
      {
        vendor_id: vendorId,
        email: billToEmail.trim().toLowerCase(),
        name: billToName.trim() || null,
      },
      { onConflict: "vendor_id,email" },
    );
    // Insert the invoice — invoice_number is filled in by a DB
    // trigger when status flips to 'sent'.
    const { data: newRow, error } = await db
      .from("invoices")
      .insert({
        vendor_id: vendorId,
        bill_to_name: billToName.trim() || null,
        bill_to_email: billToEmail.trim() || null,
        issue_date: issueDate,
        due_date: dueDate || null,
        notes: notes.trim() || null,
        line_items: parsedItems,
        subtotal_cents: subtotalCents,
        tax_rate_bps: taxRateBps,
        tax_cents: taxCents,
        total_cents: totalCents,
        status: "sent",
        sent_at: new Date().toISOString(),
        invoice_number: "",
        created_by: userData.user.id,
      })
      .select("id")
      .single();
    if (error || !newRow) {
      setSubmitting(false);
      toast.error("Couldn't create invoice", { description: error?.message });
      return;
    }
    const { error: sendErr } = await supabase.functions.invoke(
      "vendorapay-invoice-send",
      { body: { invoice_id: newRow.id } },
    );
    setSubmitting(false);
    if (sendErr) {
      toast.warning("Saved as draft — email failed", { description: sendErr.message });
    } else {
      toast.success("Invoice sent", {
        description: `Emailed to ${billToEmail.trim()}.`,
      });
    }
    onOpenChange(false);
    onSent?.();
  }, [
    vendorId,
    submitting,
    billToEmail,
    billToName,
    items,
    issueDate,
    dueDate,
    notes,
    totalCents,
    subtotalCents,
    taxRateBps,
    taxCents,
    onOpenChange,
    onSent,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send invoice</DialogTitle>
          <DialogDescription>
            Bill-to + line items go out to the buyer with your saved brand and tax rate.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Bill to name (optional)"
              value={billToName}
              onChange={(e) => setBillToName(e.target.value)}
              className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
            />
            <input
              type="email"
              placeholder="Bill to email (required)"
              value={billToEmail}
              onChange={(e) => setBillToEmail(e.target.value)}
              className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-20 shrink-0">
                Issued
              </span>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="flex-1 rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-20 shrink-0">
                Due
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1 rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
            </div>
          </div>

          <div
            className="rounded-lg p-3 space-y-2"
            style={{ background: "rgba(255,138,76,0.06)" }}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Line items
            </div>
            {items.map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_56px_96px_24px] gap-2 items-center"
              >
                <input
                  type="text"
                  placeholder="Service / item"
                  value={row.name}
                  onChange={(e) => updateRow(idx, "name", e.target.value)}
                  className="rounded-md border-0 px-2.5 py-1.5 text-sm bg-background ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Qty"
                  value={row.qty}
                  onChange={(e) => updateRow(idx, "qty", e.target.value)}
                  className="rounded-md border-0 px-2.5 py-1.5 text-sm bg-background ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Price"
                    value={row.price}
                    onChange={(e) => updateRow(idx, "price", e.target.value)}
                    className="flex-1 rounded-md border-0 px-2.5 py-1.5 text-sm bg-background ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={items.length === 1}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={addRow}
              className="rounded-full text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add line item
            </Button>
            <div className="border-t border-foreground/5 pt-3 space-y-1 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoney(subtotalCents)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  Tax
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={taxPct}
                    onChange={(e) => setTaxPct(e.target.value)}
                    className="w-12 rounded-md border-0 px-1.5 py-0.5 text-xs bg-background ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none text-right tabular-nums"
                  />
                  <span className="text-xs">%</span>
                </span>
                <span className="tabular-nums">{formatMoney(taxCents)}</span>
              </div>
              <div className="flex items-center justify-between font-semibold pt-1 border-t border-foreground/5">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(totalCents)}</span>
              </div>
            </div>
          </div>

          <textarea
            placeholder="Optional note (terms, thanks, etc.)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none resize-none"
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              onClick={send}
              disabled={submitting || !vendorId}
              className="rounded-full"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Mail className="w-3.5 h-3.5 mr-1.5" />
              )}
              Send invoice
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Dispute {
  id: string;
  stripe_dispute_id: string;
  charge_id: string;
  payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// Lifecycle states Stripe uses. Maps to a small pill summarizing
// where the dispute is. "won" / "warning_closed" are essentially
// resolved and net-positive for the vendor; "lost" / "charge_refunded"
// mean the money went back. Others = action needed or pending.
function disputeStatusPill(status: string): {
  label: string;
  className: string;
} {
  if (status === "won" || status === "warning_closed") {
    return { label: "Won", className: "bg-emerald-100 text-emerald-700" };
  }
  if (status === "lost" || status === "charge_refunded") {
    return { label: "Lost", className: "bg-rose-100 text-rose-700" };
  }
  if (status.startsWith("warning")) {
    return { label: "Warning", className: "bg-amber-100 text-amber-700" };
  }
  if (status === "needs_response") {
    return { label: "Needs response", className: "bg-orange-100 text-orange-700" };
  }
  if (status === "under_review") {
    return { label: "Under review", className: "bg-sky-100 text-sky-700" };
  }
  return { label: status.replace(/_/g, " "), className: "bg-slate-100 text-slate-700" };
}

function DisputesTab({ vendorId }: { vendorId: string | null }) {
  const [rows, setRows] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const refresh = useCallback(async () => {
    if (!vendorId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_disputes")
      .select(
        "id, stripe_dispute_id, charge_id, payment_intent_id, amount_cents, currency, reason, status, created_at, updated_at",
      )
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as Dispute[]);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Dispute responses happen on Stripe's side — we deep-link the
  // vendor into their Express dashboard for any action.
  const openExpress = useCallback(async () => {
    if (!vendorId || opening) return;
    setOpening(true);
    const { data, error } = await supabase.functions.invoke(
      "vendorapay-dashboard-link",
      { body: { business_id: vendorId } },
    );
    setOpening(false);
    if (error || !(data as { url?: string })?.url) {
      toast.error("Couldn't open Stripe dashboard", {
        description: error?.message ?? "Try again in a moment.",
      });
      return;
    }
    window.open((data as { url: string }).url, "_blank", "noopener,noreferrer");
  }, [vendorId, opening]);

  const openCount = rows.filter(
    (r) =>
      r.status === "needs_response" ||
      r.status === "under_review" ||
      r.status === "warning_needs_response" ||
      r.status === "warning_under_review",
  ).length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold">Disputes & chargebacks</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {openCount > 0
                ? `${openCount} dispute${openCount === 1 ? "" : "s"} need attention. Respond in Stripe Express.`
                : "No open disputes right now. Stripe alerts you the moment a buyer challenges a charge."}
            </p>
          </div>
          <Button
            onClick={openExpress}
            disabled={!vendorId || opening}
            className="rounded-full"
            size="sm"
          >
            {opening ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1.5" />}
            Open Stripe Express
          </Button>
        </div>
      </Card>

      {loading ? (
        <EmptyCard>Loading disputes…</EmptyCard>
      ) : rows.length === 0 ? (
        <EmptyCard>
          No disputes yet. Chargebacks land here as soon as a card issuer raises one.
        </EmptyCard>
      ) : (
        <Card>
          {rows.map((d, idx) => {
            const pill = disputeStatusPill(d.status);
            return (
              <div
                key={d.id}
                className={`p-4 ${idx > 0 ? "border-t border-foreground/5" : ""}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold tnum">
                        {formatMoney(d.amount_cents, d.currency)}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pill.className}`}
                      >
                        {pill.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Reason: {(d.reason ?? "unspecified").replace(/_/g, " ")}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Opened {formatDate(d.created_at)}
                      {d.charge_id ? ` · charge ${d.charge_id}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={openExpress}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                    Respond
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
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
  const [splitDeposit, setSplitDeposit] = useState(false);
  const [depositDollars, setDepositDollars] = useState("");
  const [balanceDueDate, setBalanceDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const create = useCallback(async () => {
    if (!vendorId || submitting) return;
    const totalCents = Math.round(parseFloat(amountDollars) * 100);
    if (!title.trim()) {
      toast.error("Title required");
      return;
    }
    if (!Number.isFinite(totalCents) || totalCents < 50) {
      toast.error("Amount must be at least $0.50");
      return;
    }

    let depositCents: number | null = null;
    let balanceCents: number | null = null;
    let balanceDueIso: string | null = null;
    if (splitDeposit) {
      depositCents = Math.round(parseFloat(depositDollars) * 100);
      if (!Number.isFinite(depositCents) || depositCents < 50 || depositCents >= totalCents) {
        toast.error("Deposit must be between $0.50 and less than the total");
        return;
      }
      if (!balanceDueDate) {
        toast.error("Pick a balance due date");
        return;
      }
      const due = new Date(balanceDueDate);
      if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) {
        toast.error("Balance due date must be in the future");
        return;
      }
      balanceCents = totalCents - depositCents;
      balanceDueIso = due.toISOString();
    }

    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      toast.error("Sign in required");
      setSubmitting(false);
      return;
    }

    if (!splitDeposit) {
      // Single charge — original behavior.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("payment_links").insert({
        vendor_id: vendorId,
        title: title.trim(),
        description: description.trim() || null,
        amount_cents: totalCents,
        created_by: userData.user.id,
      });
      setSubmitting(false);
      if (error) {
        toast.error("Couldn't create link", { description: error.message });
        return;
      }
      toast.success("Pay link created");
    } else {
      // Two-stage schedule: deposit (active now) + balance (scheduled
      // for the due date, daily cron flips it to active + emails host).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: depositRow, error: depErr } = await (supabase as any)
        .from("payment_links")
        .insert({
          vendor_id: vendorId,
          title: `${title.trim()} — deposit`,
          description: description.trim() || null,
          amount_cents: depositCents,
          created_by: userData.user.id,
        })
        .select("id")
        .single();
      if (depErr || !depositRow) {
        setSubmitting(false);
        toast.error("Couldn't create deposit link", { description: depErr?.message });
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: balErr } = await (supabase as any).from("payment_links").insert({
        vendor_id: vendorId,
        title: `${title.trim()} — balance`,
        description: description.trim() || null,
        amount_cents: balanceCents,
        status: "scheduled",
        activate_at: balanceDueIso,
        parent_link_id: depositRow.id,
        created_by: userData.user.id,
      });
      setSubmitting(false);
      if (balErr) {
        toast.error("Couldn't create balance link", { description: balErr.message });
        return;
      }
      toast.success("Payment schedule created", {
        description: "Deposit link is live; balance link emails on the due date.",
      });
    }
    setTitle("");
    setAmountDollars("");
    setDescription("");
    setSplitDeposit(false);
    setDepositDollars("");
    setBalanceDueDate("");
    setCreating(false);
    onChanged();
  }, [
    vendorId,
    title,
    amountDollars,
    description,
    splitDeposit,
    depositDollars,
    balanceDueDate,
    submitting,
    onChanged,
  ]);

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

            {/* Split into deposit + balance */}
            <label className="flex items-center gap-2 text-sm text-foreground/80">
              <input
                type="checkbox"
                checked={splitDeposit}
                onChange={(e) => setSplitDeposit(e.target.checked)}
                className="rounded"
              />
              Split into deposit + balance
            </label>
            {splitDeposit ? (
              <div className="space-y-2 rounded-lg p-3" style={{ background: "rgba(255,138,76,0.06)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Deposit</span>
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.50"
                    placeholder="e.g. 500.00 (host pays now)"
                    value={depositDollars}
                    onChange={(e) => setDepositDollars(e.target.value)}
                    className="flex-1 rounded-md border-0 px-2.5 py-1.5 text-sm bg-background ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Balance due</span>
                  <input
                    type="date"
                    value={balanceDueDate}
                    onChange={(e) => setBalanceDueDate(e.target.value)}
                    min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                    className="flex-1 rounded-md border-0 px-2.5 py-1.5 text-sm bg-background ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The deposit link is live immediately. The balance link auto-activates on the due date and emails the host a reminder.
                </p>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button onClick={create} disabled={submitting} className="rounded-full">
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : null}
                {splitDeposit ? "Create schedule" : "Create link"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setTitle("");
                  setAmountDollars("");
                  setDescription("");
                  setSplitDeposit(false);
                  setDepositDollars("");
                  setBalanceDueDate("");
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
                    {l.status === "scheduled" && l.activate_at
                      ? ` · Activates ${formatDate(l.activate_at)}`
                      : ""}
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
              ) : l.status === "scheduled" ? (
                <div className="flex items-center gap-2 mt-3">
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
    scheduled: { label: "Scheduled", className: "bg-violet-100 text-violet-700" },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.className}`}>
      {m.label}
    </span>
  );
}

function IntegrationsTab({
  status,
  vendorId,
}: {
  status: Status | null;
  vendorId: string | null;
}) {
  const [opening, setOpening] = useState(false);

  const openDashboard = useCallback(async () => {
    if (!vendorId || opening) return;
    setOpening(true);
    const { data, error } = await supabase.functions.invoke("vendorapay-dashboard-link", {
      body: { business_id: vendorId },
    });
    setOpening(false);
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
      toast.error("Couldn't open Stripe Express", { description: detail });
      return;
    }
    window.open((data as { url: string }).url, "_blank", "noopener,noreferrer");
  }, [vendorId, opening]);

  return (
    <div className="space-y-4">
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-1">
        Money in / money out
      </h2>

      {/* Bank account */}
      <Card>
        <div className="p-5 flex items-start gap-4 flex-wrap">
          <div className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center bg-sky-50 text-sky-700">
            <Landmark className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">Bank account</h3>
              {status?.bank?.last4 ? (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700">
                  Connected
                </span>
              ) : status?.onboarded ? (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800">
                  Pending
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-700">
                  Not connected
                </span>
              )}
            </div>
            {status?.bank?.last4 ? (
              <p className="text-sm text-foreground mt-1">
                {status.bank.bank_name ?? "Bank"} ····{status.bank.last4}
                {status.bank.currency ? (
                  <span className="text-xs text-muted-foreground ml-2 uppercase">
                    {status.bank.currency}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                {status?.onboarded
                  ? "Add your bank account in the VendoraPay Express dashboard to receive payouts."
                  : "Connect VendoraPay first to add a bank account."}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">
              Payouts settle to this account 2 business days after each charge.
            </p>
          </div>
          {status?.onboarded ? (
            <Button
              variant="outline"
              size="sm"
              onClick={openDashboard}
              disabled={opening}
              className="rounded-full"
            >
              {opening ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
              )}
              {status?.bank?.last4 ? "Manage bank" : "Add bank"}
            </Button>
          ) : null}
        </div>
      </Card>

      {/* Identity / tax info */}
      <Card>
        <div className="p-5 flex items-start gap-4 flex-wrap">
          <div className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center bg-violet-50 text-violet-700">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">Identity & tax info</h3>
              {status?.details_submitted ? (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700">
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800">
                  Incomplete
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Legal name, EIN/SSN, address. Required for tax forms (1099-K) and payouts.
            </p>
          </div>
          {status?.onboarded ? (
            <Button
              variant="outline"
              size="sm"
              onClick={openDashboard}
              disabled={opening}
              className="rounded-full"
            >
              {opening ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
              )}
              Update info
            </Button>
          ) : null}
        </div>
      </Card>

      {/* Coming soon */}
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-1 mt-6">
        Coming soon
      </h2>
      <Card>
        <div className="p-5 flex items-start gap-4">
          <div className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center bg-foreground/5 text-muted-foreground">
            <Banknote className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">QuickBooks &amp; Xero sync</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Push every VendoraPay transaction to your bookkeeper automatically. On the roadmap.
            </p>
          </div>
        </div>
      </Card>
      <Card>
        <div className="p-5 flex items-start gap-4">
          <div className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center bg-foreground/5 text-muted-foreground">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">ACH bank transfers</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Accept low-fee bank transfers for big bookings (0.8% capped at $5 vs 2.9% on cards).
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SettingsTab({
  status,
  tier,
  tierLoading,
}: {
  status: Status | null;
  tier: VendorTier;
  tierLoading: boolean;
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
        label={tierLoading ? "Your fee" : `Your fee (${tier} plan)`}
        value={tierLoading ? "—" : fee.rate}
        sub={tierLoading ? "Loading your subscription tier…" : `${fee.vendoraCut}. ${fee.sub}`}
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
