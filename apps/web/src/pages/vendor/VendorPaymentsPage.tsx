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

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

// Lazy-load the Calendar panel — nontrivial bundle that most
// VendoraPay sessions don't open, so deferring its download keeps
// the dashboard's initial paint snappy.
const VendorAppointmentsPageLazy = lazy(
  () => import("@/pages/vendor/VendorAppointmentsPage"),
);

function TabSkeleton() {
  return (
    <div className="p-4 md:p-8 max-w-5xl space-y-4">
      <div className="h-8 w-48 rounded-full bg-foreground/5 animate-pulse" />
      <div className="h-32 rounded-2xl bg-foreground/5 animate-pulse" />
      <div className="h-32 rounded-2xl bg-foreground/5 animate-pulse" />
    </div>
  );
}
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
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

type TabId = "overview" | "calendar" | "transactions" | "files" | "customers" | "settings";

const TABS: Array<{ id: TabId; label: string; icon: typeof Wallet }> = [
  { id: "overview", label: "Overview", icon: Wallet },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  // "Payments" now hosts Incoming charges, Payouts (bank transfers),
  // and Disputes as sub-tabs — they're all parts of the same money
  // lifecycle ("where's my money?") and lived as separate top-level
  // tabs before, which fragmented the surface unnecessarily.
  { id: "transactions", label: "Payments", icon: CreditCard },
  // "Files" rolls up Invoices, Pay Links, Contracts, and Proposals
  // under a single tab with its own internal sub-nav. Pay Links
  // moved here because they're the same act as invoices to a vendor
  // ("send a URL to get paid"), just flat-amount instead of itemized.
  { id: "files", label: "Files", icon: FileText },
  { id: "customers", label: "Customers", icon: Users },
  // Settings now also hosts the Stripe Connect / bank / identity
  // surfaces that lived under a separate "Integrations" tab.
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

// Sub-tabs inside the Payments tab.
type PaymentsTabId = "incoming" | "payouts" | "disputes" | "expenses" | "reports";

const PAYMENTS_TABS: Array<{ id: PaymentsTabId; label: string; icon: typeof Wallet }> = [
  { id: "incoming", label: "Incoming", icon: CreditCard },
  { id: "payouts", label: "Payouts", icon: Banknote },
  { id: "disputes", label: "Disputes", icon: AlertTriangle },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "reports", label: "Reports", icon: ScrollText },
];

// Sub-tabs inside the Files tab. Only Invoices is fully implemented
// today — the rest render a "coming soon" placeholder. URL state
// uses `?tab=files&file=<id>` (the default Invoices is omitted from
// the URL to keep links clean).
type FileTabId = "invoices" | "links" | "contracts" | "proposals";

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
    id: "links",
    label: "Pay Links",
    icon: Link2,
    description: "Drop a flat-amount charge URL anywhere — text, DM, email.",
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
  status: "draft" | "sent" | "paid" | "cancelled" | "overdue" | "refunded" | "partial_refund";
  sent_at: string | null;
  paid_at: string | null;
  refunded_at?: string | null;
  refunded_amount_cents?: number;
  /** Buyer's billing-address state (US 2-letter), stamped on payment. */
  bill_to_state?: string | null;
  /** Last automated overdue reminder timestamp from scan-vendorapay-overdue. */
  reminder_sent_at?: string | null;
  /** Vendor-added late fee, surfaced as its own line on the Pay page + receipt. */
  late_fee_cents?: number;
  late_fee_added_at?: string | null;
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

export default function VendorPaymentsPage({ embedded = false }: { embedded?: boolean } = {}) {
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

  // Tab-strip overflow management. Two related concerns: (1) scroll
  // the active tab into view when the user deep-links to a far-right
  // tab like Settings, and (2) only render the right-edge fade when
  // the strip actually overflows — otherwise on wide viewports the
  // fade looks like abandoned decoration. We track overflow via a
  // ResizeObserver so the fade reacts to window resizes.
  const tabNavRef = useRef<HTMLElement | null>(null);
  const [tabOverflow, setTabOverflow] = useState(false);
  useEffect(() => {
    const el = tabNavRef.current;
    if (!el) return;
    const update = () => setTabOverflow(el.scrollWidth > el.clientWidth + 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = tabNavRef.current;
    if (!el) return;
    const btn = el.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`);
    if (btn) btn.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

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
            .select("id, vendor_id, slug, invoice_number, bill_to_name, bill_to_email, issue_date, due_date, notes, line_items, subtotal_cents, tax_rate_bps, tax_cents, total_cents, currency, status, sent_at, paid_at, refunded_at, refunded_amount_cents, reminder_sent_at, late_fee_cents, late_fee_added_at, payment_failure_message, payment_failed_at, payment_attempts, created_at")
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

  // Realtime: when a Stripe webhook lands and flips an invoice to
  // paid (or marks a payment as failed), refresh the page so the
  // vendor doesn't have to hit Refresh to see the new state. Same
  // pattern for payment_links so refunds / paid-out states update
  // live. We refresh the whole page rather than patching individual
  // rows because the Overview KPIs / balance / transactions also
  // need updating when a payment lands.
  useEffect(() => {
    if (!vendorId) return;
    const channel = supabase
      .channel(`vendorapay:${vendorId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invoices",
          filter: `vendor_id=eq.${vendorId}`,
        },
        () => {
          void refresh(false);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "payment_links",
          filter: `vendor_id=eq.${vendorId}`,
        },
        () => {
          void refresh(false);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // Deliberately depend only on vendorId, not refresh. The
    // callback captures refresh by closure; even though refresh
    // is recreated whenever vendorId changes (the useCallback
    // also depends on it), we'd tear down and re-build the
    // channel on the same render. Listing only vendorId keeps the
    // subscription stable for the lifetime of one selected vendor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

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

  const body = (
    <main className="flex-1 pb-20 lg:pb-0">
        <div
          className={`backdrop-blur-md px-4 md:px-8 sticky top-0 z-40 border-b border-foreground/[0.06] ${
            embedded ? "pt-5 pb-3" : "py-5"
          }`}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-editorial text-3xl md:text-[2rem] leading-[1.05] tracking-tight">
                {embedded ? "My Vendora" : "VendoraPay"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                {embedded
                  ? "Leads, calendar, and payments — one place to run the business."
                  : "Accept card payments and track payouts from one place."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh(false)}
              disabled={refreshing || loading}
              className="rounded-full h-8"
            >
              {refreshing ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
              )}
              Refresh
            </Button>
          </div>

          {/* Internal tab strip — the primary navigation inside
              My Vendora. 11 tabs overflow horizontally on most
              viewports; the right-edge gradient is a visual cue
              that more tabs exist past the fold. */}
          <div className="relative mt-5 -mx-4 md:-mx-8">
            <nav
              ref={tabNavRef}
              className={`flex gap-1 overflow-x-auto scrollbar-hide px-4 md:px-8 ${
                tabOverflow ? "pr-12 md:pr-16" : ""
              }`}
            >
              {TABS.map((t) => {
                const active = tab === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-tab={t.id}
                    onClick={() => setTab(t.id)}
                    className={`cockpit-tab inline-flex items-center gap-1.5 px-4 h-9 text-[13px] font-medium transition-all whitespace-nowrap ${
                      active ? "cockpit-tab--active" : ""
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </nav>
            {/* Right-edge fade — only when the strip actually
                overflows, so wide viewports (all 11 tabs fit) don't
                see a phantom gradient with nothing being clipped. */}
            {tabOverflow && (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 right-0 h-full w-10 md:w-14 bg-gradient-to-l from-background via-background/70 to-transparent"
              />
            )}
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-screen-2xl space-y-6">
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
          ) : tab === "calendar" ? (
            <Suspense fallback={<TabSkeleton />}>
              <VendorAppointmentsPageLazy embedded listingId={selectedListingId} />
            </Suspense>
          ) : tab === "transactions" ? (
            <PaymentsTab
              transactions={transactions}
              payouts={payouts}
              status={status}
              vendorId={vendorId}
              onRefunded={() => refresh(false)}
            />
          ) : tab === "files" ? (
            <FilesTab
              vendorId={vendorId}
              listing={listings.find((l) => l.id === selectedListingId) ?? null}
              invoices={invoices}
              paymentLinks={paymentLinks}
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
          ) : (
            <SettingsTab status={status} vendorId={vendorId} tier={tier} tierLoading={tierLoading} />
          )}
        </div>
      </main>
  );

  if (embedded) return body;

  return (
    <div className="flex min-h-screen vendor-canvas my-vendora-cockpit">
      <DashboardSidebar items={vendorNavItems} title="Vendor Portal" backPath="/settings" />
      {body}
      <MobileNav items={vendorNavItems} />
    </div>
  );
}

// ---- Tabs --------------------------------------------------------

function OverviewTab({
  balance,
  transactions,
  status,
  invoices: _unusedInvoices,
  vendorId,
  totalGross: _unusedTotalGross,
  totalFees: _unusedTotalFees,
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
  // Full rebuild for the cockpit redesign — proper Xero/Oracle page
  // architecture: page header bar → KPI strip with trend deltas →
  // chart grid (revenue line + A/R aging bars) → activity table.
  // Each KPI tile shows current vs equivalent prior-period delta
  // where the data exists; pure snapshot tiles skip it.
  const currency = balance?.currency ?? "usd";

  // KPI snapshots used by the Overview: Revenue 30d (with prior 30d
  // for trend), Customers total (with last-30d-new for the sub line),
  // plus MRR (broken down by recurring interval), the Leads pipeline
  // (new vs active vs won vs lost in the last 30d) and a 30-bucket
  // daily revenue series for the wave chart.
  const [mrr, setMrr] = useState<{ total: number; weekly: number; monthly: number; quarterly: number; yearly: number; count: number }>({ total: 0, weekly: 0, monthly: 0, quarterly: 0, yearly: 0, count: 0 });
  const [leads, setLeads] = useState<{ new: number; active: number; won: number; lost: number; total: number }>({ new: 0, active: 0, won: 0, lost: 0, total: 0 });
  const [expenses, setExpenses] = useState<{ total: number; count: number; topCategories: Array<{ label: string; cents: number }> }>({ total: 0, count: 0, topCategories: [] });
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [revenue30d, setRevenue30d] = useState<number>(0);
  const [revenue30dPrev, setRevenue30dPrev] = useState<number>(0);
  const [newCustomers30d, setNewCustomers30d] = useState<number>(0);
  // Daily revenue series for the last 30 days — drives the line chart.
  const [revenueSeries, setRevenueSeries] = useState<number[]>([]);

  useEffect(() => {
    if (!vendorId) {
      setMrr({ total: 0, weekly: 0, monthly: 0, quarterly: 0, yearly: 0, count: 0 });
      setLeads({ new: 0, active: 0, won: 0, lost: 0, total: 0 });
      setExpenses({ total: 0, count: 0, topCategories: [] });
      setCustomerCount(null);
      setRevenue30d(0);
      setRevenue30dPrev(0);
      setNewCustomers30d(0);
      setRevenueSeries([]);
      return;
    }
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const now = new Date();
      const since30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      const since60 = new Date(now.getTime() - 60 * 24 * 3600 * 1000);

      const [
        { data: rrs },
        { data: leadRows },
        { data: expenseRows },
        { count: cc },
        { data: paid30 },
        { data: paid60 },
        { count: newCust30 },
      ] = await Promise.all([
        // Active recurring invoices — drive the MRR breakdown.
        db
          .from("vendor_recurring_invoices")
          .select("interval, line_items, tax_pct")
          .eq("vendor_id", vendorId)
          .eq("active", true),
        // Inbound inquiries in the last 30 days — drive the Leads card.
        db
          .from("inquiries")
          .select("status")
          .eq("vendor_id", vendorId)
          .gte("created_at", since30.toISOString())
          .limit(10000),
        // Operating expenses in the last 30 days — drive the OPEX card.
        db
          .from("vendor_expenses")
          .select("amount_cents, category")
          .eq("vendor_id", vendorId)
          .gte("occurred_on", since30.toISOString().slice(0, 10))
          .limit(10000),
        db
          .from("vendor_customers")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", vendorId),
        // Paid invoices in the last 30 days (current period)
        db
          .from("invoices")
          .select("total_cents, paid_at")
          .eq("vendor_id", vendorId)
          .eq("status", "paid")
          .gte("paid_at", since30.toISOString())
          .lt("paid_at", now.toISOString())
          .limit(10000),
        // Paid invoices in the 30 days before that (previous period)
        db
          .from("invoices")
          .select("total_cents")
          .eq("vendor_id", vendorId)
          .eq("status", "paid")
          .gte("paid_at", since60.toISOString())
          .lt("paid_at", since30.toISOString())
          .limit(10000),
        // New customers in last 30 days — feeds the Customers card sub
        db
          .from("vendor_customers")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", vendorId)
          .gte("created_at", since30.toISOString()),
      ]);
      if (cancelled) return;

      // MRR breakdown — normalize each active subscription to a
      // monthly contribution, then bin by display interval. weekly
      // and biweekly are bucketed under the same "weekly" display
      // row to keep the chart to four bars.
      const rrsRows = (rrs ?? []) as Array<{ interval: string; line_items: Array<{ qty: number; unit_price_cents: number; total_cents?: number }>; tax_pct: number }>;
      const breakdown = { total: 0, weekly: 0, monthly: 0, quarterly: 0, yearly: 0, count: rrsRows.length };
      for (const r of rrsRows) {
        const subtotal = (r.line_items ?? []).reduce(
          (s, it) => s + (it.total_cents ?? it.qty * it.unit_price_cents),
          0,
        );
        const taxBps = Math.round((r.tax_pct ?? 0) * 100);
        const totalWithTax = subtotal + Math.round((subtotal * taxBps) / 10_000);
        let perMonth = 0;
        let bin: "weekly" | "monthly" | "quarterly" | "yearly" | null = null;
        if (r.interval === "weekly") { perMonth = (totalWithTax * 52) / 12; bin = "weekly"; }
        else if (r.interval === "biweekly") { perMonth = (totalWithTax * 26) / 12; bin = "weekly"; }
        else if (r.interval === "monthly") { perMonth = totalWithTax; bin = "monthly"; }
        else if (r.interval === "quarterly") { perMonth = totalWithTax / 3; bin = "quarterly"; }
        else if (r.interval === "yearly") { perMonth = totalWithTax / 12; bin = "yearly"; }
        if (bin) {
          breakdown[bin] += Math.round(perMonth);
          breakdown.total += Math.round(perMonth);
        }
      }
      setMrr(breakdown);

      // Leads pipeline — bin each inquiry status into one of four
      // display buckets. drafted + replied collapse into "active"
      // (the vendor's in conversation), expired collapses into "lost"
      // (treat unanswered timeouts as missed deals so the bucket
      // shows real churn).
      const leadStatuses = ((leadRows ?? []) as Array<{ status: string }>).map((r) => r.status);
      const leadCounts = { new: 0, active: 0, won: 0, lost: 0, total: leadStatuses.length };
      for (const s of leadStatuses) {
        if (s === "new") leadCounts.new += 1;
        else if (s === "drafted" || s === "replied") leadCounts.active += 1;
        else if (s === "won") leadCounts.won += 1;
        else if (s === "lost" || s === "expired") leadCounts.lost += 1;
      }
      setLeads(leadCounts);

      // Operating expenses — sum by category, then take the top 4
      // and roll the rest into an "Other" bucket so the card always
      // renders four bars regardless of how many categories the
      // vendor uses.
      const EXPENSE_LABEL: Record<string, string> = {
        rentals: "Rentals", supplies: "Supplies", labor: "Labor",
        mileage: "Mileage/gas", marketing: "Marketing", software: "Software",
        fees: "Fees/licenses", meals: "Meals", travel: "Travel",
        insurance: "Insurance", other: "Other",
      };
      const expRows = (expenseRows ?? []) as Array<{ amount_cents: number; category: string }>;
      const totalExpenses = expRows.reduce((s, r) => s + r.amount_cents, 0);
      const byCat = new Map<string, number>();
      for (const r of expRows) {
        byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount_cents);
      }
      const sorted = Array.from(byCat.entries())
        .map(([id, cents]) => ({ label: EXPENSE_LABEL[id] ?? id, cents }))
        .sort((a, b) => b.cents - a.cents);
      const topThree = sorted.slice(0, 3);
      const restCents = sorted.slice(3).reduce((s, r) => s + r.cents, 0);
      const topCategories = restCents > 0
        ? [...topThree, { label: "Other", cents: restCents }]
        : topThree;
      setExpenses({ total: totalExpenses, count: expRows.length, topCategories });

      setCustomerCount(typeof cc === "number" ? cc : 0);

      const paid30Rows = (paid30 ?? []) as Array<{ total_cents: number; paid_at: string }>;
      const paid60Rows = (paid60 ?? []) as Array<{ total_cents: number }>;
      setRevenue30d(paid30Rows.reduce((s, r) => s + r.total_cents, 0));
      setRevenue30dPrev(paid60Rows.reduce((s, r) => s + r.total_cents, 0));
      setNewCustomers30d(newCust30 ?? 0);

      // Build daily revenue series — 30 buckets, today-29 → today.
      const series = new Array<number>(30).fill(0);
      for (const p of paid30Rows) {
        if (!p.paid_at) continue;
        const t = Date.parse(p.paid_at);
        if (Number.isNaN(t)) continue;
        const dayIdx = Math.floor((t - since30.getTime()) / (24 * 3600 * 1000));
        if (dayIdx >= 0 && dayIdx < 30) series[dayIdx] += p.total_cents;
      }
      setRevenueSeries(series);
    })();
    return () => { cancelled = true; };
  }, [vendorId]);

  return (
    <>
      {/* Top row — two KPI tiles + the wave chart, all on one line.
          The wave gets twice the width (col-span-2) so the SVG still
          has room to breathe; the KPI tiles stretch to match its
          height with label/value at top and the sub line anchored to
          the bottom (see .cockpit-kpi-tile's flex layout in CSS). On
          narrow viewports the row stacks via the lg: breakpoint. */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
        <div className="cockpit-kpi-tile">
          <div className="cockpit-kpi-label">Revenue · 30d</div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="cockpit-kpi-value">{formatMoney(revenue30d, currency)}</div>
            <TrendDelta currentCents={revenue30d} previousCents={revenue30dPrev} />
          </div>
          <div className="cockpit-kpi-sub">
            vs {formatMoney(revenue30dPrev, currency)} prior 30 days
          </div>
        </div>
        <div className="cockpit-kpi-tile">
          <div className="cockpit-kpi-label">Customers</div>
          <div className="cockpit-kpi-value">{customerCount == null ? "—" : customerCount}</div>
          <div className="cockpit-kpi-sub">
            {newCustomers30d > 0
              ? `${newCustomers30d} new in last 30 days`
              : "No new customers in the last 30 days"}
          </div>
        </div>
        <div className="lg:col-span-2">
          <OverviewRevenueChart series={revenueSeries} currency={currency} />
        </div>
      </div>

      {/* Three bar cards in a row — MRR, Leads, Operating expenses.
          They share the same horizontal-bars visual rhythm, so
          grouping them tightens the page and keeps the dashboard
          above the fold on a standard laptop viewport. Stacks on
          narrow screens via the lg breakpoint. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <OverviewMrrCard mrr={mrr} currency={currency} />
        <OverviewLeadsCard leads={leads} />
        <OverviewExpensesCard expenses={expenses} currency={currency} />
      </div>

      {/* Recent activity — full-width table, capped to 6 rows so it
          stays a compact "what just happened" surface. */}
      <div className="cockpit-data-card">
        <div className="cockpit-data-card-header">
          <div>
            <h3 className="text-sm font-semibold">Recent activity</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Latest payouts, charges, and refunds across this listing
            </p>
          </div>
          {transactions.length > 0 ? (
            <button
              type="button"
              onClick={onSeeAllTransactions}
              className="text-xs text-muted-foreground hover:text-foreground border border-foreground/10 rounded-md px-2.5 py-1"
            >
              View all →
            </button>
          ) : null}
        </div>
        {transactions.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground text-center">
            {status?.charges_enabled
              ? "No transactions yet. When buyers pay you, they'll show up here."
              : "Transactions appear after your first payment."}
          </div>
        ) : (
          <table className="cockpit-data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Type</th>
                <th>Date</th>
                <th className="num">Amount</th>
                <th className="num">Fee</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 6).map((t) => (
                <tr key={t.id}>
                  <td className="font-medium truncate max-w-[280px]">{t.description ?? "VendoraPay charge"}</td>
                  <td className="capitalize text-muted-foreground">{t.kind}</td>
                  <td className="text-muted-foreground">{formatDate(t.created_at)}</td>
                  <td className="num">{formatMoney(t.amount_cents, t.currency)}</td>
                  <td className="num text-muted-foreground">{t.fee_cents > 0 ? formatMoney(t.fee_cents, t.currency) : "—"}</td>
                  <td className="num font-semibold">{formatMoney(t.net_cents, t.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// Revenue trend chart for Overview — 30-day daily line chart with
// grid + axes. Mirrors RevenueSparkline's SVG approach but with
// fixed 30-bucket layout and "no data" empty state.
function OverviewRevenueChart({ series: rawSeries, currency }: { series: number[]; currency: string }) {
  // Guard against an empty series on first render (state initializes to
  // [] before the useEffect query resolves). The chart math below
  // dereferences pts[0] unconditionally, so an empty input would crash
  // — fall back to 30 zero-buckets and the ghost-wave path takes over.
  const series = rawSeries.length > 0 ? rawSeries : new Array(30).fill(0);
  const max = series.reduce((m, v) => (v > m ? v : m), 0);
  const total = series.reduce((s, v) => s + v, 0);
  return (
    <div className="cockpit-chart">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="cockpit-chart-title">Revenue · last 30 days</div>
          <div className="cockpit-chart-sub">Daily paid-invoice totals</div>
        </div>
        <div className="text-right">
          <div className="cockpit-kpi-label">Total</div>
          <div className="cockpit-money cockpit-money--lg">{formatMoney(total, currency)}</div>
        </div>
      </div>
      {(() => {
        const PAD_L = 50, PAD_R = 8, PAD_T = 8, PAD_B = 22, W = 480, H = 200;
        const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
        const n = series.length;
        // When there's no revenue yet, plot a gentle ghost wave so the
        // chart's anatomy is visible. Vendor sees what the chart will
        // look like once invoices start landing, with an overlay note
        // making clear nothing's been earned yet.
        const hasData = max > 0;
        const plotted = hasData
          ? series
          : Array.from({ length: n }, (_, i) =>
              0.55 + 0.35 * Math.sin((i / (n - 1)) * Math.PI * 1.4 - Math.PI / 6),
            );
        const plotMax = hasData ? max : 1;
        const x = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
        const y = (v: number) => PAD_T + plotH - (v / plotMax) * plotH;
        // Smooth the line into a wave with a Catmull-Rom-to-Bezier
        // conversion — tension 0.2 ≈ Chart.js's `tension: 0.4` look.
        // The area path reuses the same curve so the fill hugs the
        // line instead of cutting in straight segments underneath.
        const pts = plotted.map((v, i) => ({ x: x(i), y: y(v) }));
        const tension = 0.2;
        let linePath = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i - 1] ?? pts[i];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2] ?? pts[i + 1];
          const c1x = p1.x + (p2.x - p0.x) * tension;
          const c1y = p1.y + (p2.y - p0.y) * tension;
          const c2x = p2.x - (p3.x - p1.x) * tension;
          const c2y = p2.y - (p3.y - p1.y) * tension;
          linePath += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
        }
        const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${PAD_T + plotH} L${pts[0].x.toFixed(1)},${PAD_T + plotH} Z`;
        const peakIdx = hasData ? series.indexOf(max) : -1;
        return (
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[150px]" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="cockpit-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c8403a" stopOpacity={hasData ? 0.28 : 0.1} />
                  <stop offset="100%" stopColor="#c8403a" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 0.5, 1].map((t) => {
                const yy = PAD_T + plotH - t * plotH;
                return (
                  <g key={t}>
                    <line x1={PAD_L} y1={yy} x2={PAD_L + plotW} y2={yy} className="cockpit-chart-grid" />
                    <text x={PAD_L - 6} y={yy} textAnchor="end" dominantBaseline="middle" className="cockpit-chart-axis">
                      {hasData ? (t === 0 ? "$0" : formatMoneyCompact(plotMax * t, currency)) : ""}
                    </text>
                  </g>
                );
              })}
              <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#e8e2d6" strokeWidth="1" />
              <path d={areaPath} className="cockpit-chart-area" style={hasData ? undefined : { opacity: 0.5 }} />
              <path d={linePath} className="cockpit-chart-line" style={hasData ? undefined : { opacity: 0.35 }} />
              {peakIdx >= 0 && <circle cx={x(peakIdx)} cy={y(max)} r="3.5" className="cockpit-chart-dot" />}
              <text x={PAD_L} y={H - 6} textAnchor="start" className="cockpit-chart-axis">30 days ago</text>
              <text x={PAD_L + plotW} y={H - 6} textAnchor="end" className="cockpit-chart-axis">Today</text>
            </svg>
            {!hasData && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="text-xs text-muted-foreground italic rounded-full px-3 py-1.5"
                  style={{
                    background: "rgba(255, 250, 245, 0.6)",
                    border: "0.5px solid rgba(255, 138, 76, 0.22)",
                    backdropFilter: "blur(12px) saturate(140%)",
                    WebkitBackdropFilter: "blur(12px) saturate(140%)",
                  }}
                >
                  No paid invoices in the last 30 days
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// MRR breakdown card — horizontal bars showing each subscription
// interval's contribution to monthly recurring revenue. Same visual
// rhythm as the A/R aging card it replaced (label + colored bar +
// right-aligned $ amount), warm palette for visual cohesion with
// the crimson revenue line: Monthly = crimson accent (the biggest
// expected contributor), Weekly = terra, Quarterly = amber,
// Yearly = green.
function OverviewMrrCard({
  mrr,
  currency,
}: {
  mrr: { total: number; weekly: number; monthly: number; quarterly: number; yearly: number; count: number };
  currency: string;
}) {
  const rows: Array<{ label: string; cents: number; color: string }> = [
    { label: "Monthly",   cents: mrr.monthly,   color: "#c8403a" },
    { label: "Weekly",    cents: mrr.weekly,    color: "#b8693d" },
    { label: "Quarterly", cents: mrr.quarterly, color: "#c89738" },
    { label: "Yearly",    cents: mrr.yearly,    color: "#4a7c4a" },
  ];
  const max = rows.reduce((m, r) => (r.cents > m ? r.cents : m), 0);
  return (
    <div className="cockpit-chart">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="cockpit-chart-title">MRR</div>
          <div className="cockpit-chart-sub">Recurring revenue, normalized to monthly</div>
        </div>
        <div className="text-right">
          <div className="cockpit-kpi-label">Per month</div>
          <div className="cockpit-money cockpit-money--lg">{formatMoney(mrr.total, currency)}</div>
        </div>
      </div>
      {mrr.count === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No recurring invoices yet. Set one up to start tracking MRR.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = max > 0 ? (r.cents / max) * 100 : 0;
              return (
                <div key={r.label} className="flex items-center gap-2">
                  <div className="w-20 text-xs text-muted-foreground shrink-0 truncate">{r.label}</div>
                  <div className="flex-1 h-5 rounded overflow-hidden relative" style={{ background: "rgba(255, 138, 76, 0.12)" }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: r.color, opacity: r.cents > 0 ? 1 : 0 }}
                    />
                  </div>
                  <div className="w-20 text-right text-xs cockpit-money tabular-nums shrink-0">
                    {r.cents > 0 ? formatMoney(r.cents, currency) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            {mrr.count} active subscription{mrr.count === 1 ? "" : "s"}
          </div>
        </>
      )}
    </div>
  );
}

// Leads pipeline card — horizontal bars showing the count of
// inbound inquiries in each pipeline state over the last 30 days.
// Same visual rhythm as the MRR / A/R aging cards (label + colored
// bar + right-aligned count) and the same warm palette so the row
// reads as one editorial system:
//   New   = crimson  — unanswered, needs attention
//   Active= terra    — drafted + replied (in conversation)
//   Won   = green    — converted
//   Lost  = warm gray — lost + expired
function OverviewLeadsCard({
  leads,
}: {
  leads: { new: number; active: number; won: number; lost: number; total: number };
}) {
  const rows: Array<{ label: string; count: number; color: string }> = [
    { label: "New",    count: leads.new,    color: "#c8403a" },
    { label: "Active", count: leads.active, color: "#b8693d" },
    { label: "Won",    count: leads.won,    color: "#4a7c4a" },
    { label: "Lost",   count: leads.lost,   color: "#8a8579" },
  ];
  const max = rows.reduce((m, r) => (r.count > m ? r.count : m), 0);
  const wonRate = leads.total > 0 ? Math.round((leads.won / leads.total) * 100) : 0;
  return (
    <div className="cockpit-chart">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="cockpit-chart-title">Leads</div>
          <div className="cockpit-chart-sub">Inbound pipeline · last 30 days</div>
        </div>
        <div className="text-right">
          <div className="cockpit-kpi-label">Total</div>
          <div className="cockpit-money cockpit-money--lg">{leads.total}</div>
        </div>
      </div>
      {leads.total === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No leads in the last 30 days. New inquiries land here.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = max > 0 ? (r.count / max) * 100 : 0;
              return (
                <div key={r.label} className="flex items-center gap-2">
                  <div className="w-20 text-xs text-muted-foreground shrink-0 truncate">{r.label}</div>
                  <div className="flex-1 h-5 rounded overflow-hidden relative" style={{ background: "rgba(255, 138, 76, 0.12)" }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: r.color, opacity: r.count > 0 ? 1 : 0 }}
                    />
                  </div>
                  <div className="w-12 text-right text-xs cockpit-money tabular-nums shrink-0">
                    {r.count > 0 ? r.count : "—"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            {leads.won > 0
              ? `${wonRate}% conversion · ${leads.won} of ${leads.total} won`
              : `${leads.total} inquir${leads.total === 1 ? "y" : "ies"} this period`}
          </div>
        </>
      )}
    </div>
  );
}

// Operating expenses card — full-width row showing OPEX in the last
// 30 days broken down by category (top 3 + Other rollup). Same
// horizontal-bars treatment as MRR / Leads so the row reads as one
// editorial system. Sits at the bottom of the Overview so the page
// flows top-to-bottom as cash in → pipeline → cash out.
function OverviewExpensesCard({
  expenses,
  currency,
}: {
  expenses: { total: number; count: number; topCategories: Array<{ label: string; cents: number }> };
  currency: string;
}) {
  // Reuse the bar palette from MRR (crimson → terra → amber → green)
  // so a vendor scanning the page picks up category rank by color.
  const palette = ["#c8403a", "#b8693d", "#c89738", "#4a7c4a"];
  const rows = expenses.topCategories.map((c, i) => ({
    ...c, color: palette[i] ?? "#8a8579",
  }));
  const max = rows.reduce((m, r) => (r.cents > m ? r.cents : m), 0);
  return (
    <div className="cockpit-chart">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="cockpit-chart-title">Operating expenses</div>
          <div className="cockpit-chart-sub">Last 30 days · by category</div>
        </div>
        <div className="text-right">
          <div className="cockpit-kpi-label">Spend</div>
          <div className="cockpit-money cockpit-money--lg">{formatMoney(expenses.total, currency)}</div>
        </div>
      </div>
      {expenses.count === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No expenses logged in the last 30 days.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = max > 0 ? (r.cents / max) * 100 : 0;
              return (
                <div key={r.label} className="flex items-center gap-2">
                  <div className="w-20 text-xs text-muted-foreground shrink-0 truncate">{r.label}</div>
                  <div className="flex-1 h-5 rounded overflow-hidden relative" style={{ background: "rgba(255, 138, 76, 0.12)" }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: r.color, opacity: r.cents > 0 ? 1 : 0 }}
                    />
                  </div>
                  <div className="w-20 text-right text-xs cockpit-money tabular-nums shrink-0">
                    {formatMoney(r.cents, currency)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            {expenses.count} expense{expenses.count === 1 ? "" : "s"} logged
          </div>
        </>
      )}
    </div>
  );
}

// Payments hub. Four sub-tabs covering the full money lifecycle:
// incoming charges, bank payouts, disputes, and a Reports surface
// for date-range sales totals + CSV export. They're all answers
// to "where's my money?" — folding them under one parent reduces
// the top-level strip and clusters related work.
function PaymentsTab({
  transactions,
  payouts,
  status,
  vendorId,
  onRefunded,
}: {
  transactions: Transaction[];
  payouts: PayoutsResponse | null;
  status: Status | null;
  vendorId: string | null;
  onRefunded: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSub = searchParams.get("sub");
  const sub: PaymentsTabId =
    rawSub === "payouts" ||
    rawSub === "disputes" ||
    rawSub === "expenses" ||
    rawSub === "reports"
      ? rawSub
      : "incoming";
  const setSub = (next: PaymentsTabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "incoming") params.delete("sub");
    else params.set("sub", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-5">
      {/* Sub-tab strip wrapped in a relative box so the right-edge
          fade overlay can sit on top of any overflowing tabs on
          narrow viewports. With 5 sub-tabs (Incoming · Payouts ·
          Disputes · Expenses · Reports) the strip wraps on small
          phones; without the fade, vendors might not realize there
          are more tabs scrolled off to the right. */}
      <div className="relative -mt-1">
        <nav className="flex gap-1 overflow-x-auto scrollbar-hide pr-10 sm:pr-0">
          {PAYMENTS_TABS.map((t) => {
            const active = sub === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSub(t.id)}
                className={`cockpit-tab inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active ? "cockpit-tab--active" : ""
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-background via-background/70 to-transparent sm:hidden"
        />
      </div>

      {sub === "incoming" ? (
        <TransactionsTab
          transactions={transactions}
          status={status}
          vendorId={vendorId}
          onRefunded={onRefunded}
        />
      ) : sub === "payouts" ? (
        <PayoutsTab data={payouts} status={status} vendorId={vendorId} />
      ) : sub === "disputes" ? (
        <DisputesTab vendorId={vendorId} />
      ) : sub === "expenses" ? (
        <ExpensesTab vendorId={vendorId} />
      ) : (
        <ReportsTab vendorId={vendorId} />
      )}
    </div>
  );
}

// Reports — sales totals + CSV export over a date range. Powered
// by the invoices table (full vendor history, no Stripe API
// pagination cap), so the totals reflect everything the vendor
// has billed regardless of how old. The Stripe transactions feed
// stays the source of truth for fees + payouts; this surface is
// the "invoiced revenue" view a bookkeeper / CPA needs at tax
// time, plus a "give me a CSV" handoff for spreadsheet work.
type ReportRangeId = "this_month" | "last_month" | "this_quarter" | "ytd" | "last_year" | "all_time";

const REPORT_RANGES: Array<{ id: ReportRangeId; label: string }> = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "ytd", label: "Year to date" },
  { id: "last_year", label: "Last year" },
  { id: "all_time", label: "All time" },
];

function computeReportRange(id: ReportRangeId): { start: Date; end: Date; label: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (id) {
    case "this_month":
      return {
        start: new Date(Date.UTC(y, m, 1)),
        end: new Date(Date.UTC(y, m + 1, 1)),
        label: "This month",
      };
    case "last_month":
      return {
        start: new Date(Date.UTC(y, m - 1, 1)),
        end: new Date(Date.UTC(y, m, 1)),
        label: "Last month",
      };
    case "this_quarter": {
      const qStart = Math.floor(m / 3) * 3;
      return {
        start: new Date(Date.UTC(y, qStart, 1)),
        end: new Date(Date.UTC(y, qStart + 3, 1)),
        label: "This quarter",
      };
    }
    case "ytd":
      return {
        start: new Date(Date.UTC(y, 0, 1)),
        end: new Date(Date.UTC(y + 1, 0, 1)),
        label: "Year to date",
      };
    case "last_year":
      return {
        start: new Date(Date.UTC(y - 1, 0, 1)),
        end: new Date(Date.UTC(y, 0, 1)),
        label: "Last year",
      };
    case "all_time":
      return {
        start: new Date(0),
        end: new Date(Date.UTC(y + 100, 0, 1)),
        label: "All time",
      };
  }
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // CSV formula injection guard. Excel/Sheets auto-evaluate any
  // cell whose value starts with `= + - @ <tab> <CR>` as a formula
  // — including `=cmd|'/c calc'!A1` style RCE on Windows Excel and
  // `=HYPERLINK(…)` exfiltration. A buyer name typed as `=…` would
  // run on the vendor's machine when they open the report CSV in
  // their spreadsheet app. Prefix a single quote (the standard
  // OWASP mitigation) so the cell stays a literal string.
  // CWE-1236 / Formula Injection.
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(s);
  const guarded = needsFormulaGuard ? `'${s}` : s;
  if (/[,"\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

function ReportsTab({ vendorId }: { vendorId: string | null }) {
  const [rangeId, setRangeId] = useState<ReportRangeId>("this_month");
  const range = useMemo(() => computeReportRange(rangeId), [rangeId]);

  // Fetch paid + refunded invoices in the chosen window directly
  // from Supabase rather than slicing the parent's 50-row cache —
  // the parent cap would silently understate "YTD" or "All time"
  // totals. Use paid_at for revenue (cash-basis: recognized when
  // money arrived) and refunded_at for refunds (when money left).
  // Same period = cash-flow view, matching how a CPA reconciles
  // against bank deposits.
  const [paidInRange, setPaidInRange] = useState<Invoice[]>([]);
  const [refundedInRange, setRefundedInRange] = useState<Invoice[]>([]);
  const [stripeFees, setStripeFees] = useState<{ fees_cents: number; gross_cents: number; net_cents: number; count: number } | null>(null);
  // Aging report = "as of today" snapshot of unpaid invoices, NOT
  // gated on the rangeId picker. A vendor wants to know "what's
  // overdue right now" regardless of which window they're scoped
  // to for revenue analytics.
  const [unpaidNow, setUnpaidNow] = useState<Invoice[]>([]);
  // Expenses for the chosen window — fed into Net Profit on the
  // P&L block. Same window semantics as paid_at (cash-basis).
  const [expensesInRange, setExpensesInRange] = useState<Expense[]>([]);
  // Previous-period aggregates (Gross/Refunds/Expenses/Net profit)
  // so KPI tiles can show a trend delta vs the equivalent-length
  // window just before this one. Shape mirrors the live totals
  // computation: cents in the report currency, dropped expenses
  // off-currency the same way the live calc does.
  const [prevPeriod, setPrevPeriod] = useState<{
    gross: number;
    refunds: number;
    expenses: number;
    netProfit: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!vendorId) {
      setPaidInRange([]);
      setRefundedInRange([]);
      setStripeFees(null);
      setUnpaidNow([]);
      setExpensesInRange([]);
      setPrevPeriod(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const cols =
        "id, vendor_id, slug, invoice_number, bill_to_name, bill_to_email, bill_to_state, issue_date, due_date, notes, line_items, subtotal_cents, tax_rate_bps, tax_cents, total_cents, currency, status, sent_at, paid_at, refunded_at, refunded_amount_cents, late_fee_cents, late_fee_added_at, created_at";
      const [paidRes, refundedRes, feesRes, unpaidRes, expensesRes] = await Promise.all([
        db
          .from("invoices")
          .select(cols)
          .eq("vendor_id", vendorId)
          .eq("status", "paid")
          .gte("paid_at", range.start.toISOString())
          .lt("paid_at", range.end.toISOString())
          .order("paid_at", { ascending: false })
          .limit(5000),
        db
          .from("invoices")
          .select(cols)
          .eq("vendor_id", vendorId)
          .in("status", ["refunded", "partial_refund"])
          .gte("refunded_at", range.start.toISOString())
          .lt("refunded_at", range.end.toISOString())
          .order("refunded_at", { ascending: false })
          .limit(5000),
        supabase.functions
          .invoke("vendorapay-fees-report", {
            body: {
              business_id: vendorId,
              since: range.start.toISOString(),
              until: range.end.toISOString(),
            },
          })
          .catch((err: unknown) => {
            console.error("[reports] fees fetch failed", err);
            return { data: null };
          }),
        // Aging snapshot — every unpaid invoice regardless of issue
        // date. Status filter excludes paid/cancelled/refunded since
        // those are no longer claims. limit 5000 mirrors the other
        // selects' cap; vendors with that many open invoices have
        // bigger problems than the report being truncated.
        db
          .from("invoices")
          .select(cols)
          .eq("vendor_id", vendorId)
          .in("status", ["sent", "overdue"])
          .order("due_date", { ascending: true })
          .limit(5000),
        // Expenses bucketed by occurred_on (cash-basis): when the
        // vendor actually wrote the check or swiped the card. Range
        // boundaries are inclusive of start, exclusive of end —
        // mirroring paid_at filters above.
        db
          .from("vendor_expenses")
          .select("id, vendor_id, occurred_on, amount_cents, currency, category, description, paid_to, notes, created_at")
          .eq("vendor_id", vendorId)
          .gte("occurred_on", range.start.toISOString().slice(0, 10))
          .lt("occurred_on", range.end.toISOString().slice(0, 10))
          .order("occurred_on", { ascending: false })
          .limit(5000),
      ]);
      if (cancelled) return;
      setPaidInRange((paidRes.data ?? []) as Invoice[]);
      setRefundedInRange((refundedRes.data ?? []) as Invoice[]);
      setUnpaidNow((unpaidRes.data ?? []) as Invoice[]);
      setExpensesInRange((expensesRes.data ?? []) as Expense[]);
      const feesData = (feesRes as { data?: { fees_cents?: number; gross_cents?: number; net_cents?: number; count?: number } }).data;
      setStripeFees(
        feesData && typeof feesData.fees_cents === "number"
          ? {
              fees_cents: feesData.fees_cents,
              gross_cents: feesData.gross_cents ?? 0,
              net_cents: feesData.net_cents ?? 0,
              count: feesData.count ?? 0,
            }
          : null,
      );
      setLoading(false);

      // Previous-period fetch — equivalent-length window immediately
      // before the current one. Same shape, just for delta math.
      // Skips Stripe fees (the fees-report edge fn takes a few s and
      // we don't surface that delta on a KPI tile anyway).
      const windowMs = range.end.getTime() - range.start.getTime();
      const prevEnd = range.start;
      const prevStart = new Date(range.start.getTime() - windowMs);
      const [prevPaidRes, prevRefundedRes, prevExpensesRes] = await Promise.all([
        db
          .from("invoices")
          .select("total_cents, currency")
          .eq("vendor_id", vendorId)
          .eq("status", "paid")
          .gte("paid_at", prevStart.toISOString())
          .lt("paid_at", prevEnd.toISOString())
          .limit(5000),
        db
          .from("invoices")
          .select("total_cents, refunded_amount_cents, currency")
          .eq("vendor_id", vendorId)
          .in("status", ["refunded", "partial_refund"])
          .gte("refunded_at", prevStart.toISOString())
          .lt("refunded_at", prevEnd.toISOString())
          .limit(5000),
        db
          .from("vendor_expenses")
          .select("amount_cents, currency")
          .eq("vendor_id", vendorId)
          .gte("occurred_on", prevStart.toISOString().slice(0, 10))
          .lt("occurred_on", prevEnd.toISOString().slice(0, 10))
          .limit(5000),
      ]);
      if (cancelled) return;
      const prevPaid = (prevPaidRes.data ?? []) as Array<{ total_cents: number; currency: string }>;
      const prevRefunded = (prevRefundedRes.data ?? []) as Array<{ total_cents: number; refunded_amount_cents: number | null; currency: string }>;
      const prevExpenses = (prevExpensesRes.data ?? []) as Array<{ amount_cents: number; currency: string }>;
      const pGross = prevPaid.reduce((s, r) => s + r.total_cents, 0);
      const pRefunds = prevRefunded.reduce((s, r) => s + (r.refunded_amount_cents ?? r.total_cents), 0);
      const pExpenses = prevExpenses.reduce((s, r) => s + r.amount_cents, 0);
      // Net profit baseline excludes Stripe fees (we don't fetch
      // them for the prev period; the delta is approximate, called
      // out in the comment for the KPI consumer below).
      const pNetProfit = pGross - pRefunds - pExpenses;
      setPrevPeriod({ gross: pGross, refunds: pRefunds, expenses: pExpenses, netProfit: pNetProfit });
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId, range]);

  const totals = useMemo(() => {
    let gross = 0;
    let tax = 0;
    let subtotal = 0;
    const customers = new Set<string>();
    // Per-state breakdown for the sales-tax-owed table. Invoices
    // without a billing state (ACH, wire, legacy rows from before
    // we started stamping) bucket under "Unknown" so they're
    // visible to the vendor — better than silently dropping them.
    const taxByStateMap = new Map<string, { taxCents: number; grossCents: number; count: number }>();
    for (const inv of paidInRange) {
      gross += inv.total_cents;
      tax += inv.tax_cents;
      subtotal += inv.subtotal_cents;
      if (inv.bill_to_email) customers.add(inv.bill_to_email.toLowerCase());
      if (inv.tax_cents > 0) {
        const key = inv.bill_to_state?.trim().toUpperCase() || "—";
        const prev = taxByStateMap.get(key) ?? { taxCents: 0, grossCents: 0, count: 0 };
        taxByStateMap.set(key, {
          taxCents: prev.taxCents + inv.tax_cents,
          grossCents: prev.grossCents + inv.total_cents,
          count: prev.count + 1,
        });
      }
    }
    let refunds = 0;
    for (const inv of refundedInRange) {
      // refunded_amount_cents tracks the cumulative Stripe-reported
      // refund. Fall back to total_cents for legacy rows that were
      // refunded before the column existed.
      refunds += inv.refunded_amount_cents ?? inv.total_cents;
    }
    const net = gross - refunds;
    const fees = stripeFees?.fees_cents ?? 0;
    // Expenses + per-category breakdown for the P&L block. Only
    // sum expenses whose currency matches what the rest of the P&L
    // is denominated in (the first paid invoice's currency, or
    // 'usd' on an empty window). Mixing currencies — adding USD
    // cents to GBP cents — would produce a nonsense Net Profit
    // headline. Off-currency expenses are intentionally dropped
    // from the rollup; they still appear on the Expenses tab and
    // count toward YTD spend in their own currency.
    const reportCurrency = (
      paidInRange[0]?.currency ?? refundedInRange[0]?.currency ?? "usd"
    ).toLowerCase();
    let expenses = 0;
    const expensesByCategoryMap = new Map<string, { cents: number; count: number }>();
    for (const e of expensesInRange) {
      if ((e.currency ?? "usd").toLowerCase() !== reportCurrency) continue;
      expenses += e.amount_cents;
      const prev = expensesByCategoryMap.get(e.category) ?? { cents: 0, count: 0 };
      expensesByCategoryMap.set(e.category, {
        cents: prev.cents + e.amount_cents,
        count: prev.count + 1,
      });
    }
    const expensesByCategory = Array.from(expensesByCategoryMap.entries())
      .map(([category, agg]) => ({ category: category as ExpenseCategory, ...agg }))
      .sort((a, b) => b.cents - a.cents);
    // Net to bank: what actually lands after Stripe's processor cut.
    // We use the invoice-derived gross/refunds (cash-basis cleaner)
    // and just subtract the Stripe-derived fees, instead of using
    // stripeFees.net_cents which only reflects type='charge' txns
    // and wouldn't account for refunds we're tracking separately.
    const netToBank = net - fees;
    // Net profit goes one step further than netToBank: subtracts
    // operating expenses (what the vendor actually spent to run the
    // business), not just Stripe's cut. This is the number the
    // vendor's CPA actually cares about at year-end.
    const netProfit = netToBank - expenses;
    const currency = paidInRange[0]?.currency ?? refundedInRange[0]?.currency ?? "usd";
    const taxByState = Array.from(taxByStateMap.entries())
      .map(([state, agg]) => ({ state, ...agg }))
      .sort((a, b) => b.taxCents - a.taxCents);
    return {
      gross,
      tax,
      subtotal,
      refunds,
      net,
      fees,
      netToBank,
      expenses,
      expensesByCategory,
      expenseCount: expensesInRange.length,
      netProfit,
      customers: customers.size,
      count: paidInRange.length,
      refundCount: refundedInRange.length,
      taxByState,
      currency,
    };
  }, [paidInRange, refundedInRange, stripeFees, expensesInRange]);

  // Bucket paid invoices by day for the sparkline. For ranges
  // A/R aging — bucket unpaid invoices by days past due. "Current"
  // covers everything not yet due (including no due_date, which we
  // treat as not-overdue since the vendor never set a deadline).
  // Buckets are the standard 1-30 / 31-60 / 61-90 / 90+ CPAs expect.
  const aging = useMemo(() => {
    const buckets = {
      current: { count: 0, totalCents: 0 },
      d1_30: { count: 0, totalCents: 0 },
      d31_60: { count: 0, totalCents: 0 },
      d61_90: { count: 0, totalCents: 0 },
      d90plus: { count: 0, totalCents: 0 },
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const inv of unpaidNow) {
      const owed = inv.total_cents;
      if (!inv.due_date) {
        buckets.current.count++;
        buckets.current.totalCents += owed;
        continue;
      }
      const due = new Date(inv.due_date + "T00:00:00");
      const daysLate = Math.floor((today.getTime() - due.getTime()) / (24 * 3600 * 1000));
      if (daysLate < 1) {
        buckets.current.count++;
        buckets.current.totalCents += owed;
      } else if (daysLate <= 30) {
        buckets.d1_30.count++;
        buckets.d1_30.totalCents += owed;
      } else if (daysLate <= 60) {
        buckets.d31_60.count++;
        buckets.d31_60.totalCents += owed;
      } else if (daysLate <= 90) {
        buckets.d61_90.count++;
        buckets.d61_90.totalCents += owed;
      } else {
        buckets.d90plus.count++;
        buckets.d90plus.totalCents += owed;
      }
    }
    const totalOpen = unpaidNow.reduce((s, inv) => s + inv.total_cents, 0);
    const currency = unpaidNow[0]?.currency ?? "usd";
    return { ...buckets, totalOpen, totalCount: unpaidNow.length, currency };
  }, [unpaidNow]);

  // shorter than ~60 days we bucket per day; longer windows go
  // weekly so a year-long view stays readable.
  const sparkline = useMemo(() => {
    const rangeMs = range.end.getTime() - range.start.getTime();
    const bucketMs =
      rangeMs > 60 * 24 * 60 * 60 * 1000 ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const buckets = Math.min(
      Math.max(1, Math.ceil(rangeMs / bucketMs)),
      120, // hard cap so all-time doesn't blow up
    );
    const values = new Array<number>(buckets).fill(0);
    for (const inv of paidInRange) {
      if (!inv.paid_at) continue;
      const t = Date.parse(inv.paid_at);
      if (Number.isNaN(t)) continue;
      const idx = Math.min(
        buckets - 1,
        Math.floor((t - range.start.getTime()) / bucketMs),
      );
      if (idx >= 0) values[idx] += inv.total_cents;
    }
    const max = values.reduce((m, v) => (v > m ? v : m), 0);
    return { values, max, buckets, weekly: bucketMs !== 24 * 60 * 60 * 1000 };
  }, [paidInRange, range]);

  const downloadCsv = useCallback(() => {
    const headers = [
      "kind",
      "invoice_number",
      "issue_date",
      "event_at",
      "bill_to_name",
      "bill_to_email",
      "bill_to_state",
      "subtotal_cents",
      "tax_cents",
      "total_cents",
      "refunded_amount_cents",
      "currency",
      "status",
    ];
    type InvoiceRow = { inv: Invoice; kind: "payment" | "refund"; eventAt: string | null };
    const invoiceRows: InvoiceRow[] = [
      ...paidInRange.map((inv) => ({
        inv,
        kind: "payment" as const,
        eventAt: inv.paid_at,
      })),
      ...refundedInRange.map((inv) => ({
        inv,
        kind: "refund" as const,
        eventAt: inv.refunded_at ?? null,
      })),
    ];
    type ExpenseRow = { kind: "expense"; expense: Expense; eventAt: string };
    const expenseRows: ExpenseRow[] = expensesInRange.map((e) => ({
      kind: "expense",
      expense: e,
      eventAt: e.occurred_on,
    }));
    // Sort the union by event date so a CPA reading the CSV gets a
    // chronological cashflow ledger: payment → expense → refund →
    // expense, in whatever order they happened.
    const allRows: Array<InvoiceRow | ExpenseRow> = [
      ...invoiceRows,
      ...expenseRows,
    ].sort((a, b) =>
      a.eventAt && b.eventAt ? a.eventAt.localeCompare(b.eventAt) : 0,
    );
    const lines = allRows.map((row) => {
      if (row.kind === "expense") {
        return [
          "expense",
          "", // invoice_number
          "", // issue_date
          row.eventAt,
          row.expense.paid_to ?? "",
          "", // bill_to_email
          "", // bill_to_state
          "", // subtotal_cents
          "", // tax_cents
          -row.expense.amount_cents,
          0, // refunded_amount_cents
          row.expense.currency,
          row.expense.category,
        ]
          .map(csvEscape)
          .join(",");
      }
      const { inv, kind, eventAt } = row;
      return [
        kind,
        inv.invoice_number,
        inv.issue_date,
        eventAt,
        inv.bill_to_name,
        inv.bill_to_email,
        inv.bill_to_state ?? "",
        inv.subtotal_cents,
        inv.tax_cents,
        inv.total_cents,
        inv.refunded_amount_cents ?? 0,
        inv.currency,
        inv.status,
      ]
        .map(csvEscape)
        .join(",");
    });
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `vendorapay-sales-${rangeId}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [paidInRange, refundedInRange, expensesInRange, rangeId]);

  // QuickBooks Online "Invoice CSV" import. QBO's importer expects
  // these exact column headers (case + spacing matters):
  //   InvoiceNo, Customer, InvoiceDate, DueDate, Terms, Memo,
  //   Item(Product/Service), ItemDescription, ItemQuantity, ItemRate,
  //   *ItemAmount, ItemTaxCode, ItemTaxAmount, Currency
  // Reference: https://quickbooks.intuit.com/learn-support/en-us/help-article/import-export-data/import-invoices-quickbooks-online/L0xbDsBC9_US_en_US
  //
  // One row per LINE ITEM (a 3-line invoice = 3 rows with the same
  // InvoiceNo). QBO collapses on InvoiceNo on import. Refunded
  // invoices and expenses are skipped — QBO has separate importers
  // for those.
  const downloadQboCsv = useCallback(() => {
    const headers = [
      "InvoiceNo",
      "Customer",
      "InvoiceDate",
      "DueDate",
      "Terms",
      "Memo",
      "Item(Product/Service)",
      "ItemDescription",
      "ItemQuantity",
      "ItemRate",
      "*ItemAmount",
      "ItemTaxCode",
      "ItemTaxAmount",
      "Currency",
    ];
    const lines: string[] = [];
    for (const inv of paidInRange) {
      const customerKey = inv.bill_to_name?.trim() || inv.bill_to_email || "Customer";
      const items = inv.line_items.length > 0
        ? inv.line_items
        : [{
            name: `Invoice ${inv.invoice_number}`,
            description: undefined,
            qty: 1,
            unit_price_cents: inv.subtotal_cents,
            total_cents: inv.subtotal_cents,
          }];
      const totalLineAmount = items.reduce(
        (s, li) => s + (li.total_cents ?? li.qty * li.unit_price_cents),
        0,
      );
      // QBO tracks tax per-line; we only have an invoice-level tax,
      // so we attach the full tax to the FIRST line and zero the rest.
      // Tax-code "TAX" means "use the customer's default tax rate" —
      // QBO will recompute on import. "NON" = non-taxable.
      const lateFee = inv.late_fee_cents ?? 0;
      items.forEach((li, idx) => {
        const lineAmount = li.total_cents ?? li.qty * li.unit_price_cents;
        const isFirst = idx === 0;
        const taxAmount = isFirst ? inv.tax_cents : 0;
        const taxCode = inv.tax_cents > 0 && isFirst ? "TAX" : "NON";
        lines.push(
          [
            inv.invoice_number,
            customerKey,
            inv.issue_date,
            inv.due_date ?? "",
            "", // Terms — leave blank
            inv.notes ?? "",
            li.name || "Line item",
            li.description ?? "",
            String(li.qty),
            (li.unit_price_cents / 100).toFixed(2),
            (lineAmount / 100).toFixed(2),
            taxCode,
            (taxAmount / 100).toFixed(2),
            inv.currency.toUpperCase(),
          ]
            .map(csvEscape)
            .join(","),
        );
      });
      // Late fee, when present, gets its own line so QBO mirrors what
      // the buyer was actually charged.
      if (lateFee > 0) {
        lines.push(
          [
            inv.invoice_number,
            customerKey,
            inv.issue_date,
            inv.due_date ?? "",
            "",
            "Late fee added after invoice was sent",
            "Late fee",
            "",
            "1",
            (lateFee / 100).toFixed(2),
            (lateFee / 100).toFixed(2),
            "NON",
            "0.00",
            inv.currency.toUpperCase(),
          ]
            .map(csvEscape)
            .join(","),
        );
      }
      // Sanity-log if the line items + tax + late fee don't equal
      // the invoice total. Not blocking; QBO will accept it either
      // way, but the vendor's CPA may flag the mismatch.
      const computed = totalLineAmount + inv.tax_cents + lateFee;
      if (computed !== inv.total_cents) {
        console.warn(
          "[reports] QBO export: line sum doesn't match total",
          inv.invoice_number,
          { computed, recorded: inv.total_cents },
        );
      }
    }
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `quickbooks-invoices-${rangeId}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [paidInRange, rangeId]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {REPORT_RANGES.map((r) => {
            const active = rangeId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRangeId(r.id)}
                className={`text-xs px-3 h-8 rounded-full transition-colors whitespace-nowrap ${
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            disabled={paidInRange.length === 0 && refundedInRange.length === 0 && expensesInRange.length === 0}
            className="rounded-full"
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadQboCsv}
            disabled={paidInRange.length === 0}
            className="rounded-full"
            title="QuickBooks Online Invoice CSV import format"
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            QuickBooks
          </Button>
        </div>
      </div>

      <section>
        <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
          Sales ({range.label.toLowerCase()})
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Gross"
            sub="Total invoiced + paid"
            value={formatMoney(totals.gross, totals.currency)}
            trend={prevPeriod ? <TrendDelta currentCents={totals.gross} previousCents={prevPeriod.gross} /> : null}
          />
          <StatCard
            label="Refunds"
            sub={
              totals.refundCount === 0
                ? "None in range"
                : `${totals.refundCount} invoice${totals.refundCount === 1 ? "" : "s"} refunded`
            }
            value={`-${formatMoney(totals.refunds, totals.currency)}`}
          />
          <StatCard
            label="Stripe fees"
            sub={
              stripeFees == null
                ? "Not connected"
                : `${stripeFees.count.toLocaleString()} charge${stripeFees.count === 1 ? "" : "s"}`
            }
            value={`-${formatMoney(totals.fees, totals.currency)}`}
          />
          <StatCard
            label="Net to bank"
            sub="Gross − refunds − fees"
            value={formatMoney(totals.netToBank, totals.currency)}
          />
          <StatCard
            label="Subtotal"
            sub="Before tax"
            value={formatMoney(totals.subtotal, totals.currency)}
          />
          <StatCard
            label="Tax collected"
            sub="Itemized on invoices"
            value={formatMoney(totals.tax, totals.currency)}
          />
          <StatCard
            label="Invoices paid"
            sub={`${totals.customers} unique buyer${totals.customers === 1 ? "" : "s"}`}
            value={totals.count.toLocaleString()}
          />
          <StatCard
            label="Net (pre-fees)"
            sub="Gross − refunds"
            value={formatMoney(totals.net, totals.currency)}
          />
        </div>
      </section>

      <section>
        <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
          Profit & loss ({range.label.toLowerCase()})
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Revenue"
            sub="Net to bank"
            value={formatMoney(totals.netToBank, totals.currency)}
          />
          <StatCard
            label="Expenses"
            sub={
              totals.expenseCount === 0
                ? "None in range"
                : `${totals.expenseCount} entr${totals.expenseCount === 1 ? "y" : "ies"}`
            }
            value={`-${formatMoney(totals.expenses, totals.currency)}`}
            trend={prevPeriod ? <TrendDelta currentCents={totals.expenses} previousCents={prevPeriod.expenses} /> : null}
          />
          <StatCard
            label="Net profit"
            sub="Revenue − expenses"
            value={formatMoney(totals.netProfit, totals.currency)}
            trend={prevPeriod ? <TrendDelta currentCents={totals.netProfit} previousCents={prevPeriod.netProfit} /> : null}
          />
          <StatCard
            label="Margin"
            sub="Profit / revenue"
            value={
              totals.netToBank > 0
                ? `${Math.round((totals.netProfit / totals.netToBank) * 100)}%`
                : "—"
            }
          />
        </div>
        {totals.expensesByCategory.length > 0 && (
          <Card>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1 p-5 text-sm mt-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold pb-2 border-b border-foreground/[0.06]">
                Category
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold text-right pb-2 border-b border-foreground/[0.06]">
                Entries
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold text-right pb-2 border-b border-foreground/[0.06]">
                Spend
              </div>
              {(() => {
                const maxCents = totals.expensesByCategory[0]?.cents ?? 0;
                return totals.expensesByCategory.map((row) => (
                  <div key={row.category} className="contents">
                    <div className="py-2 font-medium flex items-center gap-2">
                      <InlineBar value={row.cents} max={maxCents} />
                      {expenseCategoryLabel(row.category)}
                    </div>
                    <div className="py-2 text-right tabular-nums text-muted-foreground">{row.count}</div>
                    <div className="py-2 text-right tabular-nums">{formatMoney(row.cents, totals.currency)}</div>
                  </div>
                ));
              })()}
            </div>
          </Card>
        )}
      </section>

      {aging.totalCount > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-foreground/[0.06]">
            <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              A/R aging
            </h2>
            <span className="text-[10px] text-muted-foreground">As of today · {aging.totalCount} open invoice{aging.totalCount === 1 ? "" : "s"} · {formatMoney(aging.totalOpen, aging.currency)} owed</span>
          </div>
          <Card>
            <div className="grid grid-cols-5 divide-x divide-foreground/[0.06]">
              {[
                { key: "current", label: "Current", sub: "Not yet due", bucket: aging.current },
                { key: "d1_30", label: "1–30", sub: "Days late", bucket: aging.d1_30 },
                { key: "d31_60", label: "31–60", sub: "Days late", bucket: aging.d31_60 },
                { key: "d61_90", label: "61–90", sub: "Days late", bucket: aging.d61_90 },
                { key: "d90plus", label: "90+", sub: "Days late", bucket: aging.d90plus },
              ].map(({ key, label, sub, bucket }) => {
                const isLate = key !== "current";
                const hasAmount = bucket.totalCents > 0;
                return (
                  <div key={key} className="p-4">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                      {label}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70">{sub}</div>
                    <div className={`mt-2 text-lg font-editorial tabular-nums ${isLate && hasAmount ? "text-rose-700" : ""}`}>
                      {formatMoney(bucket.totalCents, aging.currency)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {bucket.count} invoice{bucket.count === 1 ? "" : "s"}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      )}

      <section>
        <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
          Revenue trend ({sparkline.weekly ? "weekly" : "daily"})
        </h2>
        <Card>
          <div className="p-5">
            <RevenueSparkline data={sparkline} currency={totals.currency} />
          </div>
        </Card>
      </section>

      {totals.taxByState.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
            Sales tax owed by state
          </h2>
          <Card>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 gap-y-1 p-5 text-sm">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold pb-2 border-b border-foreground/[0.06]">
                State
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold text-right pb-2 border-b border-foreground/[0.06]">
                Invoices
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold text-right pb-2 border-b border-foreground/[0.06]">
                Taxable sales
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold text-right pb-2 border-b border-foreground/[0.06]">
                Tax owed
              </div>
              {(() => {
                const maxTax = totals.taxByState[0]?.taxCents ?? 0;
                return totals.taxByState.map((row) => (
                  <div key={row.state} className="contents">
                    <div className="py-2 font-medium tabular-nums flex items-center gap-2">
                      <InlineBar value={row.taxCents} max={maxTax} />
                      {row.state === "—" ? "Unknown" : row.state}
                    </div>
                    <div className="py-2 text-right tabular-nums text-muted-foreground">{row.count}</div>
                    <div className="py-2 text-right tabular-nums">{formatMoney(row.grossCents, totals.currency)}</div>
                    <div className="py-2 text-right tabular-nums font-semibold">{formatMoney(row.taxCents, totals.currency)}</div>
                  </div>
                ));
              })()}
            </div>
          </Card>
          <p className="text-[11px] text-muted-foreground mt-2">
            States are pulled from the buyer's billing address at payment time. "Unknown" covers ACH/wire and any
            payments collected before billing-state stamping was wired up.
          </p>
        </section>
      )}

      <section>
        <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
          Paid invoices ({range.label.toLowerCase()})
        </h2>
        {loading ? (
          <EmptyCard>
            <Loader2 className="w-4 h-4 mr-2 inline animate-spin" />
            Loading…
          </EmptyCard>
        ) : paidInRange.length === 0 ? (
          <EmptyCard>
            No invoices paid in this range. Try widening the window or check the All time view.
          </EmptyCard>
        ) : (
          <Card>
            <div className="divide-y divide-foreground/[0.05]">
              {paidInRange
                .slice()
                .sort((a, b) =>
                  a.paid_at && b.paid_at ? b.paid_at.localeCompare(a.paid_at) : 0,
                )
                .slice(0, 50)
                .map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 flex items-start justify-between gap-3 flex-wrap"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {inv.invoice_number}
                        <span className="text-muted-foreground"> · {inv.bill_to_name ?? inv.bill_to_email ?? "—"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Paid {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold font-variant-numeric tabular-nums">
                        {formatMoney(inv.total_cents, inv.currency)}
                      </div>
                      {inv.tax_cents > 0 ? (
                        <div className="text-[11px] text-muted-foreground">
                          incl. {formatMoney(inv.tax_cents, inv.currency)} tax
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        )}
        {paidInRange.length > 50 ? (
          <p className="text-xs text-muted-foreground mt-2">
            Showing 50 most recent. Export the CSV for the full list.
          </p>
        ) : null}
      </section>
    </div>
  );
}

// Lightweight SVG bar chart of revenue per bucket. No charting
// library — straight rects so it stays tiny in the bundle and
// composes with the editorial / soft-beige palette.
function RevenueSparkline({
  data,
  currency,
}: {
  data: { values: number[]; max: number; buckets: number; weekly: boolean };
  currency: string;
}) {
  const { values, max, weekly } = data;
  if (max <= 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-6">
        No paid invoices in this window yet.
      </div>
    );
  }
  // Real area-line chart with axis labels + horizontal grid.
  // viewBox sized so the SVG scales cleanly across viewports while
  // axis tick text stays legible. Layout: PAD around a plot area
  // of W×H. Y axis on left shows max + half + zero. X axis at
  // bottom shows first/last bucket index plus tick marks.
  const PAD_L = 56;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 22;
  const W = 720;
  const H = 220;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = values.length;
  // X positions evenly spaced across the plot
  const x = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;
  const linePath = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(n - 1).toFixed(1)},${PAD_T + plotH} L${x(0).toFixed(1)},${PAD_T + plotH} Z`;
  const yTicks = [0, 0.5, 1]; // % of max
  const total = values.reduce((s, v) => s + v, 0);
  const peakIdx = values.indexOf(max);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="cockpit-chart-title">Revenue trend</div>
          <div className="cockpit-chart-sub">
            {weekly ? "Weekly buckets" : "Daily buckets"} · {n} {weekly ? "weeks" : "days"}
          </div>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <div className="cockpit-stat-label">Total</div>
            <div className="cockpit-money cockpit-money--lg">{formatMoney(total, currency)}</div>
          </div>
          <div>
            <div className="cockpit-stat-label">Peak</div>
            <div className="cockpit-money">{formatMoney(max, currency)}</div>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[220px]" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="cockpit-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Horizontal grid */}
        {yTicks.map((t) => {
          const yy = PAD_T + plotH - t * plotH;
          return (
            <g key={t}>
              <line x1={PAD_L} y1={yy} x2={PAD_L + plotW} y2={yy} className="cockpit-chart-grid" />
              <text x={PAD_L - 6} y={yy} textAnchor="end" dominantBaseline="middle" className="cockpit-chart-axis">
                {t === 0 ? "$0" : formatMoneyCompact(max * t, currency)}
              </text>
            </g>
          );
        })}
        {/* Vertical baseline */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth="1" />
        {/* Area fill + line */}
        <path d={areaPath} className="cockpit-chart-area" />
        <path d={linePath} className="cockpit-chart-line" />
        {/* Peak marker dot */}
        {peakIdx >= 0 && max > 0 && (
          <circle cx={x(peakIdx)} cy={y(max)} r="3.5" className="cockpit-chart-dot" />
        )}
        {/* X axis labels — first / mid / last bucket */}
        <text x={PAD_L} y={H - 6} textAnchor="start" className="cockpit-chart-axis">
          {weekly ? `Week 1` : `Day 1`}
        </text>
        <text x={PAD_L + plotW / 2} y={H - 6} textAnchor="middle" className="cockpit-chart-axis">
          {weekly ? `Week ${Math.ceil(n / 2)}` : `Day ${Math.ceil(n / 2)}`}
        </text>
        <text x={PAD_L + plotW} y={H - 6} textAnchor="end" className="cockpit-chart-axis">
          {weekly ? `Week ${n}` : `Day ${n}`}
        </text>
      </svg>
    </div>
  );
}

// Compact money formatter for chart axis labels — "1.2k" / "12.5k"
// / "1.2M" instead of "$1,200" so 5 ticks fit on a narrow Y axis.
function formatMoneyCompact(cents: number, currency: string): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  const fmt = (n: number, suffix: string) => {
    const s = n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, "");
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 })
      .format(0).replace(/0/g, "") + s + suffix;
  };
  if (abs >= 1_000_000) return fmt(v / 1_000_000, "M");
  if (abs >= 1_000) return fmt(v / 1_000, "k");
  return formatMoney(cents, currency);
}

// Horizontal in-cell bar visualization — used in Reports tables
// (Sales by state, Expenses by category) to show relative magnitude
// next to the dollar amount. Tableau-style "bar in row" pattern.
function InlineBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className="cockpit-inline-bar-track" aria-hidden>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

// Trend delta chip — "+12.4%" up green, "-3.2%" down red, "—" flat.
// Used on KPI tiles to compare current-window vs previous-window
// (e.g., Net profit this month vs last month).
function TrendDelta({
  currentCents,
  previousCents,
}: {
  currentCents: number;
  previousCents: number;
}) {
  if (previousCents === 0) {
    return currentCents === 0 ? null : (
      <span className="cockpit-delta cockpit-delta--up">▲ new</span>
    );
  }
  const pct = ((currentCents - previousCents) / Math.abs(previousCents)) * 100;
  const flat = Math.abs(pct) < 0.5;
  const up = pct > 0;
  const cls = flat ? "cockpit-delta--flat" : up ? "cockpit-delta--up" : "cockpit-delta--down";
  const arrow = flat ? "—" : up ? "▲" : "▼";
  return (
    <span className={`cockpit-delta ${cls}`}>
      {arrow} {flat ? "0%" : `${Math.abs(pct).toFixed(1)}%`}
    </span>
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
          ? "No transactions yet. When buyers pay you, they'll show up here."
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

interface PayoutReconciliation {
  id: string;
  stripe_payout_id: string;
  reconciled_at: string;
  bank_deposit_ref: string | null;
  notes: string | null;
}

function PayoutsTab({
  data,
  status,
  vendorId,
}: {
  data: PayoutsResponse | null;
  status: Status | null;
  vendorId: string | null;
}) {
  const { user } = useAuth();
  const schedule = data?.schedule;
  const [reconciliations, setReconciliations] = useState<PayoutReconciliation[]>([]);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [editingRef, setEditingRef] = useState<{ payoutId: string; ref: string; notes: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vendorId) {
      setReconciliations([]);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: rows, error } = await db
      .from("vendor_payout_reconciliations")
      .select("id, stripe_payout_id, reconciled_at, bank_deposit_ref, notes")
      .eq("vendor_id", vendorId)
      .order("reconciled_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error("[PayoutsTab] reconciliation fetch failed", error);
      return;
    }
    setReconciliations((rows ?? []) as PayoutReconciliation[]);
  }, [vendorId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reconciledMap = useMemo(() => {
    const m = new Map<string, PayoutReconciliation>();
    for (const r of reconciliations) m.set(r.stripe_payout_id, r);
    return m;
  }, [reconciliations]);

  const beginReconcile = (payoutId: string) => {
    const existing = reconciledMap.get(payoutId);
    setEditingRef({
      payoutId,
      ref: existing?.bank_deposit_ref ?? "",
      notes: existing?.notes ?? "",
    });
  };

  const saveReconcile = async () => {
    if (!editingRef || !vendorId || !user) return;
    setBusyId(editingRef.payoutId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const existing = reconciledMap.get(editingRef.payoutId);
    let error;
    if (existing) {
      ({ error } = await db
        .from("vendor_payout_reconciliations")
        .update({
          bank_deposit_ref: editingRef.ref.trim() || null,
          notes: editingRef.notes.trim() || null,
        })
        .eq("id", existing.id));
    } else {
      ({ error } = await db.from("vendor_payout_reconciliations").insert({
        vendor_id: vendorId,
        stripe_payout_id: editingRef.payoutId,
        reconciled_by: user.id,
        bank_deposit_ref: editingRef.ref.trim() || null,
        notes: editingRef.notes.trim() || null,
      }));
    }
    setBusyId(null);
    if (error) {
      console.error("[PayoutsTab] reconcile save failed", error);
      toast.error("Couldn't save reconciliation.");
      return;
    }
    toast.success(existing ? "Reconciliation updated." : "Payout reconciled.");
    setEditingRef(null);
    void refresh();
  };

  const unreconcile = async (payoutId: string) => {
    const existing = reconciledMap.get(payoutId);
    if (!existing) return;
    if (!confirm("Mark this payout as not reconciled?")) return;
    setReconcilingId(payoutId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { error } = await db
      .from("vendor_payout_reconciliations")
      .delete()
      .eq("id", existing.id);
    setReconcilingId(null);
    if (error) {
      console.error("[PayoutsTab] unreconcile failed", error);
      toast.error("Couldn't undo reconciliation.");
      return;
    }
    void refresh();
  };

  // Summary: how many of the visible payouts have been reconciled?
  const summary = useMemo(() => {
    const payouts = data?.payouts ?? [];
    const total = payouts.length;
    const reconciledCount = payouts.filter((p) => reconciledMap.has(p.id)).length;
    return { total, reconciledCount };
  }, [data, reconciledMap]);

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
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
        <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-foreground/[0.06]">
          <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Recent payouts
          </h2>
          {summary.total > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {summary.reconciledCount}/{summary.total} reconciled
            </span>
          )}
        </div>
        {!data?.payouts || data.payouts.length === 0 ? (
          <EmptyCard>
            {status?.charges_enabled
              ? "No payouts yet. They show up after your first settled charge."
              : "Payouts begin after your first settled payment."}
          </EmptyCard>
        ) : (
          <Card>
            {data.payouts.map((p, idx) => {
              const recon = reconciledMap.get(p.id);
              const isEditing = editingRef?.payoutId === p.id;
              return (
                <div
                  key={p.id}
                  className={`p-5 ${idx > 0 ? "border-t border-foreground/5" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center bg-sky-50 text-sky-700">
                      <Banknote className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-2 flex-wrap">
                        {p.description ?? "Bank deposit"}
                        {recon && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700">
                            ✓ Reconciled
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                        {p.method.replace(/_/g, " ")} · arrives {formatDate(p.arrival_date)} · {p.status}
                      </div>
                      {recon?.bank_deposit_ref && !isEditing && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Bank ref: <span className="font-medium tabular-nums">{recon.bank_deposit_ref}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-sm font-semibold shrink-0">
                      {formatMoney(p.amount_cents, p.currency)}
                    </div>
                    <div className="shrink-0 flex gap-1">
                      {recon ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => beginReconcile(p.id)}
                            className="rounded-full"
                          >
                            Edit ref
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void unreconcile(p.id)}
                            disabled={reconcilingId === p.id}
                            className="rounded-full text-muted-foreground"
                          >
                            {reconcilingId === p.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              "Undo"
                            )}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => beginReconcile(p.id)}
                          disabled={!vendorId}
                          className="rounded-full"
                        >
                          Reconcile
                        </Button>
                      )}
                    </div>
                  </div>
                  {isEditing && (
                    <div className="mt-3 space-y-2 pl-12">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Bank deposit reference (optional)"
                          value={editingRef.ref}
                          onChange={(e) => setEditingRef({ ...editingRef, ref: e.target.value })}
                          className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                        />
                        <input
                          type="text"
                          placeholder="Notes (optional)"
                          value={editingRef.notes}
                          onChange={(e) => setEditingRef({ ...editingRef, notes: e.target.value })}
                          className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void saveReconcile()}
                          disabled={busyId === p.id}
                          className="rounded-full"
                        >
                          {busyId === p.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                          {recon ? "Save" : "Mark reconciled"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingRef(null)}
                          className="rounded-full"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
  paymentLinks: PaymentLink[];
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
      <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mt-1">
        {FILES_TABS.map((t) => {
          const active = fileTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setFileTab(t.id)}
              className={`cockpit-tab inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                active ? "cockpit-tab--active" : ""
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {fileTab === "invoices" ? (
        <InvoicesTab
          vendorId={props.vendorId}
          listing={props.listing}
          invoices={props.invoices}
          status={props.status}
          onChanged={props.onChanged}
        />
      ) : fileTab === "links" ? (
        <PayLinksTab
          vendorId={props.vendorId}
          links={props.paymentLinks}
          status={props.status}
          onChanged={props.onChanged}
        />
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
        <div className="px-4 pt-3 pb-2 border-b border-foreground/5">
          <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
            {kind === "contract" ? "Contract template" : "Proposal template"}
          </p>
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
  const { user } = useAuth();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [lateFeeTarget, setLateFeeTarget] = useState<Invoice | null>(null);
  const [lateFeeAmount, setLateFeeAmount] = useState("");
  const [lateFeeSaving, setLateFeeSaving] = useState(false);

  const openLateFeeModal = (inv: Invoice) => {
    // Suggest 5% of the ORIGINAL engagement amount — not 5% of the
    // already-bumped total. Using inv.total_cents directly compounds
    // the fee on each "Add more" cycle (5% → 5.25% → 5.51% …) which
    // the vendor never signed up for. Subtract any prior late fees
    // to recover the pre-fee base.
    const base = inv.total_cents - (inv.late_fee_cents ?? 0);
    const suggested = Math.round(base * 0.05) / 100;
    setLateFeeAmount(suggested.toFixed(2));
    setLateFeeTarget(inv);
  };
  const saveLateFee = async () => {
    if (!lateFeeTarget) return;
    const amountNum = Number(lateFeeAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Enter a positive late-fee amount.");
      return;
    }
    // Cap at $1M per fee — total_cents is an int4 column so the sum
    // (original + accumulated late fees) maxes around $21M before
    // Postgres overflows with an opaque "integer out of range".
    // Far above any real late-fee, well below the column ceiling.
    if (amountNum > 1_000_000) {
      toast.error("Late fee can't exceed $1,000,000.");
      return;
    }
    const feeCents = Math.round(amountNum * 100);
    setLateFeeSaving(true);
    // Atomic SQL increment via the invoice_add_late_fee RPC. The
    // previous read-(stale-state)-modify-write path lost updates
    // when two admins added a fee at once. The RPC's UPDATE row-
    // locks so concurrent calls serialize correctly and rejects
    // out-of-status invoices (e.g. one just paid by the buyer).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("invoice_add_late_fee", {
      p_invoice_id: lateFeeTarget.id,
      p_fee_cents: feeCents,
    });
    setLateFeeSaving(false);
    if (error) {
      console.error("[InvoicesTab] late fee save failed", error);
      // Surface the RPC's message when it's actionable (status
      // changed, not authorized) instead of swallowing as generic
      // failure. Postgres errors like "integer out of range" still
      // get a friendly summary.
      const detail = typeof error?.message === "string" ? error.message : undefined;
      const friendly = detail?.includes("status changed")
        ? "This invoice was just paid — refresh and the late-fee button will disappear."
        : detail?.includes("out of range")
          ? "Late fee is too large for this invoice's total."
          : undefined;
      toast.error("Couldn't add late fee.", friendly ? { description: friendly } : undefined);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const newTotal = (row?.total_cents as number | undefined) ?? lateFeeTarget.total_cents;
    toast.success(`Late fee added · new total ${formatMoney(newTotal, lateFeeTarget.currency)}`);
    setLateFeeTarget(null);
    onChanged();
  };

  // Lazy-imports jspdf + jspdf-autotable so the dashboard's initial
  // bundle stays slim — vendors only ever click Download on demand.
  const downloadPdf = useCallback(
    async (inv: Invoice) => {
      setDownloadingId(inv.id);
      try {
        const mod = await import("@/lib/invoiceReceiptPdf");
        mod.downloadInvoicePdf(
          {
            invoice_number: inv.invoice_number,
            bill_to_name: inv.bill_to_name,
            bill_to_email: inv.bill_to_email,
            issue_date: inv.issue_date,
            due_date: inv.due_date,
            notes: inv.notes,
            line_items: inv.line_items.map((li) => ({
              name: li.name,
              qty: li.qty,
              unit_price_cents: li.unit_price_cents,
              total_cents: li.total_cents,
            })),
            subtotal_cents: inv.subtotal_cents,
            tax_rate_bps: inv.tax_rate_bps,
            tax_cents: inv.tax_cents,
            total_cents: inv.total_cents,
            currency: inv.currency,
            status: inv.status,
            paid_at: inv.paid_at,
            refunded_amount_cents: inv.refunded_amount_cents,
            late_fee_cents: inv.late_fee_cents,
          },
          {
            business_name: listing?.business_name ?? null,
            location: listing?.location ?? null,
            email: user?.email ?? null,
          },
        );
      } catch (err) {
        console.error("[InvoicesTab] PDF download failed", err);
        toast.error("Couldn't build the PDF. Try again in a moment.");
      } finally {
        setDownloadingId(null);
      }
    },
    [listing, user],
  );

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

  const cancelInvoice = useCallback(async (inv: Invoice) => {
    // Destructive + irreversible: status='cancelled' is terminal,
    // there's no "uncancel" path. Always confirm so an accidental
    // click doesn't kill a live invoice the buyer hasn't paid yet.
    if (!confirm(`Cancel invoice ${inv.invoice_number}? This can't be undone.`)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("invoices")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", inv.id);
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
        <EmptyCard>
          No invoices yet. Add a customer on the Customers tab and click Send invoice to compose your first one.
        </EmptyCard>
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
                    {inv.reminder_sent_at && (inv.status === "sent" || inv.status === "overdue")
                      ? ` · Reminder sent ${formatDate(inv.reminder_sent_at)}`
                      : ""}
                    {inv.late_fee_cents && inv.late_fee_cents > 0
                      ? ` · Late fee +${formatMoney(inv.late_fee_cents, inv.currency)}`
                      : ""}
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
                {inv.status !== "cancelled" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadPdf(inv)}
                    disabled={downloadingId === inv.id}
                    className="rounded-full"
                  >
                    {downloadingId === inv.id ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5 mr-1" />
                    )}
                    PDF
                  </Button>
                ) : null}
                {(inv.status === "sent" || inv.status === "overdue") ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openLateFeeModal(inv)}
                    className="rounded-full"
                    title="Add a late fee — the Pay page and the next reminder will reflect the new total"
                  >
                    {inv.late_fee_cents && inv.late_fee_cents > 0
                      ? "Add more"
                      : "Late fee"}
                  </Button>
                ) : null}
                {(inv.status === "draft" || inv.status === "sent" || inv.status === "overdue") ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancelInvoice(inv)}
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

      {lateFeeTarget && (
        <Dialog open onOpenChange={(open) => { if (!open) setLateFeeTarget(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add late fee · {lateFeeTarget.invoice_number}</DialogTitle>
              <DialogDescription>
                Original total {formatMoney(lateFeeTarget.total_cents - (lateFeeTarget.late_fee_cents ?? 0), lateFeeTarget.currency)}
                {lateFeeTarget.late_fee_cents
                  ? ` · current late fee ${formatMoney(lateFeeTarget.late_fee_cents, lateFeeTarget.currency)}`
                  : ""}
                . Suggested = 5% of the original. Override below.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                  Late fee amount
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={lateFeeAmount}
                    onChange={(e) => setLateFeeAmount(e.target.value)}
                    className="flex-1 rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                The Pay page, the next overdue reminder email, and the receipt all use the updated total. The
                buyer sees "Late fee" as its own line so there are no surprises.
              </p>
              <div className="flex gap-2 justify-end">
                <Button onClick={() => setLateFeeTarget(null)} variant="ghost" size="sm" className="rounded-full">
                  Cancel
                </Button>
                <Button onClick={() => void saveLateFee()} disabled={lateFeeSaving} size="sm" className="rounded-full">
                  {lateFeeSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                  Add fee
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function InvoiceStatusPill({ status }: { status: Invoice["status"] }) {
  // Each variant gets a cockpit-pill semantic + the legacy Tailwind
  // classes for outside-cockpit contexts. tsconfig.app has
  // strict:false so Record<> exhaustiveness isn't enforced —
  // a missing key would render `undefined.className` and crash
  // the InvoicesTab row.
  const map: Record<Invoice["status"], { label: string; className: string; cockpit: string }> = {
    draft: { label: "Draft", className: "bg-slate-100 text-slate-700", cockpit: "cockpit-pill--neutral" },
    sent: { label: "Sent", className: "bg-emerald-100 text-emerald-700", cockpit: "cockpit-pill--info" },
    paid: { label: "Paid", className: "bg-sky-100 text-sky-700", cockpit: "cockpit-pill--success" },
    cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-700", cockpit: "cockpit-pill--neutral" },
    overdue: { label: "Overdue", className: "bg-rose-100 text-rose-700", cockpit: "cockpit-pill--danger" },
    refunded: { label: "Refunded", className: "bg-orange-100 text-orange-800", cockpit: "cockpit-pill--warning" },
    partial_refund: { label: "Partial refund", className: "bg-orange-100 text-orange-800", cockpit: "cockpit-pill--warning" },
  };
  const m = map[status] ?? { label: status, className: "bg-slate-100 text-slate-700", cockpit: "cockpit-pill--neutral" };
  return (
    <span className={`cockpit-pill ${m.cockpit} inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.className}`}>
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
  const [statementId, setStatementId] = useState<string | null>(null);
  const { user } = useAuth();

  // Statement download — fetches the FULL invoice history for this
  // customer (not the parent's 50-row cache) so an end-of-year
  // statement doesn't miss older invoices. Lazy-imports the PDF
  // module so jsPDF stays out of the initial bundle.
  const downloadStatement = useCallback(
    async (c: Customer) => {
      if (!vendorId) return;
      // Snapshot the vendor id + brand at click time. If the vendor
      // switches listings while the network fetch is in flight, the
      // closure would otherwise read the NEW listing's brand and
      // stamp it on the OLD listing's invoices — customer receives
      // a PDF claiming to be from a vendor they never dealt with.
      const snapVendorId = vendorId;
      const snapBrand = {
        business_name: listing?.business_name ?? null,
        location: listing?.location ?? null,
        email: user?.email ?? null,
      };
      setStatementId(c.id);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any;
        const { data, error } = await db
          .from("invoices")
          .select(
            "invoice_number, issue_date, due_date, paid_at, refunded_at, refunded_amount_cents, status, total_cents, currency",
          )
          .eq("vendor_id", snapVendorId)
          .eq("bill_to_email", c.email)
          // Drafts haven't reached the customer — including them in
          // the statement leaks in-progress amounts the buyer never
          // saw and inflates the "Billed" total. Cancelled invoices
          // are excluded for the same reason (already filtered in
          // buildStatementPdf, but we don't want to ship the rows
          // over the wire either).
          .in("status", ["sent", "overdue", "paid", "refunded", "partial_refund"])
          .order("issue_date", { ascending: true })
          .limit(1000);
        if (error) {
          console.error("[CustomersTab] statement fetch failed", error);
          toast.error("Couldn't load this customer's invoice history.");
          return;
        }
        const invoices = (data ?? []) as Array<{
          invoice_number: string;
          issue_date: string;
          due_date: string | null;
          paid_at: string | null;
          refunded_at: string | null;
          refunded_amount_cents: number | null;
          status: string;
          total_cents: number;
          currency: string;
        }>;
        if (invoices.length === 0) {
          toast.info("No invoices yet for this customer.");
          return;
        }
        const mod = await import("@/lib/invoiceReceiptPdf");
        mod.downloadStatementPdf(
          {
            customer_name: c.name,
            customer_email: c.email,
            since: null,
            until: null,
            invoices: invoices.map((inv) => ({
              invoice_number: inv.invoice_number,
              issue_date: inv.issue_date,
              due_date: inv.due_date,
              paid_at: inv.paid_at,
              refunded_at: inv.refunded_at ?? undefined,
              refunded_amount_cents: inv.refunded_amount_cents ?? undefined,
              status: inv.status,
              total_cents: inv.total_cents,
              currency: inv.currency,
            })),
            currency: invoices[0]?.currency ?? "usd",
          },
          snapBrand,
        );
      } catch (err) {
        console.error("[CustomersTab] statement build failed", err);
        toast.error("Couldn't build the statement PDF.");
      } finally {
        setStatementId(null);
      }
    },
    [vendorId, listing, user],
  );

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

  // Switching listings has to invalidate every open dialog state
  // AND clear the displayed rows — otherwise a Send invoice / Edit
  // / Recurring panel opened under listing A would submit against
  // listing B's vendor_id, creating phantom customers or re-
  // parenting rows. Clearing rows/recurringRules also closes the
  // refresh-in-flight window where row-level action buttons would
  // still operate on A's data while vendorId has already flipped
  // to B.
  useEffect(() => {
    setEditing(null);
    setSendTarget(null);
    setRecurringTarget(null);
    setExpandedId(null);
    setRows([]);
    setRecurringRules([]);
    setLoading(true);
  }, [vendorId]);

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
    const name = form.name.trim() || null;
    const phone = form.phone.trim() || null;
    const notes = form.notes.trim() || null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { error } =
      editing === "new"
        ? // New row: include vendor_id so RLS lets us insert.
          await db
            .from("vendor_customers")
            .upsert(
              { vendor_id: vendorId, email, name, phone, notes },
              { onConflict: "vendor_id,email" },
            )
        : // Edit existing row: never overwrite vendor_id (would
          // silently re-parent the customer if the listing picker
          // changed while the dialog was open) or email (the
          // unique key).
          await db
            .from("vendor_customers")
            .update({ name, phone, notes })
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
                      onClick={() => downloadStatement(c)}
                      disabled={statementId === c.id || custInvoices.length === 0}
                      className="rounded-full"
                      title="Download a statement PDF of this customer's full invoice history"
                    >
                      {statementId === c.id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5 mr-1" />
                      )}
                      Statement
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

// ---- Expenses ---------------------------------------------------
//
// Manual bookkeeping ledger so Reports can compute Net Profit =
// Revenue − Refunds − Stripe fees − Expenses. No automation; the
// vendor types each entry. CRUD only, RLS-gated to vendor admins.

interface Expense {
  id: string;
  vendor_id: string;
  occurred_on: string;
  amount_cents: number;
  currency: string;
  category: ExpenseCategory;
  description: string;
  paid_to: string | null;
  notes: string | null;
  contractor_id?: string | null;
  created_at: string;
}

interface Contractor {
  id: string;
  vendor_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  tax_id_last4: string | null;
  notes: string | null;
  created_at: string;
}

type ExpenseCategory =
  | "rentals"
  | "supplies"
  | "labor"
  | "mileage"
  | "marketing"
  | "software"
  | "fees"
  | "meals"
  | "travel"
  | "insurance"
  | "other";

const EXPENSE_CATEGORIES: Array<{ id: ExpenseCategory; label: string }> = [
  { id: "rentals", label: "Rentals" },
  { id: "supplies", label: "Supplies" },
  { id: "labor", label: "Labor" },
  { id: "mileage", label: "Mileage / gas" },
  { id: "marketing", label: "Marketing" },
  { id: "software", label: "Software / subscriptions" },
  { id: "fees", label: "Fees / licenses" },
  { id: "meals", label: "Meals" },
  { id: "travel", label: "Travel" },
  { id: "insurance", label: "Insurance" },
  { id: "other", label: "Other" },
];

function expenseCategoryLabel(c: ExpenseCategory): string {
  return EXPENSE_CATEGORIES.find((e) => e.id === c)?.label ?? c;
}

function ExpensesTab({ vendorId }: { vendorId: string | null }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Expense[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [editingContractor, setEditingContractor] = useState<Contractor | "new" | null>(null);
  const [form, setForm] = useState<{
    occurred_on: string;
    amount: string;
    category: ExpenseCategory;
    description: string;
    paid_to: string;
    notes: string;
    contractor_id: string;
  }>({
    occurred_on: new Date().toISOString().slice(0, 10),
    amount: "",
    category: "supplies",
    description: "",
    paid_to: "",
    notes: "",
    contractor_id: "",
  });
  const [contractorForm, setContractorForm] = useState<{
    name: string;
    email: string;
    phone: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    tax_id_last4: string;
    notes: string;
  }>({
    name: "",
    email: "",
    phone: "",
    address_line1: "",
    city: "",
    state: "",
    postal_code: "",
    tax_id_last4: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [savingContractor, setSavingContractor] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingContractorId, setDeletingContractorId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vendorId) {
      setRows([]);
      setContractors([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [{ data: expData, error: expErr }, { data: cData, error: cErr }] = await Promise.all([
      db
        .from("vendor_expenses")
        .select("id, vendor_id, occurred_on, amount_cents, currency, category, description, paid_to, notes, contractor_id, created_at")
        .eq("vendor_id", vendorId)
        .order("occurred_on", { ascending: false })
        .limit(500),
      db
        .from("vendor_contractors")
        .select("id, vendor_id, name, email, phone, address_line1, address_line2, city, state, postal_code, tax_id_last4, notes, created_at")
        .eq("vendor_id", vendorId)
        .order("name", { ascending: true })
        .limit(500),
    ]);
    if (expErr) {
      console.error("[ExpensesTab] expense fetch failed", expErr);
      toast.error("Couldn't load expenses.");
    } else {
      setRows((expData ?? []) as Expense[]);
    }
    if (cErr) {
      console.error("[ExpensesTab] contractor fetch failed", cErr);
    } else {
      setContractors((cData ?? []) as Contractor[]);
    }
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startNew = () => {
    setForm({
      occurred_on: new Date().toISOString().slice(0, 10),
      amount: "",
      category: "supplies",
      description: "",
      paid_to: "",
      notes: "",
      contractor_id: "",
    });
    setEditing("new");
  };

  const startEdit = (e: Expense) => {
    setForm({
      occurred_on: e.occurred_on,
      amount: (e.amount_cents / 100).toFixed(2),
      category: e.category,
      description: e.description,
      paid_to: e.paid_to ?? "",
      notes: e.notes ?? "",
      contractor_id: e.contractor_id ?? "",
    });
    setEditing(e);
  };

  const save = async () => {
    if (!vendorId || !user) return;
    const amountNum = Number(form.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Amount must be a positive number.");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Description required.");
      return;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const payload = {
      vendor_id: vendorId,
      occurred_on: form.occurred_on,
      amount_cents: Math.round(amountNum * 100),
      currency: "usd",
      category: form.category,
      description: form.description.trim(),
      paid_to: form.paid_to.trim() || null,
      notes: form.notes.trim() || null,
      // Only attach a contractor when one is selected AND the
      // category is labor — picking a contractor on a "supplies"
      // expense would muddy the 1099 totals.
      contractor_id:
        form.contractor_id && form.category === "labor"
          ? form.contractor_id
          : null,
      created_by: user.id,
    };
    let error;
    if (editing === "new") {
      ({ error } = await db.from("vendor_expenses").insert(payload));
    } else if (editing) {
      // omit created_by on update — it stays the original creator
      const { created_by: _, ...updatePayload } = payload;
      ({ error } = await db
        .from("vendor_expenses")
        .update(updatePayload)
        .eq("id", editing.id));
    }
    setSaving(false);
    if (error) {
      console.error("[ExpensesTab] save failed", error);
      toast.error("Couldn't save expense.");
      return;
    }
    toast.success(editing === "new" ? "Expense added." : "Expense updated.");
    setEditing(null);
    void refresh();
  };

  const remove = async (e: Expense) => {
    if (!confirm(`Delete this expense (${formatMoney(e.amount_cents, e.currency)} — ${e.description})?`)) return;
    setDeletingId(e.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { error } = await db.from("vendor_expenses").delete().eq("id", e.id);
    setDeletingId(null);
    if (error) {
      console.error("[ExpensesTab] delete failed", error);
      toast.error("Couldn't delete expense.");
      return;
    }
    toast.success("Expense deleted.");
    void refresh();
  };

  // ---- Contractor handlers --------------------------------------
  const startNewContractor = () => {
    setContractorForm({
      name: "",
      email: "",
      phone: "",
      address_line1: "",
      city: "",
      state: "",
      postal_code: "",
      tax_id_last4: "",
      notes: "",
    });
    setEditingContractor("new");
  };
  const startEditContractor = (c: Contractor) => {
    setContractorForm({
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      address_line1: c.address_line1 ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      postal_code: c.postal_code ?? "",
      tax_id_last4: c.tax_id_last4 ?? "",
      notes: c.notes ?? "",
    });
    setEditingContractor(c);
  };
  const saveContractor = async () => {
    if (!vendorId || !user) return;
    if (!contractorForm.name.trim()) {
      toast.error("Contractor name required.");
      return;
    }
    if (contractorForm.tax_id_last4 && !/^[0-9]{4}$/.test(contractorForm.tax_id_last4)) {
      toast.error("Tax ID must be exactly the last 4 digits.");
      return;
    }
    setSavingContractor(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const payload = {
      vendor_id: vendorId,
      name: contractorForm.name.trim(),
      email: contractorForm.email.trim() || null,
      phone: contractorForm.phone.trim() || null,
      address_line1: contractorForm.address_line1.trim() || null,
      city: contractorForm.city.trim() || null,
      state: contractorForm.state.trim().toUpperCase() || null,
      postal_code: contractorForm.postal_code.trim() || null,
      tax_id_last4: contractorForm.tax_id_last4.trim() || null,
      notes: contractorForm.notes.trim() || null,
      created_by: user.id,
    };
    let error;
    if (editingContractor === "new") {
      ({ error } = await db.from("vendor_contractors").insert(payload));
    } else if (editingContractor) {
      const { created_by: _, ...updatePayload } = payload;
      ({ error } = await db
        .from("vendor_contractors")
        .update(updatePayload)
        .eq("id", editingContractor.id));
    }
    setSavingContractor(false);
    if (error) {
      console.error("[ExpensesTab] contractor save failed", error);
      toast.error("Couldn't save contractor.");
      return;
    }
    toast.success(editingContractor === "new" ? "Contractor added." : "Contractor updated.");
    setEditingContractor(null);
    void refresh();
  };
  const removeContractor = async (c: Contractor) => {
    if (!confirm(`Delete ${c.name}? Their past expenses stay in the ledger but lose the link.`)) return;
    setDeletingContractorId(c.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { error } = await db.from("vendor_contractors").delete().eq("id", c.id);
    setDeletingContractorId(null);
    if (error) {
      console.error("[ExpensesTab] contractor delete failed", error);
      toast.error("Couldn't delete contractor.");
      return;
    }
    toast.success("Contractor removed.");
    void refresh();
  };

  // Per-contractor YTD totals for the 1099-prep view. Only counts
  // current calendar year — that's the IRS reporting period. $600
  // threshold matches the 1099-NEC filing rule.
  //
  // Year comparison parses 'YYYY-MM-DD' as a literal year string
  // rather than going through `new Date(...).getFullYear()` —
  // Postgres date columns come back as bare YYYY-MM-DD which JS
  // parses as UTC midnight, then getFullYear() converts to LOCAL
  // year. For vendors west of UTC, a Jan 1 expense logged late on
  // Dec 31 would otherwise fall into the prior YTD bucket.
  const contractorTotals = useMemo(() => {
    const year = String(new Date().getFullYear());
    const totals = new Map<string, number>();
    for (const r of rows) {
      if (!r.contractor_id) continue;
      if (r.occurred_on.slice(0, 4) !== year) continue;
      totals.set(r.contractor_id, (totals.get(r.contractor_id) ?? 0) + r.amount_cents);
    }
    return totals;
  }, [rows]);

  // YTD summary across categories — small at-a-glance block above
  // the row list so the vendor sees their total spend without going
  // to Reports.
  const ytd = useMemo(() => {
    // Same string-prefix parse as contractorTotals — see comment
    // there. Don't go through Date(...).getFullYear(): the UTC/local
    // mix shifts year-boundary expenses into the wrong bucket.
    const year = String(new Date().getFullYear());
    const total = rows
      .filter((r) => r.occurred_on.slice(0, 4) === year)
      .reduce((s, r) => s + r.amount_cents, 0);
    const byCategory = new Map<ExpenseCategory, number>();
    for (const r of rows) {
      if (r.occurred_on.slice(0, 4) !== year) continue;
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount_cents);
    }
    const top = Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return { total, top };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Expenses</h2>
          <p className="text-xs text-muted-foreground">
            Manual ledger of business costs. Feeds into Net Profit on the Reports tab.
          </p>
        </div>
        <Button onClick={startNew} size="sm" className="rounded-full" disabled={!vendorId}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          New expense
        </Button>
      </div>

      {rows.length > 0 && (
        <Card>
          <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                Year-to-date spend
              </div>
              <div className="mt-1 text-2xl font-editorial tabular-nums">{formatMoney(ytd.total)}</div>
            </div>
            {ytd.top.length > 0 && (
              <div className="flex gap-4 flex-wrap text-xs">
                {ytd.top.map(([cat, cents]) => (
                  <div key={cat}>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {expenseCategoryLabel(cat)}
                    </div>
                    <div className="tabular-nums">{formatMoney(cents)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {editing && (
        <Card>
          <div className="p-5 space-y-3">
            <h3 className="text-sm font-semibold">
              {editing === "new" ? "New expense" : "Edit expense"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="date"
                value={form.occurred_on}
                onChange={(e) => setForm({ ...form, occurred_on: e.target.value })}
                className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount (required)"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Paid to (optional — Home Depot, U-Haul…)"
                value={form.paid_to}
                onChange={(e) => setForm({ ...form, paid_to: e.target.value })}
                className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
            </div>
            {form.category === "labor" && contractors.length > 0 && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                  Contractor (for 1099 tracking)
                </label>
                <select
                  value={form.contractor_id}
                  onChange={(e) => setForm({ ...form, contractor_id: e.target.value })}
                  className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                >
                  <option value="">— Not tied to a tracked contractor —</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <input
              type="text"
              placeholder="Description (required)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
            />
            <textarea
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none resize-none"
            />
            <div className="flex gap-2">
              <Button onClick={() => void save()} disabled={saving} size="sm" className="rounded-full">
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                {editing === "new" ? "Add expense" : "Save"}
              </Button>
              <Button onClick={() => setEditing(null)} variant="ghost" size="sm" className="rounded-full">
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Contractors — the 1099-tracking ledger. Lives next to the
          expense list since labor expenses get tied to these. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Contractors</h3>
            <p className="text-xs text-muted-foreground">
              Anyone you pay $600+ in a calendar year needs a 1099-NEC. Track them here.
            </p>
          </div>
          <Button onClick={startNewContractor} variant="outline" size="sm" className="rounded-full" disabled={!vendorId}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            New contractor
          </Button>
        </div>

        {editingContractor && (
          <Card>
            <div className="p-5 space-y-3">
              <h4 className="text-sm font-semibold">
                {editingContractor === "new" ? "New contractor" : `Edit ${editingContractor.name}`}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Name (required)"
                  value={contractorForm.name}
                  onChange={(e) => setContractorForm({ ...contractorForm, name: e.target.value })}
                  className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={contractorForm.email}
                  onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })}
                  className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={contractorForm.phone}
                  onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })}
                  className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
                <input
                  type="text"
                  placeholder="Tax ID — LAST 4 ONLY (optional)"
                  value={contractorForm.tax_id_last4}
                  onChange={(e) => setContractorForm({ ...contractorForm, tax_id_last4: e.target.value })}
                  maxLength={4}
                  className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
                <input
                  type="text"
                  placeholder="Street address (optional)"
                  value={contractorForm.address_line1}
                  onChange={(e) => setContractorForm({ ...contractorForm, address_line1: e.target.value })}
                  className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none md:col-span-2"
                />
                <input
                  type="text"
                  placeholder="City"
                  value={contractorForm.city}
                  onChange={(e) => setContractorForm({ ...contractorForm, city: e.target.value })}
                  className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="State"
                    value={contractorForm.state}
                    onChange={(e) => setContractorForm({ ...contractorForm, state: e.target.value })}
                    maxLength={2}
                    className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none uppercase"
                  />
                  <input
                    type="text"
                    placeholder="ZIP"
                    value={contractorForm.postal_code}
                    onChange={(e) => setContractorForm({ ...contractorForm, postal_code: e.target.value })}
                    className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                  />
                </div>
              </div>
              <textarea
                placeholder="Notes (optional)"
                value={contractorForm.notes}
                onChange={(e) => setContractorForm({ ...contractorForm, notes: e.target.value })}
                rows={2}
                className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                We only store the last 4 digits of the tax ID — the full SSN/EIN belongs in your payroll provider, not here.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => void saveContractor()} disabled={savingContractor} size="sm" className="rounded-full">
                  {savingContractor ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                  {editingContractor === "new" ? "Add contractor" : "Save"}
                </Button>
                <Button onClick={() => setEditingContractor(null)} variant="ghost" size="sm" className="rounded-full">
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}

        {contractors.length === 0 ? (
          <EmptyCard>
            No contractors yet. Add helpers, freelancers, or anyone you'll need to issue a 1099 to at year-end.
          </EmptyCard>
        ) : (
          <Card>
            {contractors.map((c, idx) => {
              const ytdCents = contractorTotals.get(c.id) ?? 0;
              const needs1099 = ytdCents >= 60000; // $600 in cents
              return (
                <div
                  key={c.id}
                  className={`p-4 ${idx > 0 ? "border-t border-foreground/5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{c.name}</p>
                        {needs1099 && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800">
                            1099 needed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[c.email, c.phone, c.city && c.state ? `${c.city}, ${c.state}` : null]
                          .filter(Boolean)
                          .join(" · ") || "No contact info"}
                        {c.tax_id_last4 ? ` · TIN ••••${c.tax_id_last4}` : ""}
                      </p>
                      {c.notes && (
                        <p className="text-xs text-muted-foreground mt-1 max-w-xl">{c.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          YTD paid
                        </div>
                        <div className="text-base font-editorial tabular-nums">
                          {formatMoney(ytdCents)}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditContractor(c)}
                        className="rounded-full"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void removeContractor(c)}
                        disabled={deletingContractorId === c.id}
                        className="rounded-full text-muted-foreground hover:text-destructive"
                      >
                        {deletingContractorId === c.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {loading ? (
        <EmptyCard>
          <Loader2 className="w-4 h-4 mr-2 inline animate-spin" />
          Loading…
        </EmptyCard>
      ) : rows.length === 0 ? (
        <EmptyCard>
          No expenses yet. Track rentals, supplies, gas, and any other business costs here so Net Profit
          on the Reports tab subtracts them from revenue.
        </EmptyCard>
      ) : (
        <Card>
          {rows.map((e, idx) => (
            <div
              key={e.id}
              className={`p-4 ${idx > 0 ? "border-t border-foreground/5" : ""}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-foreground/[0.06] text-foreground/70">
                      {expenseCategoryLabel(e.category)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(e.occurred_on)}
                    </span>
                    {e.paid_to && (
                      <span className="text-xs text-muted-foreground">· {e.paid_to}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium mt-1">{e.description}</p>
                  {e.notes && (
                    <p className="text-xs text-muted-foreground mt-1 max-w-xl">{e.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-lg font-editorial tabular-nums">
                    {formatMoney(e.amount_cents, e.currency)}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(e)}
                    className="rounded-full"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void remove(e)}
                    disabled={deletingId === e.id}
                    className="rounded-full text-muted-foreground hover:text-destructive"
                  >
                    {deletingId === e.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
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
    const nextRunDate = new Date(`${nextRun}T09:00:00Z`);
    if (!Number.isFinite(nextRunDate.getTime())) {
      setSubmitting(false);
      toast.error("Pick a valid next-run date");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    let error: { message?: string } | null = null;
    if (existing) {
      // On EDIT: DON'T touch day_of_month. The vendor's original
      // anchor (set on the first INSERT) is the authoritative
      // intent. Recomputing from the picker would silently lock in
      // any drift that's already happened to next_run_at (Jan 31
      // -> Feb 28 -> setting day_of_month=28 forever).
      ({ error } = await db
        .from("vendor_recurring_invoices")
        .update({
          interval,
          next_run_at: nextRunDate.toISOString(),
          line_items: parsedItems,
          notes: notes.trim() || null,
          tax_pct: parseFloat(taxPct || "0") || 0,
          active,
        })
        .eq("id", existing.id));
    } else {
      // On CREATE: for month-based cadences, snapshot the picker's
      // calendar day as day_of_month so advance() can re-anchor
      // instead of drifting after the first month-overflow.
      const dayOfMonth =
        interval === "monthly" || interval === "quarterly" || interval === "yearly"
          ? nextRunDate.getUTCDate()
          : null;
      ({ error } = await db.from("vendor_recurring_invoices").insert({
        vendor_id: vendorId,
        customer_id: customer.id,
        interval,
        day_of_month: dayOfMonth,
        next_run_at: nextRunDate.toISOString(),
        line_items: parsedItems,
        notes: notes.trim() || null,
        tax_pct: parseFloat(taxPct || "0") || 0,
        active,
      }));
    }
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
    // Normalize the buyer's email so the customer directory and
    // the invoice row use the same casing — otherwise joins by
    // bill_to_email (e.g. CustomersTab's per-customer invoice
    // list) silently miss the just-sent invoice when the vendor
    // typed caps.
    const normalizedEmail = billToEmail.trim().toLowerCase();
    const trimmedName = billToName.trim();
    // Upsert the customer record so the vendor's directory stays
    // in sync even when they send to a new email from this dialog.
    // Only include `name` when the form has one — an empty name
    // shouldn't overwrite an existing saved name.
    const customerPayload: Record<string, unknown> = {
      vendor_id: vendorId,
      email: normalizedEmail,
    };
    if (trimmedName) customerPayload.name = trimmedName;
    // Surface upsert failures rather than discarding them — if the
    // customer-directory write fails (RLS edge case, unique race,
    // network) and we silently proceed, the invoice is created with
    // a normalized email that won't join to any customer row, so
    // the CustomersTab per-customer invoice list misses it (exactly
    // the symptom the lowercase normalization was added to prevent).
    const { error: custErr } = await db
      .from("vendor_customers")
      .upsert(customerPayload, { onConflict: "vendor_id,email" });
    if (custErr) {
      setSubmitting(false);
      toast.error("Couldn't save customer", { description: custErr.message });
      return;
    }
    // Insert the invoice — invoice_number is filled in by a DB
    // trigger when status flips to 'sent'.
    const { data: newRow, error } = await db
      .from("invoices")
      .insert({
        vendor_id: vendorId,
        bill_to_name: trimmedName || null,
        bill_to_email: normalizedEmail || null,
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
      // Roll the invoice back to a true draft so the toast doesn't
      // lie: the DB-side trigger already burned an INV-#### number
      // and stamped status='sent'/sent_at=now on the insert, so we
      // need to undo that. Error-check the rollback — if it fails
      // (RLS edge, network), surface the discrepancy so the user
      // doesn't trust the "Saved as draft" message and assume they
      // can resend later from the list.
      const { error: rollbackErr } = await db
        .from("invoices")
        .update({ status: "draft", sent_at: null })
        .eq("id", newRow.id);
      if (rollbackErr) {
        toast.error("Email failed and rollback failed", {
          description: `${sendErr.message} (Invoice may be stuck as Sent — refresh and verify before resending.)`,
        });
      } else {
        toast.warning("Saved as draft — email failed", { description: sendErr.message });
      }
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
    async (link: PaymentLink) => {
      // Destructive: scheduled balance links cancel forever when the
      // parent goes cancelled/refunded (see scan-vendorapay-payment-
      // schedules), so killing a deposit link kills the balance side
      // too. Always confirm.
      const title = link.title?.trim() || "this link";
      if (!confirm(`Cancel "${title}"? This can't be undone.`)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("payment_links")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", link.id);
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
                    onClick={() => cancel(l)}
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
                    onClick={() => cancel(l)}
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

function SettingsTab({
  status,
  vendorId,
  tier,
  tierLoading,
}: {
  status: Status | null;
  vendorId: string | null;
  tier: VendorTier;
  tierLoading: boolean;
}) {
  const fee = TIER_FEE_COPY[tier];
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
    <div className="space-y-6">
      {/* Connection — verification + bank state pulled in from the
          old Integrations tab. The two block cards (bank account,
          identity/tax) replace the previous standalone tab; the
          "Coming soon" placeholders that lived there were dropped
          as informational fluff. */}
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
          Connection
        </h2>
        <div className="space-y-3">
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

          <Card>
            <div className="p-5 flex items-start gap-4 flex-wrap">
              <div className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center bg-violet-50 text-violet-700">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">Identity &amp; tax info</h3>
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
        </div>
      </section>

      <section>
        <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
          Account
        </h2>
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
      </section>
    </div>
  );
}

// ---- Primitives --------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  // data-cockpit-card lets the .my-vendora-cockpit stylesheet
  // override these warm inline colors with the dense Xero/Oracle
  // palette without touching every Card call site. Outside the
  // cockpit (e.g. host pages), the original warm look is preserved.
  return (
    <div
      data-cockpit-card
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,253,250,0.85)",
        border: "1px solid rgba(255,138,76,0.18)",
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

function StatCard({ label, sub, value, trend }: {
  label: string;
  sub: string;
  value: string;
  /** Optional trend chip rendered next to the value — usually a
   *  <TrendDelta currentCents=... previousCents=... /> showing
   *  +/-N% vs the prior equivalent window. */
  trend?: React.ReactNode;
}) {
  // .cockpit-stat picks up the dense Xero KPI styling when the
  // ancestor has .my-vendora-cockpit. Outside that scope, the
  // utility classes here keep the warm look (rounded-2xl, beige bg).
  return (
    <div
      className="cockpit-stat rounded-2xl p-5 transition-shadow hover:shadow-[0_10px_30px_-12px_rgba(26,20,16,0.18)]"
      style={{
        background: "rgba(255,253,250,0.85)",
        border: "1px solid rgba(255,138,76,0.18)",
      }}
    >
      <div className="cockpit-stat-label text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-2">
        <div className="cockpit-stat-value text-[28px] leading-none font-editorial tracking-tight">{value}</div>
        {trend}
      </div>
      <div className="cockpit-stat-sub text-[11px] text-muted-foreground mt-2 pt-2 border-t border-foreground/[0.05]">{sub}</div>
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
