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
import { handleEmailBillingError } from "@/lib/credits";
import { Switch } from "@/components/ui/switch";
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
  Info,
  Landmark,
  Link2,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { vendorNavItems } from "@/data/navItems";
import { type ListingOpt } from "@/components/vendor/ListingPicker";
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
  /**
   * The listing whose connected Stripe account this transaction
   * came from. Populated client-side when account-mode fans out
   * the vendorapay-transactions call across N listings so a
   * refund action knows which connected account to post against.
   * Absent when the transactions came from a single per-listing
   * call (the original code path).
   */
  vendor_id?: string;
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
  { id: "customers", label: "Contacts", icon: Users },
  // Settings now also hosts the Stripe Connect / bank / identity
  // surfaces that lived under a separate "Integrations" tab.
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

// Sub-tabs inside the Payments tab.
type PaymentsTabId = "incoming" | "expenses";

const PAYMENTS_TABS: Array<{ id: PaymentsTabId; label: string; icon: typeof Wallet }> = [
  { id: "incoming", label: "Income", icon: CreditCard },
  { id: "expenses", label: "Expenses", icon: Wallet },
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
  host_email: string | null;
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
  const vendorId = selectedListingId;
  // Account-wide vendor_profile id list — every Supabase-only surface
  // in the cockpit (Overview KPIs, Customers, recent paid invoices)
  // queries .in("vendor_id", accountVendorIds) so the cockpit reads
  // as one business view across all of the user's listings. Stripe-
  // anchored surfaces (Payments tab balance/transactions) stay scoped
  // to the single selectedListingId since each listing has its own
  // connected account. Memoized so its reference is stable across
  // re-renders (downstream useEffects depend on it).
  const accountVendorIds = useMemo(
    () => listings.map((l) => l.id),
    [listings],
  );

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

  // Jump straight to the Payments tab's Expenses sub-surface — the
  // Operating expenses card on the Overview links here so a vendor
  // can drill into the full ledger.
  const goToExpenses = () => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "transactions");
    params.set("sub", "expenses");
    setSearchParams(params, { replace: true });
  };

  // Recent activity card on the Overview links here so a vendor can
  // see the full payments ledger.
  const goToPayments = () => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "transactions");
    params.set("sub", "incoming");
    setSearchParams(params, { replace: true });
  };

  // Upcoming appointments card on the Overview links here so a vendor
  // can open the full calendar / appointments surface.
  const goToCalendar = () => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "calendar");
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

  // Guards against setState after unmount. refresh() can be in-flight
  // (a Promise.all of edge-fn invokes + Supabase reads) when the user
  // navigates away or a realtime event fires post-unmount; without
  // this, those late resolutions write to a dead component. Mirrors
  // the per-fetch `cancelled` flag ReportsTab/ExpensesTab already use.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (silent = false) => {
      if (!vendorId || accountVendorIds.length === 0) {
        // No listing yet — flip loading off so the empty state shows
        // instead of an infinite spinner. (Vendor without a listing
        // can't use VendoraPay; render the "set up your profile" prompt.)
        setLoading(false);
        return;
      }
      if (!silent) setRefreshing(true);
      try {
        // Fan out the per-listing Stripe transactions call over every
        // listing on the account. We used to first query
        // vendor_payment_secrets client-side to skip non-connected
        // listings, but that table is RLS-locked to service-role
        // (no vendor-readable policy), so the query always returned
        // empty — which meant the transactions call was NEVER made and
        // the Incoming tab showed nothing for every vendor. The edge
        // function itself safely returns an empty list for a listing
        // without a connected account, so fanning out over
        // accountVendorIds is correct; at typical 1–3 listings the
        // extra round-trips are negligible.
        const stripeConnectedIds = accountVendorIds;

        const [statusRes, balanceRes, txResultsRaw, payoutRes, linksRes, invoicesRes] = await Promise.all([
          // Status / balance / payouts schedule are still scoped to
          // the primary connected listing — combining a "weekly"
          // payout schedule on listing A with a "daily" on listing
          // B is a UX decision, not a merge, and gets its own pass.
          supabase.functions.invoke("vendorapay-status", { body: { business_id: vendorId } }),
          supabase.functions.invoke("vendorapay-balance", { body: { business_id: vendorId } }),
          // Transactions fan out across every connected listing.
          // Each transaction is tagged with its source vendor_id so
          // refunds (TransactionsTab → RefundDialog) post against
          // the correct connected account.
          stripeConnectedIds.length > 0
            ? Promise.all(
                stripeConnectedIds.map((id) =>
                  supabase.functions
                    .invoke("vendorapay-transactions", { body: { business_id: id, limit: 50 } })
                    .then((res) => ({ id, res })),
                ),
              )
            : Promise.resolve([]),
          supabase.functions.invoke("vendorapay-payouts", { body: { business_id: vendorId } }),
          // Supabase tables fan out across every listing the user
          // owns — Files / Customers / Reports all read these and
          // expect account-wide data after the per-account migration.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("payment_links")
            .select("id, vendor_id, slug, title, description, amount_cents, currency, status, paid_at, expires_at, activate_at, parent_link_id, created_at")
            .in("vendor_id", accountVendorIds)
            .order("created_at", { ascending: false })
            .limit(200),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("invoices")
            .select("id, vendor_id, slug, invoice_number, bill_to_name, bill_to_email, issue_date, due_date, notes, line_items, subtotal_cents, tax_rate_bps, tax_cents, total_cents, currency, status, sent_at, paid_at, refunded_at, refunded_amount_cents, reminder_sent_at, late_fee_cents, late_fee_added_at, payment_failure_message, payment_failed_at, payment_attempts, created_at")
            .in("vendor_id", accountVendorIds)
            .order("created_at", { ascending: false })
            .limit(200),
        ]);
        // Bail if the component unmounted while the batch was in
        // flight — don't write state to a dead component.
        if (!mountedRef.current) return;
        if (statusRes.data) setStatus(statusRes.data as Status);
        if (balanceRes.data) setBalance(balanceRes.data as Balance);
        // Merge transactions from every connected listing, tag each
        // with its source vendor_id (refund flow uses it), then sort
        // newest-first and cap at 50 — same length the single-account
        // call used to return.
        const txResults = txResultsRaw as Array<{ id: string; res: { data?: { transactions?: Transaction[] } | null } }>;
        const mergedTx: Transaction[] = [];
        for (const { id, res } of txResults) {
          const list = (res?.data?.transactions ?? []) as Transaction[];
          for (const t of list) mergedTx.push({ ...t, vendor_id: id });
        }
        mergedTx.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        setTransactions(mergedTx.slice(0, 50));
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
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // accountKey is the join of accountVendorIds — refetches when the
    // account's listing set changes. vendorId still drives the Stripe
    // fan-out (per connected account).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendorId, accountVendorIds.join(",")],
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
          {/* The top-of-page listing picker has been removed pending a
              new selection UI. selectedListingId is still set (auto-
              picks the first approved listing) so every downstream
              query stays scoped correctly until the new picker lands. */}

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
              accountVendorIds={accountVendorIds}
              onViewExpenses={goToExpenses}
              onViewActivity={goToPayments}
              onViewCalendar={goToCalendar}
            />
          ) : tab === "calendar" ? (
            <Suspense fallback={<TabSkeleton />}>
              <VendorAppointmentsPageLazy embedded accountVendorIds={accountVendorIds} />
            </Suspense>
          ) : tab === "transactions" ? (
            <PaymentsTab
              transactions={transactions}
              payouts={payouts}
              status={status}
              accountVendorIds={accountVendorIds}
              listings={listings}
              onRefunded={() => refresh(false)}
            />
          ) : tab === "files" ? (
            <FilesTab
              accountVendorIds={accountVendorIds}
              listings={listings}
              invoices={invoices}
              paymentLinks={paymentLinks}
              status={status}
              onChanged={() => refresh(true)}
            />
          ) : tab === "customers" ? (
            <CustomersTab
              accountVendorIds={accountVendorIds}
              listings={listings}
              onChanged={() => refresh(true)}
            />
          ) : (
            <SettingsTab status={status} accountVendorIds={accountVendorIds} listings={listings} tier={tier} tierLoading={tierLoading} />
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
  accountVendorIds,
  onViewExpenses,
  onViewActivity,
  onViewCalendar,
}: {
  balance: Balance | null;
  // Every listing the current user owns; every Supabase query on
  // this tab aggregates across this whole list so the Overview
  // reads as a single account-level dashboard. Stripe data is no
  // longer rendered here (Recent activity now pulls paid invoices
  // from Supabase across the whole account).
  accountVendorIds: string[];
  // Click handler for "View all →" on the Operating expenses card —
  // navigates to the Payments tab's Expenses sub-surface.
  onViewExpenses: () => void;
  // Click handler for "View all →" on the Recent activity card —
  // navigates to the Payments tab's incoming-payments ledger.
  onViewActivity: () => void;
  // Click handler for "View all →" on the Upcoming appointments card —
  // navigates to the Calendar tab.
  onViewCalendar: () => void;
}) {
  const currency = balance?.currency ?? "usd";

  // KPI snapshots used by the Overview: Revenue 30d (with prior 30d
  // for trend), Customers total (with last-30d-new for the sub line),
  // plus MRR (broken down by recurring interval), the Leads pipeline
  // (new vs active vs won vs lost in the last 30d) and a 30-bucket
  // daily revenue series for the wave chart.
  const [leads, setLeads] = useState<{ new: number; active: number; won: number; lost: number; total: number }>({ new: 0, active: 0, won: 0, lost: 0, total: 0 });
  const [expenses, setExpenses] = useState<{ total: number; count: number; categoryCount: number; topCategories: Array<{ label: string; cents: number }> }>({ total: 0, count: 0, categoryCount: 0, topCategories: [] });
  const [revenue30d, setRevenue30d] = useState<number>(0);
  const [revenue30dPrev, setRevenue30dPrev] = useState<number>(0);
  // Daily revenue series for the last 30 days — drives the line chart.
  const [revenueSeries, setRevenueSeries] = useState<number[]>([]);
  // Recent paid invoices across the whole account (replaces the
  // single-listing Stripe transactions table that used to live here).
  const [recentInvoices, setRecentInvoices] = useState<Array<{ id: string; invoice_number: string; total_cents: number; paid_at: string; currency: string; bill_to_name: string | null }>>([]);
  // Upcoming appointments across the whole account — confirmed and
  // proposed meetings scheduled from now on, soonest first.
  const [upcomingAppts, setUpcomingAppts] = useState<Array<{ id: string; kind: string; title: string | null; location: string | null; scheduled_at: string; status: string; host_name: string | null }>>([]);

  // Stable string key for the useEffect dep so we don't refire on
  // every render just because listings is re-derived.
  const accountKey = accountVendorIds.join(",");

  useEffect(() => {
    if (accountVendorIds.length === 0) {
      setLeads({ new: 0, active: 0, won: 0, lost: 0, total: 0 });
      setExpenses({ total: 0, count: 0, categoryCount: 0, topCategories: [] });
      setRevenue30d(0);
      setRevenue30dPrev(0);
      setRevenueSeries([]);
      setRecentInvoices([]);
      setUpcomingAppts([]);
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
        { data: leadRows },
        { data: expenseRows },
        { data: paid30 },
        { data: paid60 },
        { data: recentPaid },
        { data: upcomingApptRows },
      ] = await Promise.all([
        // Inbound inquiries in the last 30 days — drive the Leads card.
        // vendor_id + host_id come back too so we can collapse a host's
        // messages into a single lead, matching the Inquiries page.
        db
          .from("inquiries")
          .select("vendor_id, host_id, status")
          .in("vendor_id", accountVendorIds)
          .gte("created_at", since30.toISOString())
          .limit(10000),
        // Operating expenses in the last 30 days — drive the OPEX card.
        db
          .from("vendor_expenses")
          .select("amount_cents, item_name, description")
          .in("vendor_id", accountVendorIds)
          .gte("occurred_on", since30.toISOString().slice(0, 10))
          .limit(10000),
        // Paid invoices in the last 30 days (current period)
        db
          .from("invoices")
          .select("total_cents, paid_at")
          .in("vendor_id", accountVendorIds)
          .eq("status", "paid")
          .gte("paid_at", since30.toISOString())
          .lt("paid_at", now.toISOString())
          .limit(10000),
        // Paid invoices in the 30 days before that (previous period)
        db
          .from("invoices")
          .select("total_cents")
          .in("vendor_id", accountVendorIds)
          .eq("status", "paid")
          .gte("paid_at", since60.toISOString())
          .lt("paid_at", since30.toISOString())
          .limit(10000),
        // Recent paid invoices across the whole account — replaces
        // the Stripe transactions feed for the Recent activity table.
        db
          .from("invoices")
          .select("id, invoice_number, total_cents, paid_at, currency, bill_to_name")
          .in("vendor_id", accountVendorIds)
          .eq("status", "paid")
          .order("paid_at", { ascending: false })
          .limit(5),
        // Upcoming appointments — confirmed (accepted) or still-proposed
        // meetings scheduled from now on, soonest first. Mirrors the
        // calendar's "upcoming" filter so the Overview agrees with it.
        db
          .from("appointments")
          .select(
            "id, kind, title, location, scheduled_at, status, host:profiles!appointments_host_id_fkey(display_name)",
          )
          .in("vendor_id", accountVendorIds)
          .in("status", ["accepted", "proposed"])
          .gte("scheduled_at", now.toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(5),
      ]);
      if (cancelled) return;

      // Leads pipeline — count per LEAD, not per message, so these
      // numbers stay in lockstep with the Inquiries page. A "lead" is
      // one host on one listing (vendor_id + host_id); all of that
      // host's inquiries collapse into a single aggregate status using
      // the same priority the Inquiries page applies:
      //   won > active (drafted/replied) > new > lost (lost/expired/etc).
      const leadInquiries = (leadRows ?? []) as Array<{
        vendor_id: string;
        host_id: string;
        status: string;
      }>;
      const statusesByLead = new Map<string, string[]>();
      for (const r of leadInquiries) {
        const key = `${r.vendor_id}:${r.host_id}`;
        const arr = statusesByLead.get(key);
        if (arr) arr.push(r.status);
        else statusesByLead.set(key, [r.status]);
      }
      const leadCounts = { new: 0, active: 0, won: 0, lost: 0, total: statusesByLead.size };
      for (const statuses of statusesByLead.values()) {
        if (statuses.includes("won")) leadCounts.won += 1;
        else if (statuses.some((s) => s === "replied" || s === "drafted")) leadCounts.active += 1;
        else if (statuses.includes("new")) leadCounts.new += 1;
        else leadCounts.lost += 1;
      }
      setLeads(leadCounts);

      // Operating expenses — sum by item (item_name when set, else
      // description), top 3 + roll-up Other. Vendors don't pick
      // categories anymore, so the breakdown is by line-item label
      // — that's what they actually typed.
      const expRows = (expenseRows ?? []) as Array<{ amount_cents: number; item_name: string | null; description: string | null }>;
      const totalExpenses = expRows.reduce((s, r) => s + r.amount_cents, 0);
      const byItem = new Map<string, number>();
      for (const r of expRows) {
        const key = (r.item_name?.trim() || r.description?.trim() || "—");
        byItem.set(key, (byItem.get(key) ?? 0) + r.amount_cents);
      }
      const sorted = Array.from(byItem.entries())
        .map(([label, cents]) => ({ label, cents }))
        .sort((a, b) => b.cents - a.cents);
      // Roll any 4th+ items into "Other" then re-sort so the rollup
      // sits at its true rank position (it can outweigh top-3
      // individuals when many small items combine).
      const topThree = sorted.slice(0, 3);
      const restCents = sorted.slice(3).reduce((s, r) => s + r.cents, 0);
      const topCategories = (restCents > 0
        ? [...topThree, { label: "Other", cents: restCents }]
        : topThree
      ).sort((a, b) => b.cents - a.cents);
      setExpenses({
        total: totalExpenses,
        count: expRows.length,
        categoryCount: byItem.size,
        topCategories,
      });

      const paid30Rows = (paid30 ?? []) as Array<{ total_cents: number; paid_at: string }>;
      const paid60Rows = (paid60 ?? []) as Array<{ total_cents: number }>;
      setRevenue30d(paid30Rows.reduce((s, r) => s + r.total_cents, 0));
      setRevenue30dPrev(paid60Rows.reduce((s, r) => s + r.total_cents, 0));

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

      setRecentInvoices(
        (recentPaid ?? []) as Array<{
          id: string;
          invoice_number: string;
          total_cents: number;
          paid_at: string;
          currency: string;
          bill_to_name: string | null;
        }>,
      );

      setUpcomingAppts(
        ((upcomingApptRows ?? []) as Array<{
          id: string;
          kind: string;
          title: string | null;
          location: string | null;
          scheduled_at: string;
          status: string;
          host: { display_name: string | null } | null;
        }>).map((a) => ({
          id: a.id,
          kind: a.kind,
          title: a.title,
          location: a.location,
          scheduled_at: a.scheduled_at,
          status: a.status,
          host_name: a.host?.display_name ?? null,
        })),
      );
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey]);

  return (
    <>
      {/* Top row — the 30-day revenue wave on the left, recent
          activity on the right. Each takes half the width on large
          desktops; they stack full width below xl. */}
      <div className="xl:flex xl:items-start xl:gap-4 mb-4">
        <div className="xl:w-1/2 mb-4 xl:mb-0">
          <OverviewRevenueChart series={revenueSeries} currency={currency} previousTotal={revenue30dPrev} />
        </div>

        {/* Recent activity — paid invoices across the whole account.
            Capped to 6 rows so it stays a compact "what just landed"
            surface; full payment history lives in the Payments tab. */}
        <div className="xl:w-1/2">
          <div className="cockpit-data-card">
            <div className="cockpit-data-card-header">
              <div>
                <h3 className="text-sm font-semibold">Recent activity</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Latest paid invoices across every listing on the account
                </p>
              </div>
              <button
                type="button"
                onClick={onViewActivity}
                className="text-xs text-muted-foreground hover:text-foreground border border-foreground/10 rounded-md px-2.5 py-1 shrink-0"
              >
                View all →
              </button>
            </div>
            {recentInvoices.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                No paid invoices yet. When customers pay, they'll show up here.
              </div>
            ) : (
              <table className="cockpit-data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="font-medium truncate max-w-[320px]">{inv.bill_to_name ?? "—"}</td>
                      <td className="text-muted-foreground">{inv.invoice_number}</td>
                      <td className="text-muted-foreground">{formatDate(inv.paid_at)}</td>
                      <td className="num font-semibold">{formatMoney(inv.total_cents, inv.currency || currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Bar cards — Inquiries, Cash flow, Operating expenses. They
          share the same horizontal-bars visual rhythm, so grouping
          them tightens the page. Three across on desktop, stacks on
          narrow screens; nudged a touch narrower on wide monitors. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 xl:w-11/12">
        <OverviewLeadsCard leads={leads} />
        <OverviewCashflowCard moneyIn={revenue30d} moneyOut={expenses.total} currency={currency} />
        <OverviewExpensesCard expenses={expenses} currency={currency} onViewAll={onViewExpenses} />
      </div>

      {/* Upcoming appointments — confirmed / proposed meetings across
          every listing, soonest first. Links out to the Calendar tab. */}
      <OverviewUpcomingAppointments appts={upcomingAppts} onViewAll={onViewCalendar} />
    </>
  );
}

// Upcoming appointments card for the Overview — a compact "what's next
// on the calendar" surface. Pulls confirmed (accepted) and proposed
// meetings scheduled from now on, soonest first.
const APPT_KIND_LABEL: Record<string, string> = {
  consultation: "Consultation",
  walkthrough: "Walkthrough",
  tasting: "Tasting",
  fitting: "Fitting",
  phone_call: "Phone call",
  other: "Meeting",
};

function OverviewUpcomingAppointments({
  appts,
  onViewAll,
}: {
  appts: Array<{
    id: string;
    kind: string;
    title: string | null;
    location: string | null;
    scheduled_at: string;
    status: string;
    host_name: string | null;
  }>;
  onViewAll: () => void;
}) {
  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };
  return (
    <div className="cockpit-data-card mb-4">
      <div className="cockpit-data-card-header">
        <div>
          <h3 className="text-sm font-semibold">Upcoming appointments</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Confirmed and proposed meetings across every listing
          </p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs text-muted-foreground hover:text-foreground border border-foreground/10 rounded-md px-2.5 py-1 shrink-0"
        >
          View all →
        </button>
      </div>
      {appts.length === 0 ? (
        <div className="px-5 py-6 text-sm text-muted-foreground text-center">
          No upcoming appointments. Scheduled meetings will show up here.
        </div>
      ) : (
        <table className="cockpit-data-table">
          <thead>
            <tr>
              <th>Appointment</th>
              <th>With</th>
              <th>When</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {appts.map((a) => {
              const label = a.title?.trim() || APPT_KIND_LABEL[a.kind] || "Meeting";
              const confirmed = a.status === "accepted";
              return (
                <tr key={a.id}>
                  <td className="font-medium truncate max-w-[260px]">
                    {label}
                    {a.location ? (
                      <span className="block text-[11px] text-muted-foreground font-normal truncate">
                        {a.location}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground truncate max-w-[160px]">
                    {a.host_name ?? "—"}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap">{fmtWhen(a.scheduled_at)}</td>
                  <td>
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{
                        background: confirmed ? "rgba(34,197,94,0.12)" : "#f4ece7",
                        color: confirmed ? "#0a7c4a" : "#7d5a4f",
                      }}
                    >
                      {confirmed ? "Confirmed" : "Proposed"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Revenue trend chart for Overview — 30-day daily line chart with
// grid + axes. Mirrors RevenueSparkline's SVG approach but with
// fixed 30-bucket layout and "no data" empty state.
// Round a positive integer up to a "nice" axis ceiling so the chart's
// mid-tick reads as a clean number (e.g. $5k / $2.5k / $0 instead of
// $4.5k / $2.3k / $0). Chooses the smallest of 1, 2, 2.5, 5, or 10
// times the order of magnitude that's >= the data max.
function niceAxisCeil(n: number): number {
  if (n <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const scaled = n / mag;
  const nice =
    scaled <= 1 ? 1 :
    scaled <= 2 ? 2 :
    scaled <= 2.5 ? 2.5 :
    scaled <= 5 ? 5 :
    10;
  return nice * mag;
}

function OverviewRevenueChart({
  series: rawSeries,
  currency,
  previousTotal,
}: {
  series: number[];
  currency: string;
  previousTotal: number;
}) {
  // Guard against an empty series on first render (state initializes to
  // [] before the useEffect query resolves). The chart math below
  // dereferences pts[0] unconditionally, so an empty input would crash
  // — fall back to 30 zero-buckets and the ghost-wave path takes over.
  const series = rawSeries.length > 0 ? rawSeries : new Array(30).fill(0);
  const max = series.reduce((m, v) => (v > m ? v : m), 0);
  const total = series.reduce((s, v) => s + v, 0);
  const hasData = max > 0;
  // Delta vs prior 30-day window. Hidden when there's no comparison
  // baseline yet (vendor's first month with revenue).
  const deltaPct =
    previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;
  const deltaPositive = deltaPct !== null && deltaPct >= 0;

  // Hovered day index drives the crosshair / marker / tooltip. Null
  // = pointer is outside the plot area.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // X-axis label dates — 5 evenly-spaced markers across the 30-day
  // window, starting 29 days ago through today. Same set every
  // render (the chart's window doesn't slide mid-session), but
  // recomputed on mount so it tracks the calendar date the vendor
  // opens the page.
  const xAxisLabels = useMemo(() => {
    const labels: string[] = [];
    const now = new Date();
    const offsets = [29, 22, 15, 8, 0];
    for (const off of offsets) {
      const d = new Date(now);
      d.setDate(d.getDate() - off);
      labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    }
    return labels;
  }, []);

  return (
    <div
      className="rounded-2xl px-7 pt-6 pb-5"
      style={{
        background: "linear-gradient(135deg, #fdf0ea, #fbe4dc)",
        boxShadow: "0 18px 40px -20px rgba(217,79,61,0.35)",
      }}
    >
      <div className="flex items-end justify-between mb-4">
        <div>
          <div
            className="text-[22px] font-semibold leading-tight"
            style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#2b2320" }}
          >
            Revenue · last 30 days
          </div>
          <div className="text-[13px] mt-0.5" style={{ color: "#9c8d86" }}>
            Daily paid-invoice totals
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-[28px] font-semibold leading-none"
            style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#2b2320" }}
          >
            {formatMoney(total, currency)}
          </div>
          {deltaPct !== null ? (
            <div
              className="text-xs font-semibold mt-1"
              style={{ color: deltaPositive ? "#2e9e6b" : "#b8453d" }}
            >
              {deltaPositive ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%
            </div>
          ) : null}
        </div>
      </div>

      {(() => {
        const PAD_L = 50, PAD_R = 8, PAD_T = 8, PAD_B = 6, W = 620, H = 200;
        const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
        const n = series.length;
        const plotted = hasData
          ? series
          : Array.from({ length: n }, (_, i) =>
              0.55 + 0.35 * Math.sin((i / (n - 1)) * Math.PI * 1.4 - Math.PI / 6),
            );
        const plotMax = hasData ? niceAxisCeil(max) : 1;
        const x = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
        const y = (v: number) => PAD_T + plotH - (v / plotMax) * plotH;
        // Smooth the line into a wave with a Catmull-Rom-to-Bezier
        // conversion — tension 0.2 ≈ Chart.js's `tension: 0.4` look.
        // The area path reuses the same curve so the fill hugs the
        // line instead of cutting in straight segments underneath.
        //
        // Control-point y values are clamped to each segment's
        // [min, max] range so the bezier can't overshoot. Without
        // this the segment AFTER a peak — going from zero to zero
        // with a peak as p0 — sets c1y = p1.y + (p2.y - p0.y) * t,
        // which is *below* the baseline because (p2 - p0) is a
        // positive delta. The curve then dips visibly under the
        // "$0" gridline.
        const pts = plotted.map((v, i) => ({ x: x(i), y: y(v) }));
        const tension = 0.2;
        let linePath = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i - 1] ?? pts[i];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2] ?? pts[i + 1];
          const c1x = p1.x + (p2.x - p0.x) * tension;
          let c1y = p1.y + (p2.y - p0.y) * tension;
          const c2x = p2.x - (p3.x - p1.x) * tension;
          let c2y = p2.y - (p3.y - p1.y) * tension;
          const segMinY = Math.min(p1.y, p2.y);
          const segMaxY = Math.max(p1.y, p2.y);
          c1y = Math.min(Math.max(c1y, segMinY), segMaxY);
          c2y = Math.min(Math.max(c2y, segMinY), segMaxY);
          linePath += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
        }
        const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${PAD_T + plotH} L${pts[0].x.toFixed(1)},${PAD_T + plotH} Z`;

        // Snap hover to the nearest data point so the tooltip shows
        // a real per-day value, not an interpolated curve value.
        const onMove = (e: React.MouseEvent<SVGRectElement>) => {
          if (!hasData) return;
          const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
          const vbX = ((e.clientX - rect.left) / rect.width) * W;
          const frac = (vbX - PAD_L) / plotW;
          const idx = Math.round(frac * (n - 1));
          setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
        };
        const onLeave = () => setHoverIdx(null);

        // Compute hover artifacts. Marker + crosshair share the same
        // x; the tooltip is HTML overlaid above the marker.
        const showHover = hoverIdx !== null && hasData;
        const hoverX = showHover ? x(hoverIdx!) : 0;
        const hoverY = showHover ? y(series[hoverIdx!]) : 0;
        const hoverDate = (() => {
          if (!showHover) return "";
          const d = new Date();
          d.setDate(d.getDate() - (n - 1 - (hoverIdx as number)));
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        })();

        return (
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px] overflow-visible" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="cockpit-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d94f3d" stopOpacity={hasData ? 0.18 : 0.08} />
                  <stop offset="100%" stopColor="#d94f3d" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Horizontal grid lines + y-axis tick labels */}
              {[0, 0.5, 1].map((t) => {
                const yy = PAD_T + plotH - t * plotH;
                return (
                  <g key={t}>
                    <line x1={PAD_L} y1={yy} x2={PAD_L + plotW} y2={yy} stroke="rgba(43,35,32,0.06)" strokeWidth="1" />
                    <text x={PAD_L - 6} y={yy} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#9c8d86">
                      {hasData ? (t === 0 ? "$0" : formatMoneyCompact(plotMax * t, currency)) : ""}
                    </text>
                  </g>
                );
              })}
              <path d={areaPath} fill="url(#cockpit-area-grad)" style={hasData ? undefined : { opacity: 0.5 }} />
              <path
                d={linePath}
                fill="none"
                stroke="#d94f3d"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={hasData ? undefined : { opacity: 0.35 }}
              />
              {showHover ? (
                <>
                  <line x1={hoverX} y1={PAD_T} x2={hoverX} y2={PAD_T + plotH} stroke="#d94f3d" strokeOpacity="0.45" strokeWidth="1" />
                  <circle cx={hoverX} cy={hoverY} r="4.5" fill="#fdf0ea" stroke="#d94f3d" strokeWidth="2.5" />
                </>
              ) : null}
              {/* Hit-test rect — captures pointer moves and converts
                  them to a snapped day index. Sits on top of all the
                  path geometry so events don't fall through. */}
              <rect
                x={PAD_L}
                y={PAD_T}
                width={plotW}
                height={plotH}
                fill="transparent"
                style={{ cursor: hasData ? "crosshair" : "default" }}
                onMouseMove={onMove}
                onMouseLeave={onLeave}
              />
            </svg>
            {showHover ? (
              <div
                className="absolute pointer-events-none text-xs font-semibold rounded-lg px-2.5 py-1.5 whitespace-nowrap"
                style={{
                  left: `${(hoverX / W) * 100}%`,
                  top: `${(hoverY / H) * 100}%`,
                  transform: "translate(-50%, calc(-100% - 12px))",
                  background: "#2b2320",
                  color: "#fff",
                  boxShadow: "0 6px 16px -6px rgba(0,0,0,0.4)",
                }}
              >
                {formatMoney(series[hoverIdx as number], currency)}
                <span className="block font-normal text-[11px] mt-0.5" style={{ color: "#c9bdb6" }}>
                  {hoverDate}
                </span>
                {/* Triangle pointer below the tip */}
                <span
                  className="absolute left-1/2 -translate-x-1/2 top-full block"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: "5px solid #2b2320",
                  }}
                />
              </div>
            ) : null}
            {/* X-axis labels — 5 evenly-spaced calendar dates beneath
                the SVG so they can't be clipped by the plot. Margins
                match the SVG's PAD_L / PAD_R so labels line up under
                the plot area, not the y-axis label gutter. */}
            <div
              className="flex justify-between text-[11px] mt-2"
              style={{
                color: "#9c8d86",
                paddingLeft: `${(50 / 620) * 100}%`,
                paddingRight: `${(8 / 620) * 100}%`,
              }}
            >
              {xAxisLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            {!hasData && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="text-xs italic rounded-full px-3 py-1.5"
                  style={{
                    color: "#9c8d86",
                    background: "rgba(253,240,234,0.7)",
                    border: "0.5px solid rgba(217,79,61,0.22)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
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
          <div className="cockpit-chart-title">Inquiries</div>
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
                  <div className="w-20 text-xs text-foreground font-bold shrink-0 truncate">{r.label}</div>
                  <div className="flex-1 h-5 rounded overflow-hidden relative" style={{ background: "rgba(255, 138, 76, 0.12)" }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: r.color, opacity: r.count > 0 ? 1 : 0 }}
                    />
                  </div>
                  <div className="w-12 text-right text-xs text-foreground font-bold tabular-nums shrink-0">
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

// Cash flow card — money in (paid invoices) vs money out (operating
// expenses) over the last 30 days, with the net underneath. Same
// label + bar + right-aligned value rhythm as the MRR / Inquiries /
// OPEX cards so the row reads as one editorial system. Money in is
// green, money out crimson; the net flips green → crimson when the
// vendor spends more than they collected, so a cash crunch is
// obvious at a glance.
function OverviewCashflowCard({
  moneyIn,
  moneyOut,
  currency,
}: {
  moneyIn: number;
  moneyOut: number;
  currency: string;
}) {
  const net = moneyIn - moneyOut;
  const netPositive = net >= 0;
  const rows: Array<{ label: string; value: number; color: string }> = [
    { label: "Money in",  value: moneyIn,  color: "#4a7c4a" },
    { label: "Money out", value: moneyOut, color: "#c8403a" },
  ];
  const max = Math.max(moneyIn, moneyOut, 1);
  // Net margin — net as a share of money in. Only meaningful once the
  // vendor has actually collected something this period.
  const marginPct = moneyIn > 0 ? Math.round((net / moneyIn) * 100) : null;
  return (
    <div className="cockpit-chart">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="cockpit-chart-title">Cash flow</div>
          <div className="cockpit-chart-sub">Money in vs out · last 30 days</div>
        </div>
        <div className="text-right">
          <div className="cockpit-kpi-label">Net</div>
          <div
            className="cockpit-money cockpit-money--lg"
            style={{ color: netPositive ? "#3f7a3f" : "#c8403a" }}
          >
            {netPositive ? "" : "−"}{formatMoney(Math.abs(net), currency)}
          </div>
        </div>
      </div>
      {moneyIn === 0 && moneyOut === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No money in or out in the last 30 days.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = (r.value / max) * 100;
              return (
                <div key={r.label} className="flex items-center gap-2">
                  <div className="w-20 text-xs text-foreground font-bold shrink-0 truncate">{r.label}</div>
                  <div className="flex-1 h-5 rounded overflow-hidden relative" style={{ background: "rgba(255, 138, 76, 0.12)" }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: r.color, opacity: r.value > 0 ? 1 : 0 }}
                    />
                  </div>
                  <div className="w-24 text-right text-xs text-foreground font-bold tabular-nums shrink-0">
                    {formatMoney(r.value, currency)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            {marginPct !== null
              ? `${marginPct}% net margin · ${formatMoney(moneyOut, currency)} spent`
              : `${formatMoney(moneyOut, currency)} spent, nothing collected yet`}
          </div>
        </>
      )}
    </div>
  );
}

// Operating expenses card — donut chart + legend showing OPEX in
// the last 30 days broken down by category. The vendor's top 3
// categories get their own slice; any 4th+ category rolls into an
// "Other" bucket so the donut tops out at four segments. After the
// rollup the list is re-sorted by amount, so "Other" floats to its
// correct rank position (e.g. if the rollup sum is larger than the
// 2nd-largest individual category, it sits 2nd, not last).
// Footer is explicit about the underlying counts so "8 expenses
// shown as 4 categories" doesn't read as a mismatch.
function OverviewExpensesCard({
  expenses,
  currency,
  onViewAll,
}: {
  expenses: { total: number; count: number; categoryCount: number; topCategories: Array<{ label: string; cents: number }> };
  currency: string;
  onViewAll?: () => void;
}) {
  // Reuse the bar palette from MRR (crimson → terra → amber → green)
  // so a vendor scanning the page picks up category rank by color.
  const palette = ["#c8403a", "#b8693d", "#c89738", "#4a7c4a"];
  const rows = expenses.topCategories.map((c, i) => ({
    ...c, color: palette[i] ?? "#8a8579",
  }));
  // Donut geometry — stroked circle with stroke-dasharray for each
  // segment. Radius 38 + strokeWidth 14 gives an outer ring at 45
  // and an inner hole at ~31 inside a 100x100 viewbox. SVG strokes
  // start at 3 o'clock, so the whole svg is rotated -90deg to begin
  // the first segment at 12 o'clock like a clock face.
  const RING_R = 38;
  const RING_W = 14;
  const CIRC = 2 * Math.PI * RING_R;
  let dashOffset = 0;
  return (
    <div className="cockpit-chart">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <div className="min-w-0">
          <div className="cockpit-chart-title truncate">Operating expenses</div>
          <div className="cockpit-chart-sub">Last 30 days · by item</div>
        </div>
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs text-muted-foreground hover:text-foreground border border-foreground/10 rounded-md px-2.5 py-1 shrink-0"
          >
            View all →
          </button>
        ) : null}
      </div>
      {expenses.count === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No expenses logged in the last 30 days.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 100 100" className="w-[110px] h-[110px] shrink-0 -rotate-90" aria-hidden>
              {/* Faint background ring so the donut feels seated even
                  when one segment dominates the total. */}
              <circle cx="50" cy="50" r={RING_R} fill="none" stroke="rgba(255,138,76,0.14)" strokeWidth={RING_W} />
              {rows.map((r) => {
                const len = expenses.total > 0 ? (r.cents / expenses.total) * CIRC : 0;
                const offset = dashOffset;
                dashOffset += len;
                return (
                  <circle
                    key={r.label}
                    cx="50" cy="50" r={RING_R}
                    fill="none"
                    stroke={r.color}
                    strokeWidth={RING_W}
                    strokeDasharray={`${len} ${CIRC - len}`}
                    strokeDashoffset={-offset}
                  />
                );
              })}
            </svg>
            <div className="flex-1 min-w-0 space-y-1.5">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />
                  <span className="text-foreground font-bold truncate flex-1">{r.label}</span>
                  <span className="tabular-nums text-foreground font-bold shrink-0">
                    {formatMoney(r.cents, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            {expenses.count} expense{expenses.count === 1 ? "" : "s"} across{" "}
            {expenses.categoryCount} item{expenses.categoryCount === 1 ? "" : "s"}
            {expenses.categoryCount > expenses.topCategories.length
              ? ` · ${expenses.categoryCount - expenses.topCategories.length + 1} grouped into Other`
              : ""}
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
  accountVendorIds,
  listings,
  onRefunded,
}: {
  transactions: Transaction[];
  payouts: PayoutsResponse | null;
  status: Status | null;
  accountVendorIds: string[];
  listings: ListingOpt[];
  onRefunded: () => void;
}) {
  // Account-level: the PaymentsTab sub-tabs (Transactions / Payouts /
  // Disputes / Expenses / Reports) still take a single `vendorId`
  // because their Stripe and per-listing reconciliation logic was
  // built around one connected account. Until each sub-tab is
  // individually migrated, derive vendorId as the primary listing
  // so the existing scope-by-vendor_id queries keep working.
  const vendorId = accountVendorIds[0] ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSub = searchParams.get("sub");
  // Legacy ?sub=reports links (the Reports tab was removed) fall back
  // to Incoming.
  const sub: PaymentsTabId = rawSub === "expenses" ? "expenses" : "incoming";
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
          narrow viewports (Incoming · Expenses · Reports); without
          the fade, vendors might not realize there are more tabs
          scrolled off to the right. */}
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
      ) : (
        <ExpensesTab accountVendorIds={accountVendorIds} listings={listings} />
      )}
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

  // KPI strip — money in, net after fees, and a count. Mirrors the
  // Expenses tab's tile treatment (white card, foreground/10 border,
  // Fraunces numerals) so the two surfaces read as siblings.
  const kpis = useMemo(() => {
    const currency = transactions[0]?.currency ?? "usd";
    let grossInCents = 0;
    let netInCents = 0;
    let inCount = 0;
    let feeCents = 0;
    for (const t of transactions) {
      const meta = kindLabel(t.kind);
      if (meta.tone === "in") {
        grossInCents += t.amount_cents;
        netInCents += t.net_cents;
        feeCents += t.fee_cents;
        inCount++;
      }
    }
    return { currency, grossInCents, netInCents, inCount, feeCents, total: transactions.length };
  }, [transactions]);

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
    <div className="space-y-4">
      {/* KPI strip — matches the Expenses tab tiles. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-xl px-4 py-3 bg-white border border-foreground/10">
          <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
            Money in
          </div>
          <div
            className="mt-1 text-[22px] font-semibold tabular-nums leading-none"
            style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#2b2320" }}
          >
            {formatMoney(kpis.grossInCents, kpis.currency)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {kpis.inCount} payment{kpis.inCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-white border border-foreground/10">
          <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
            Net to bank
          </div>
          <div
            className="mt-1 text-[22px] font-semibold tabular-nums leading-none"
            style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#2b2320" }}
          >
            {formatMoney(kpis.netInCents, kpis.currency)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
            {kpis.feeCents > 0 ? <>{formatMoney(kpis.feeCents, kpis.currency)} fees</> : "After processing fees"}
          </div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-white border border-foreground/10">
          <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
            Transactions
          </div>
          <div
            className="mt-1 text-[22px] font-semibold tabular-nums leading-none"
            style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#2b2320" }}
          >
            {kpis.total}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Most recent {transactions.length} shown
          </div>
        </div>
      </div>

      {/* Ledger table — same white-card table treatment as Expenses. */}
      <div className="rounded-xl border border-foreground/10 bg-white overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-foreground/[0.03]">
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Description
              </th>
              <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Type
              </th>
              <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Date
              </th>
              <th className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Amount
              </th>
              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const meta = kindLabel(t.kind);
              // Only refund actual card charges that resolved to a PI.
              // Adjustments / fees / payouts don't refund through this
              // flow, and a charge without an exposed PI id (legacy or
              // not-yet-resolved) can't be refunded either.
              const canRefund = t.kind === "charge" && t.amount_cents > 0 && Boolean(t.payment_intent_id);
              return (
                <tr key={t.id} className="border-t border-foreground/5 hover:bg-foreground/[0.02]">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium truncate max-w-[280px]">{t.description ?? meta.label}</div>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{meta.label}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(t.created_at)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          meta.tone === "in" ? "text-emerald-700" : meta.tone === "out" ? "text-rose-700" : "text-foreground"
                        }`}
                      >
                        {meta.tone === "out" ? "-" : "+"}
                        {formatMoney(Math.abs(t.amount_cents), t.currency)}
                      </span>
                      {t.fee_cents > 0 ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label="Show where this money went"
                              className="inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-foreground/10 transition-colors"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-60 p-3 text-left">
                            <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-2">
                              Where this went
                            </div>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">Charged</span>
                                <span className="tabular-nums font-medium">
                                  {formatMoney(Math.abs(t.amount_cents), t.currency)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  VendoraPay fees
                                  {Math.abs(t.amount_cents) > 0 ? (
                                    <span className="text-muted-foreground/70">
                                      {" "}({((t.fee_cents / Math.abs(t.amount_cents)) * 100).toFixed(1)}%)
                                    </span>
                                  ) : null}
                                </span>
                                <span className="tabular-nums text-rose-700">
                                  -{formatMoney(t.fee_cents, t.currency)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-foreground/10">
                                <span className="font-semibold">Net to your bank</span>
                                <span className="tabular-nums font-semibold text-emerald-700">
                                  {formatMoney(t.net_cents, t.currency)}
                                </span>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
                              VendoraPay fees cover card processing plus your plan rate. Net is what settles to your bank.
                            </p>
                          </PopoverContent>
                        </Popover>
                      ) : null}
                    </div>
                    {t.fee_cents > 0 ? (
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        Net {formatMoney(t.net_cents, t.currency)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {refundFor ? (
        <RefundModal
          tx={refundFor}
          // The transaction was tagged with its source listing when
          // the parent fanned out vendorapay-transactions, so refund
          // against THAT connected account — not whichever listing
          // happens to be "primary" right now.
          vendorId={refundFor.vendor_id ?? vendorId}
          onClose={() => setRefundFor(null)}
          onDone={() => {
            setRefundFor(null);
            onRefunded();
          }}
        />
      ) : null}
    </div>
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
  accountVendorIds,
}: {
  data: PayoutsResponse | null;
  status: Status | null;
  accountVendorIds: string[];
}) {
  // Payout reconciliations aggregate across every listing on the
  // account. Stripe-side payout data (`data`) is still per-listing
  // because Stripe's `/payouts` API is scoped to one connected
  // account — the parent fetches it against the primary listing.
  // New reconciliation rows are attached to that same primary
  // listing so the bookkeeping row sits under the listing whose
  // Stripe payout it reconciles against.
  const primaryVendorId = accountVendorIds[0] ?? null;
  const accountKey = accountVendorIds.join(",");
  const { user } = useAuth();
  const schedule = data?.schedule;
  const [reconciliations, setReconciliations] = useState<PayoutReconciliation[]>([]);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [editingRef, setEditingRef] = useState<{ payoutId: string; ref: string; notes: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (accountVendorIds.length === 0) {
      setReconciliations([]);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: rows, error } = await db
      .from("vendor_payout_reconciliations")
      .select("id, stripe_payout_id, reconciled_at, bank_deposit_ref, notes")
      .in("vendor_id", accountVendorIds)
      .order("reconciled_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error("[PayoutsTab] reconciliation fetch failed", error);
      return;
    }
    setReconciliations((rows ?? []) as PayoutReconciliation[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey]);

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
    if (!editingRef || !primaryVendorId || !user) return;
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
        vendor_id: primaryVendorId,
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
                          disabled={!primaryVendorId}
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
// to the right sub-surface. Account-level: invoices and payment
// links are loaded across every listing the user owns (parent does
// the .in() fetch and passes the arrays down). Per-row actions
// look up their listing via row.vendor_id; contracts/proposals
// templates are stored under accountVendorIds[0] as account-wide
// defaults.
function FilesTab(props: {
  accountVendorIds: string[];
  listings: ListingOpt[];
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
          accountVendorIds={props.accountVendorIds}
          listings={props.listings}
          invoices={props.invoices}
          status={props.status}
          onChanged={props.onChanged}
        />
      ) : fileTab === "links" ? (
        <PayLinksTab
          accountVendorIds={props.accountVendorIds}
          listings={props.listings}
          links={props.paymentLinks}
          status={props.status}
          onChanged={props.onChanged}
        />
      ) : fileTab === "contracts" ? (
        <DocumentCanvas
          accountVendorIds={props.accountVendorIds}
          listings={props.listings}
          kind="contract"
          starter={CONTRACT_TEMPLATES[0]}
        />
      ) : fileTab === "proposals" ? (
        <DocumentCanvas
          accountVendorIds={props.accountVendorIds}
          listings={props.listings}
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
    <div className="w-full">
    <Card>
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-foreground/5">
        <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
          Invoice template
        </p>
        <EmailSendingOptInCard />
      </div>

      <div className="bg-white px-6 sm:px-10 py-8 sm:py-10">
        <header className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
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
    </div>
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
  accountVendorIds,
  listings,
  kind,
  starter,
}: {
  accountVendorIds: string[];
  listings: ListingOpt[];
  kind: "contract" | "proposal";
  starter: DocTemplate;
}) {
  // Contract / proposal templates are stored once per account (no
  // separate per-listing copies). The first listing in the account
  // owns the template row; the brand placeholders rendered below
  // come from that same listing's profile. A future primary-listing
  // picker can replace `accountVendorIds[0]` if the vendor wants to
  // pin a different listing as the template owner.
  const templateVendorId = accountVendorIds[0] ?? null;
  const templateListing = listings.find((l) => l.id === templateVendorId) ?? null;
  const [title, setTitle] = useState(starter.title);
  const [body, setBody] = useState(starter.content);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialRef = useRef({ title: starter.title, body: starter.content });

  // Fetch the account's saved default for this kind. If one exists,
  // hydrate the canvas from it; otherwise leave the starter seed.
  useEffect(() => {
    if (!templateVendorId) {
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
        .eq("vendor_id", templateVendorId)
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
  }, [templateVendorId, kind, starter.title, starter.content]);

  const dirty = title !== initialRef.current.title || body !== initialRef.current.body;

  const save = useCallback(async () => {
    if (!templateVendorId || saving || !dirty) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_document_defaults")
      .upsert(
        {
          vendor_id: templateVendorId,
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
  }, [templateVendorId, saving, dirty, kind, title, body]);

  const displayName = templateListing?.business_name?.trim() || "[Your Business Name]";
  const displayLocation = templateListing?.location?.trim() || "[City, State]";
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
              {templateListing?.logo_url ? (
                <img
                  src={templateListing.logo_url}
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
            disabled={saving || !dirty || !templateVendorId}
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

// Account-wide opt-in for sending emails to clients (invoices, paid
// receipts, payment reminders). Until the account owner turns this on,
// those client emails are blocked server-side and never billed. The
// setting applies across every listing on the account. Writes
// vendor_email_settings (RLS-gated to the owner).
function EmailSendingOptInCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) {
        setEnabled(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_email_settings")
        .select("sending_enabled")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      setEnabled(
        Boolean((data as { sending_enabled?: boolean } | null)?.sending_enabled),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (next: boolean) => {
      if (!userId || saving) return;
      setSaving(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_email_settings")
        .upsert(
          { user_id: userId, sending_enabled: next, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      setSaving(false);
      if (error) {
        toast.error("Couldn't update email setting", { description: error.message });
        return;
      }
      setEnabled(next);
      toast.success(next ? "Client emails enabled" : "Client emails paused", {
        description: next
          ? "Invoices, receipts, and reminders will now email your clients."
          : "Invoices, receipts, and reminders won't email your clients until you re-enable.",
      });
    },
    [userId, saving],
  );

  // Compact inline control — sits in the invoice template header next to
  // the title. Label + info popover + toggle only (no long sentence).
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground whitespace-nowrap">
        Automated invoice delivery
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="What is automated invoice delivery?"
            className="inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-foreground/10 transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3 text-left">
          <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-1.5">
            Automated invoice delivery
          </div>
          <p className="text-xs text-muted-foreground leading-snug">
            When on, VendoraPay automatically emails your clients their
            invoices, paid receipts, and payment reminders — <strong>free</strong>.
            While off, those client emails are paused and you'd send them
            yourself. Applies to your whole account.
          </p>
        </PopoverContent>
      </Popover>
      <Switch
        checked={Boolean(enabled)}
        disabled={enabled === null || saving || !userId}
        onCheckedChange={toggle}
        aria-label="Enable automated invoice delivery"
      />
    </div>
  );
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
  accountVendorIds,
  listings,
  invoices,
  onChanged,
}: {
  accountVendorIds: string[];
  listings: ListingOpt[];
  invoices: Invoice[];
  status: Status | null;
  onChanged: () => void;
}) {
  // Account-level: the invoice list (`invoices`) already arrives
  // aggregated across every listing on the account because the
  // parent's fetch was switched to .in(vendor_id, accountVendorIds).
  // The brand-editing card below needs a *single* listing context,
  // so it exposes a ListingPickerField when the account has more
  // than one listing — the vendor picks which listing's brand
  // profile (business_name / location / logo / default_tax_pct)
  // they're editing. New-invoice defaults likewise stamp against
  // the currently-picked listing. Initial pick is the first listing
  // in the account.
  const primaryVendorId = accountVendorIds[0] ?? null;
  const [vendorId, setVendorId] = useState<string | null>(primaryVendorId);
  useEffect(() => {
    if (vendorId && accountVendorIds.includes(vendorId)) return;
    setVendorId(primaryVendorId);
  }, [primaryVendorId, accountVendorIds, vendorId]);
  const listing = listings.find((l) => l.id === vendorId) ?? null;
  const { user } = useAuth();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const navigate = useNavigate();
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
      if (await handleEmailBillingError(error, navigate)) return;
      toast.error("Couldn't send invoice", { description: error.message });
      return;
    }
    toast.success("Invoice email sent");
    onChanged();
  }, [onChanged, navigate]);

  // Manual "Send an invoice" — pick a saved invoice + type a recipient,
  // then send. Pure send: no billing, no status change (the backend
  // skips the sent_at stamp when a to_email override is present). Lets a
  // vendor hand-send an invoice/receipt instead of relying on automation.
  const [sendPickId, setSendPickId] = useState<string>("");
  const [sendPickEmail, setSendPickEmail] = useState<string>("");
  const sendInvoiceTo = useCallback(async (id: string, email: string) => {
    const to = email.trim();
    if (!to) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast.error("Enter a valid email");
      return;
    }
    setSendingId(id);
    const { error } = await supabase.functions.invoke("vendorapay-invoice-send", {
      body: { invoice_id: id, to_email: to },
    });
    setSendingId(null);
    if (error) {
      if (await handleEmailBillingError(error, navigate)) return;
      toast.error("Couldn't send", { description: error.message });
      return;
    }
    toast.success(`Invoice sent to ${to}`);
    setSendPickEmail("");
    setSendPickId("");
  }, [navigate]);

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
      {/* Template on the left, invoice list on the right (stacks on
          narrow screens). items-start so the columns top-align. */}
      <div className="grid lg:grid-cols-2 gap-4 items-start">
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

      {/* Right column: invoice list + Send box stacked together as ONE
          grid cell, so the grid stays 2-up (template left, this right)
          instead of the Send box wrapping to a full-width 3rd cell. */}
      <div className="space-y-4">
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
                    <div className="text-[10px] text-emerald-700 mt-2">Paid {formatDate(inv.paid_at)}</div>
                  ) : inv.sent_at ? (
                    <div className="text-[10px] text-muted-foreground mt-2">Sent {formatDate(inv.sent_at)}</div>
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

      {/* Send an invoice — sits below the list. Flow: fill the template
          → Save → the invoice shows in the list above → pick it from the
          dropdown here, type the recipient, Send. Pure send. */}
      {invoices.length > 0 ? (
        <Card>
          <div className="p-4 space-y-2">
            <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
              Send an invoice
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={sendPickId}
                onChange={(e) => setSendPickId(e.target.value)}
                className="rounded-lg border-0 px-3 py-1.5 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none min-w-[150px]"
              >
                <option value="">Select invoice…</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} · {inv.bill_to_name || inv.bill_to_email || "—"} · {formatMoney(inv.total_cents, inv.currency)}
                  </option>
                ))}
              </select>
              <input
                type="email"
                inputMode="email"
                placeholder="Send to email…"
                value={sendPickEmail}
                onChange={(e) => setSendPickEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && sendPickId) void sendInvoiceTo(sendPickId, sendPickEmail);
                }}
                className="flex-1 min-w-[160px] rounded-lg border-0 px-3 py-1.5 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
              <Button
                size="sm"
                className="rounded-full shrink-0"
                onClick={() => sendPickId && void sendInvoiceTo(sendPickId, sendPickEmail)}
                disabled={!sendPickId || !sendPickEmail.trim() || sendingId === sendPickId}
              >
                {sendingId === sendPickId && sendPickId ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Mail className="w-3.5 h-3.5 mr-1" />
                )}
                Send
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
      </div>
      </div>

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
  vendor_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  notes: string | null;
  // QuickBooks-style contact fields. name stays the "display name";
  // first/last/company are the optional structured pieces, and the
  // billing_* columns hold the address shown on invoices/statements.
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  billing_line1: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  created_at: string;
}

// Customers list across the whole account. Vendors can add, edit,
// and remove client records here; later flows (re-bill, send a new
// invoice from a customer card) read from this table. Bare CRUD —
// no edge function needed because RLS gates writes by vendor_id.
// Each customer carries its own vendor_id so per-customer actions
// (send invoice, recurring rule, statement PDF) pick up the right
// listing's brand without forcing the user to pick a listing first.
function CustomersTab({
  accountVendorIds,
  listings,
  onChanged,
}: {
  accountVendorIds: string[];
  listings: ListingOpt[];
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [form, setForm] = useState<{
    email: string;
    name: string;
    phone: string;
    notes: string;
    first_name: string;
    last_name: string;
    company: string;
    billing_line1: string;
    billing_city: string;
    billing_state: string;
    billing_postal_code: string;
    billing_country: string;
  }>({
    email: "",
    name: "",
    phone: "",
    notes: "",
    first_name: "",
    last_name: "",
    company: "",
    billing_line1: "",
    billing_city: "",
    billing_state: "",
    billing_postal_code: "",
    billing_country: "",
  });
  // Which listing a freshly-created customer should be attached to.
  // Defaults to the primary listing; the New-customer dialog renders
  // a picker so the vendor can override per-customer.
  const [newCustomerVendorId, setNewCustomerVendorId] = useState<string | null>(
    accountVendorIds[0] ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<Customer | null>(null);
  const [recurringTarget, setRecurringTarget] = useState<{
    customer: Customer;
    existing: RecurringRule | null;
  } | null>(null);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);
  const [sortField, setSortField] = useState<"name" | "invoices">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (field: "name" | "invoices") => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
  };
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [statementId, setStatementId] = useState<string | null>(null);
  const { user } = useAuth();

  // Statement download — fetches the FULL invoice history for this
  // customer (not the parent's 50-row cache) so an end-of-year
  // statement doesn't miss older invoices. Lazy-imports the PDF
  // module so jsPDF stays out of the initial bundle.
  const downloadStatement = useCallback(
    async (c: Customer) => {
      // Each customer belongs to exactly one listing on the account
      // (vendor_id is fixed at creation), so the brand stamp comes
      // from that listing's row. Snapshot at click time so a later
      // `listings` array update can't change the PDF mid-render.
      const snapVendorId = c.vendor_id;
      const ownerListing = listings.find((l) => l.id === c.vendor_id) ?? null;
      const snapBrand = {
        business_name: ownerListing?.business_name ?? null,
        location: ownerListing?.location ?? null,
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
    [listings, user],
  );

  // Group invoices by bill_to_email so each customer row can show
  // count + total billed + a per-invoice list on expand. Fed by
  // the local invoices state below — fetched account-wide alongside
  // the customer list so all listings' invoices are searchable.
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

  // Per-contact rollup keyed by row id: how many invoices the contact
  // has actually received. Drives the Invoices column and sorting.
  const summaryById = useMemo(() => {
    const m = new Map<string, { count: number }>();
    for (const c of rows) {
      const inv = invoicesByEmail.get(c.email.toLowerCase()) ?? [];
      // Count only invoices the customer actually received — drafts
      // are in-progress and cancelled ones were pulled, so neither
      // belongs in a "how many invoices" tally (mirrors the statement
      // download filter).
      const real = inv.filter(
        (i) => i.status !== "draft" && i.status !== "cancelled",
      );
      m.set(c.id, { count: real.length });
    }
    return m;
  }, [rows, invoicesByEmail]);

  // Recurring rule per customer id, built once so the row render
  // doesn't run a linear find() for every contact on every paint.
  const recurringByCustomerId = useMemo(() => {
    const m = new Map<string, RecurringRule>();
    for (const r of recurringRules) {
      if (r.customer_id) m.set(r.customer_id, r);
    }
    return m;
  }, [recurringRules]);

  // Free-text filter across the fields a vendor would look someone up
  // by — display name, email, phone, company. Applied before sort so
  // the count/total in the footer reflect what's on screen.
  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => {
      const hay = [c.name, c.email, c.phone, c.company, c.first_name, c.last_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchTerm]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortField === "name") {
        const an = (a.name?.trim() || a.email).toLowerCase();
        const bn = (b.name?.trim() || b.email).toLowerCase();
        cmp = an.localeCompare(bn);
      } else {
        cmp = (summaryById.get(a.id)?.count ?? 0) - (summaryById.get(b.id)?.count ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredRows, sortField, sortDir, summaryById]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((safePage - 1) * perPage, safePage * perPage);

  // Reset to page 1 whenever the search narrows the list so we don't
  // strand the view on an empty page.
  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  // Windowed page numbers centered on the current page so deep lists
  // stay navigable (the bare slice(0,5) stranded you after page 5).
  const pageWindow = useMemo(() => {
    const span = 5;
    let start = Math.max(1, safePage - Math.floor(span / 2));
    const end = Math.min(totalPages, start + span - 1);
    start = Math.max(1, end - span + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [safePage, totalPages]);

  // Keep selection scoped to the page actually on screen (mirrors the
  // Expenses table) so paging away then bulk-deleting can't reach rows
  // the vendor isn't looking at.
  const pageIdsKey = pageRows.map((r) => r.id).join(",");
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(pageRows.map((r) => r.id));
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdsKey]);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllOnPage = () => {
    setSelectedIds((prev) => {
      const allSelected = pageRows.length > 0 && pageRows.every((r) => prev.has(r.id));
      if (allSelected) return new Set();
      return new Set(pageRows.map((r) => r.id));
    });
  };
  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Remove ${selectedIds.size} contact${selectedIds.size === 1 ? "" : "s"}?`)) return;
    setBulkDeleting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const ids = Array.from(selectedIds);
    const { error } = await db.from("vendor_customers").delete().in("id", ids);
    setBulkDeleting(false);
    if (error) {
      toast.error("Couldn't remove the selected contacts.", { description: error.message });
      return;
    }
    toast.success(`Removed ${ids.length} contact${ids.length === 1 ? "" : "s"}.`);
    setSelectedIds(new Set());
    void refresh();
  };

  // Stable string key for the useEffect dep so we don't refire on
  // every render just because the listings array is re-derived.
  const accountKey = accountVendorIds.join(",");

  const refresh = useCallback(async () => {
    if (accountVendorIds.length === 0) {
      setRows([]);
      setRecurringRules([]);
      setInvoices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [{ data: cs, error: csErr }, { data: rrs }, { data: invs }] = await Promise.all([
      db
        .from("vendor_customers")
        .select("id, vendor_id, email, name, phone, notes, first_name, last_name, company, billing_line1, billing_city, billing_state, billing_postal_code, billing_country, created_at")
        .in("vendor_id", accountVendorIds)
        .order("created_at", { ascending: false }),
      db
        .from("vendor_recurring_invoices")
        .select(
          "id, vendor_id, customer_id, interval, line_items, notes, tax_pct, active, next_run_at, last_run_at",
        )
        .in("vendor_id", accountVendorIds)
        .order("created_at", { ascending: false }),
      db
        .from("invoices")
        .select(
          "id, vendor_id, invoice_number, bill_to_name, bill_to_email, total_cents, currency, status, paid_at, sent_at, issue_date, due_date, created_at, refunded_at, refunded_amount_cents",
        )
        .in("vendor_id", accountVendorIds)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);
    if (!csErr) setRows((cs ?? []) as Customer[]);
    setRecurringRules((rrs ?? []) as RecurringRule[]);
    setInvoices((invs ?? []) as Invoice[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // When the account's listing set changes, close any open dialogs
  // so an action started against one set of vendor_ids doesn't
  // resolve against a different one mid-flight.
  useEffect(() => {
    setEditing(null);
    setSendTarget(null);
    setRecurringTarget(null);
    setSelectedIds(new Set());
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey]);

  const startNew = () => {
    setForm({
      email: "", name: "", phone: "", notes: "",
      first_name: "", last_name: "", company: "",
      billing_line1: "", billing_city: "", billing_state: "",
      billing_postal_code: "", billing_country: "",
    });
    setNewCustomerVendorId(accountVendorIds[0] ?? null);
    setEditing("new");
  };

  const startEdit = (c: Customer) => {
    setForm({
      email: c.email,
      name: c.name ?? "",
      phone: c.phone ?? "",
      notes: c.notes ?? "",
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      company: c.company ?? "",
      billing_line1: c.billing_line1 ?? "",
      billing_city: c.billing_city ?? "",
      billing_state: c.billing_state ?? "",
      billing_postal_code: c.billing_postal_code ?? "",
      billing_country: c.billing_country ?? "",
    });
    setEditing(c);
  };

  const save = useCallback(async () => {
    if (accountVendorIds.length === 0 || saving) return;
    const email = form.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Valid email required");
      return;
    }
    setSaving(true);
    const clean = (v: string) => v.trim() || null;
    // Display name falls back to "First Last" → company → email so a
    // row always has something human to show even if the vendor only
    // filled the structured fields.
    const firstLast = [form.first_name.trim(), form.last_name.trim()]
      .filter(Boolean)
      .join(" ");
    const name = form.name.trim() || firstLast || form.company.trim() || null;
    const phone = clean(form.phone);
    const notes = clean(form.notes);
    const contactFields = {
      first_name: clean(form.first_name),
      last_name: clean(form.last_name),
      company: clean(form.company),
      billing_line1: clean(form.billing_line1),
      billing_city: clean(form.billing_city),
      billing_state: clean(form.billing_state),
      billing_postal_code: clean(form.billing_postal_code),
      billing_country: clean(form.billing_country),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { error } =
      editing === "new"
        ? // New row: the dialog renders a ListingPickerField when the
          // account has multiple listings (newCustomerVendorId holds
          // the choice). Default + only-one-listing fallback both
          // resolve to accountVendorIds[0]. Edits never re-parent
          // (see the update branch below).
          await db
            .from("vendor_customers")
            .upsert(
              {
                vendor_id: newCustomerVendorId ?? accountVendorIds[0],
                email,
                name,
                phone,
                notes,
                ...contactFields,
              },
              { onConflict: "vendor_id,email" },
            )
        : // Edit existing row: never overwrite vendor_id (would
          // silently re-parent the customer to another listing) or
          // email (the unique key).
          await db
            .from("vendor_customers")
            .update({ name, phone, notes, ...contactFields })
            .eq("id", (editing as Customer).id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save", { description: error.message });
      return;
    }
    setEditing(null);
    toast.success(editing === "new" ? "Contact added" : "Contact updated");
    await refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey, saving, form, editing, newCustomerVendorId, refresh]);

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
      toast.success("Contact removed");
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold">Contacts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Everyone you've billed. Save a contact once and reuse them on every invoice.
            </p>
          </div>
          <Button onClick={startNew} disabled={accountVendorIds.length === 0} className="rounded-full" size="sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New contact
          </Button>
        </div>
      </Card>

      {editing && (
        <Card>
          <div className="p-5 space-y-3">
            <h3 className="text-sm font-semibold">
              {editing === "new" ? "New contact" : `Edit ${editing.name ?? editing.email}`}
            </h3>
            {/* Listing picker removed — account-level cockpit means
                we default new customers to accountVendorIds[0] (see
                save()) without asking the vendor to pick. */}
            {/* Name + company. Display name is what shows on invoices
                and statements; if left blank it auto-fills from the
                first/last name (then company, then email) on save. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">First name</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Last name</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Company</label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Display name</label>
                <input
                  type="text"
                  placeholder="How they appear on invoices"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                  Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={editing !== "new"}
                  className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
              </div>
            </div>

            {/* Billing address — shows on this contact's invoices and
                statements. */}
            <div className="pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Billing address
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Street address"
                  value={form.billing_line1}
                  onChange={(e) => setForm({ ...form, billing_line1: e.target.value })}
                  className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="City"
                    value={form.billing_city}
                    onChange={(e) => setForm({ ...form, billing_city: e.target.value })}
                    className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="State"
                    value={form.billing_state}
                    onChange={(e) => setForm({ ...form, billing_state: e.target.value })}
                    className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="ZIP"
                    value={form.billing_postal_code}
                    onChange={(e) => setForm({ ...form, billing_postal_code: e.target.value })}
                    className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Country"
                  value={form.billing_country}
                  onChange={(e) => setForm({ ...form, billing_country: e.target.value })}
                  className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Notes</label>
              <textarea
                placeholder="Venue contacts, dietary, preferences, …"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving} className="rounded-full">
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Save contact
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)} className="rounded-full">
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <EmptyCard>Loading contacts…</EmptyCard>
      ) : rows.length === 0 ? (
        <EmptyCard>No contacts yet. Click "New contact" to add your first.</EmptyCard>
      ) : (
        <>
          {/* Search — name, email, phone, or company. */}
          <div className="relative max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">⌕</span>
            <input
              type="text"
              aria-label="Search contacts"
              placeholder="Search name, email, phone, company…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-foreground/10 bg-white text-sm focus:outline-none focus:border-accent"
            />
          </div>
          {selectedIds.size > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 bg-white px-4 py-2.5">
              <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void bulkDelete()}
                  disabled={bulkDeleting}
                  className="rounded-lg text-[#d94f3d]"
                >
                  {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                  Remove
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="rounded-lg">
                  Clear
                </Button>
              </div>
            </div>
          ) : null}
          {sortedRows.length === 0 ? (
            <EmptyCard>No contacts match "{searchTerm.trim()}".</EmptyCard>
          ) : (
          <div className="rounded-xl border border-foreground/10 bg-white overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="bg-foreground/[0.03]">
                  <th className="w-10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id))}
                      onChange={toggleAllOnPage}
                      aria-label="Select all rows on this page"
                      className="cursor-pointer"
                    />
                  </th>
                  <th
                    className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("name")}
                  >
                    Name {sortField === "name" ? (
                      <span className="text-[#d94f3d] text-[9px]">{sortDir === "desc" ? "▼" : "▲"}</span>
                    ) : null}
                  </th>
                  <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Email
                  </th>
                  <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Phone
                  </th>
                  <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Company
                  </th>
                  <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Location
                  </th>
                  <th
                    className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("invoices")}
                  >
                    Invoices {sortField === "invoices" ? (
                      <span className="text-[#d94f3d] text-[9px]">{sortDir === "desc" ? "▼" : "▲"}</span>
                    ) : null}
                  </th>
                  <th className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => {
                  const summary = summaryById.get(c.id) ?? { count: 0 };
                  const custRecurring = recurringByCustomerId.get(c.id);
                  const location =
                    [c.billing_city, c.billing_state].filter(Boolean).join(", ") ||
                    c.billing_country ||
                    "—";
                  return (
                    <tr key={c.id} className="border-t border-foreground/5 hover:bg-foreground/[0.02]">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleRow(c.id)}
                          aria-label={`Select contact ${c.name ?? c.email}`}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground font-bold">
                        <div className="flex items-center gap-1.5">
                          <span>{c.name?.trim() || c.email}</span>
                          {custRecurring ? (
                            <span
                              title={
                                custRecurring.active
                                  ? `Recurring ${custRecurring.interval} · next ${new Date(custRecurring.next_run_at).toLocaleDateString()}`
                                  : "Recurring paused"
                              }
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{
                                background: custRecurring.active ? "rgba(34,197,94,0.12)" : "#f4ece7",
                                color: custRecurring.active ? "#0a7c4a" : "#7d5a4f",
                              }}
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              {custRecurring.active ? "Recurring" : "Paused"}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-muted-foreground">
                        {c.email}
                      </td>
                      <td className="px-3 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {c.phone || "—"}
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">
                        {c.company || "—"}
                      </td>
                      <td className="px-3 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {location}
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground font-bold text-right tabular-nums">
                        {summary.count || "—"}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => startEdit(c)}
                            className="text-[#d94f3d] hover:underline text-sm font-medium"
                          >
                            Edit
                          </button>
                          <span aria-hidden className="text-foreground/15">|</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="w-7 h-7 rounded-md text-muted-foreground hover:bg-foreground/5 inline-flex items-center justify-center outline-none"
                                title="More actions"
                              >
                                {deletingId === c.id || statementId === c.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => setSendTarget(c)}>
                                <Mail className="w-3.5 h-3.5 mr-2" /> Send invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setRecurringTarget({ customer: c, existing: custRecurring ?? null })
                                }
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-2" />
                                {custRecurring ? "Edit recurring" : "Set up recurring"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => downloadStatement(c)}
                                disabled={statementId === c.id || summary.count === 0}
                              >
                                <Download className="w-3.5 h-3.5 mr-2" /> Statement
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => void remove(c)}
                                disabled={deletingId === c.id}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-foreground/10">
                  <td colSpan={8} className="px-4 py-3">
                    <div className="flex justify-between items-center gap-3 flex-wrap text-xs text-muted-foreground">
                      <span>
                        Showing {pageRows.length} of {sortedRows.length} contact
                        {sortedRows.length === 1 ? "" : "s"}
                      </span>
                      {totalPages > 1 ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPage(Math.max(1, safePage - 1))}
                            disabled={safePage === 1}
                            className="w-7 h-7 rounded-md border border-foreground/10 disabled:opacity-30 hover:border-accent"
                          >
                            ‹
                          </button>
                          {pageWindow[0] > 1 ? <span className="text-muted-foreground">…</span> : null}
                          {pageWindow.map((p) => {
                            const active = p === safePage;
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setPage(p)}
                                className={`min-w-[28px] h-7 px-2 rounded-md text-xs border ${active ? "bg-[#d94f3d] text-white border-[#d94f3d]" : "border-foreground/10 hover:border-accent"}`}
                              >
                                {p}
                              </button>
                            );
                          })}
                          {pageWindow[pageWindow.length - 1] < totalPages ? <span className="text-muted-foreground">…</span> : null}
                          <button
                            type="button"
                            onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                            disabled={safePage === totalPages}
                            className="w-7 h-7 rounded-md border border-foreground/10 disabled:opacity-30 hover:border-accent"
                          >
                            ›
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          )}
        </>
      )}

      <SendInvoiceDialog
        open={!!sendTarget}
        onOpenChange={(v) => !v && setSendTarget(null)}
        vendorId={sendTarget?.vendor_id ?? null}
        listing={
          sendTarget
            ? listings.find((l) => l.id === sendTarget.vendor_id) ?? null
            : null
        }
        customer={sendTarget}
        onSent={onChanged}
      />

      <RecurringDialog
        open={!!recurringTarget}
        onOpenChange={(v) => !v && setRecurringTarget(null)}
        vendorId={recurringTarget?.customer.vendor_id ?? null}
        listing={
          recurringTarget
            ? listings.find((l) => l.id === recurringTarget.customer.vendor_id) ?? null
            : null
        }
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
  item_name: string | null;
  quantity: string | null;
  paid_to: string | null;
  notes: string | null;
  contractor_id?: string | null;
  recurring_rule_id: string | null;
  created_at: string;
}

type RecurringInterval =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly";

const RECURRING_INTERVAL_LABELS: Record<RecurringInterval, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  yearly: "Yearly",
};

// Compute the next-run timestamp for a brand-new recurring rule.
// occurredOnYmd is the calendar date of the FIRST cycle (the row we
// just inserted from the form). We push it forward by one interval
// so the cron emits row #2 next. Monthly+ cadences clamp to the
// last day of the target month — a rule started on Jan 31 becomes
// Feb 28 / 29, not silently overflowing into March.
function computeNextRunAt(occurredOnYmd: string, interval: RecurringInterval): string {
  const [yStr, mStr, dStr] = occurredOnYmd.split("-");
  const y = Number(yStr);
  const m = Number(mStr) - 1;
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date().toISOString();
  }
  const base = new Date(Date.UTC(y, m, d, 12, 0, 0, 0));
  if (interval === "weekly") {
    base.setUTCDate(base.getUTCDate() + 7);
    return base.toISOString();
  }
  if (interval === "biweekly") {
    base.setUTCDate(base.getUTCDate() + 14);
    return base.toISOString();
  }
  const monthDelta =
    interval === "monthly" ? 1 : interval === "quarterly" ? 3 : 0;
  const yearDelta = interval === "yearly" ? 1 : 0;
  const targetMonthRaw = m + monthDelta;
  const targetYear = y + yearDelta + Math.floor(targetMonthRaw / 12);
  const targetMonth = ((targetMonthRaw % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return new Date(Date.UTC(targetYear, targetMonth, day, 12, 0, 0, 0)).toISOString();
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

function expenseCategoryLabel(c: string): string {
  // Falls back to the raw string when the value isn't one of the
  // preset enum keys — vendors can now type custom category names
  // (the DB check constraint was dropped) and we want those to
  // render as-typed.
  return EXPENSE_CATEGORIES.find((e) => e.id === (c as ExpenseCategory))?.label ?? c;
}

function ExpensesTab({
  accountVendorIds,
  listings,
}: {
  accountVendorIds: string[];
  listings: ListingOpt[];
}) {
  // Expense + contractor lists aggregate across every listing on
  // the account. Each "New X" dialog renders a ListingPickerField
  // so the vendor can pick which listing the row attaches to;
  // default is the primary listing.
  const primaryVendorId = accountVendorIds[0] ?? null;
  const accountKey = accountVendorIds.join(",");
  const [newExpenseVendorId, setNewExpenseVendorId] = useState<string | null>(primaryVendorId);
  const [newContractorVendorId, setNewContractorVendorId] = useState<string | null>(primaryVendorId);
  // Keep picks valid as the account's listing set changes.
  useEffect(() => {
    if (newExpenseVendorId && accountVendorIds.includes(newExpenseVendorId)) return;
    setNewExpenseVendorId(primaryVendorId);
  }, [primaryVendorId, accountVendorIds, newExpenseVendorId]);
  useEffect(() => {
    if (newContractorVendorId && accountVendorIds.includes(newContractorVendorId)) return;
    setNewContractorVendorId(primaryVendorId);
  }, [primaryVendorId, accountVendorIds, newContractorVendorId]);
  const { user } = useAuth();
  const [rows, setRows] = useState<Expense[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [editingContractor, setEditingContractor] = useState<Contractor | "new" | null>(null);
  const [form, setForm] = useState<{
    occurred_on: string;
    amount: string;
    category: string;
    description: string;
    item_name: string;
    quantity: string;
    paid_to: string;
    contractor_id: string;
    is_recurring: boolean;
    recurring_interval: RecurringInterval;
  }>({
    occurred_on: new Date().toISOString().slice(0, 10),
    amount: "",
    category: "",
    description: "",
    item_name: "",
    quantity: "",
    paid_to: "",
    contractor_id: "",
    is_recurring: false,
    recurring_interval: "monthly",
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

  // New-design state — search / filter / selection / pagination.
  const [searchTerm, setSearchTerm] = useState("");
  const [rangePreset, setRangePreset] = useState<"all" | "30d" | "this_month" | "ytd" | "last_12m">("last_12m");
  const [sortField, setSortField] = useState<"date" | "amount">("date");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const toggleSort = (field: "date" | "amount") => {
    if (field === sortField) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const refresh = useCallback(async () => {
    if (accountVendorIds.length === 0) {
      setRows([]);
      setContractors([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [
      { data: expData, error: expErr },
      { data: cData, error: cErr },
    ] = await Promise.all([
      db
        .from("vendor_expenses")
        .select("id, vendor_id, occurred_on, amount_cents, currency, category, description, item_name, quantity, paid_to, notes, contractor_id, recurring_rule_id, created_at")
        .in("vendor_id", accountVendorIds)
        .order("occurred_on", { ascending: false })
        .limit(500),
      db
        .from("vendor_contractors")
        .select("id, vendor_id, name, email, phone, address_line1, address_line2, city, state, postal_code, tax_id_last4, notes, created_at")
        .in("vendor_id", accountVendorIds)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startNew = () => {
    setForm({
      occurred_on: new Date().toISOString().slice(0, 10),
      amount: "",
      category: "",
      description: "",
      item_name: "",
      quantity: "",
      paid_to: "",
      contractor_id: "",
      is_recurring: false,
      recurring_interval: "monthly",
    });
    setNewExpenseVendorId(primaryVendorId);
    setEditing("new");
  };

  const startEdit = (e: Expense) => {
    // Recurring-toggle is hidden on edit — vendors manage existing
    // rules from the "Recurring expenses" section below the table.
    // Editing one occurrence shouldn't silently spin up a new
    // schedule.
    setForm({
      occurred_on: e.occurred_on,
      amount: (e.amount_cents / 100).toFixed(2),
      category: e.category,
      description: e.description,
      item_name: e.item_name ?? "",
      quantity: e.quantity ?? "",
      paid_to: e.paid_to ?? "",
      contractor_id: e.contractor_id ?? "",
      is_recurring: false,
      recurring_interval: "monthly",
    });
    setEditing(e);
  };

  const save = async () => {
    // For new rows use the picked listing; for edits keep the
    // existing vendor_id (edits don't re-parent — see below).
    const targetVendorId =
      editing === "new" ? (newExpenseVendorId ?? primaryVendorId) : primaryVendorId;
    if (!targetVendorId || !user) return;
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
      vendor_id: targetVendorId,
      occurred_on: form.occurred_on,
      amount_cents: Math.round(amountNum * 100),
      currency: "usd",
      category: form.category,
      description: form.description.trim(),
      item_name: form.item_name.trim() || null,
      quantity: form.quantity.trim() || null,
      paid_to: form.paid_to.trim() || null,
      notes: null,
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
    let insertedExpenseId: string | null = null;
    if (editing === "new") {
      const { data: ins, error: insErr } = await db
        .from("vendor_expenses")
        .insert(payload)
        .select("id")
        .single();
      error = insErr;
      insertedExpenseId = (ins as { id: string } | null)?.id ?? null;
    } else if (editing) {
      // omit created_by + vendor_id on update — created_by stays the
      // original creator; vendor_id is fixed at insert and editing
      // must never re-parent the row to a different listing.
      const { created_by: _cb, vendor_id: _vid, ...updatePayload } = payload;
      ({ error } = await db
        .from("vendor_expenses")
        .update(updatePayload)
        .eq("id", editing.id));
    }
    if (error) {
      setSaving(false);
      console.error("[ExpensesTab] save failed", error);
      toast.error("Couldn't save expense.");
      return;
    }

    // Recurring: when the New form had "Make this recurring"
    // checked, also create a vendor_recurring_expenses rule. The
    // expense we just inserted IS this cycle's row — next_run_at
    // is one interval after occurred_on so the cron emits the
    // NEXT cycle's row on schedule. day_of_month anchors monthly+
    // rules so a rule started on the 31st stays end-of-month.
    if (editing === "new" && form.is_recurring && insertedExpenseId) {
      const nextRunAt = computeNextRunAt(form.occurred_on, form.recurring_interval);
      const occurredDay = Number(form.occurred_on.slice(8, 10));
      const dayOfMonth =
        form.recurring_interval === "weekly" ||
        form.recurring_interval === "biweekly"
          ? null
          : occurredDay;
      const { data: ruleRow, error: ruleErr } = await db
        .from("vendor_recurring_expenses")
        .insert({
          vendor_id: targetVendorId,
          interval: form.recurring_interval,
          day_of_month: dayOfMonth,
          amount_cents: payload.amount_cents,
          currency: payload.currency,
          category: payload.category,
          description: payload.description,
          item_name: payload.item_name,
          quantity: payload.quantity,
          paid_to: payload.paid_to,
          notes: payload.notes,
          contractor_id: payload.contractor_id,
          active: true,
          next_run_at: nextRunAt,
          last_run_at: new Date().toISOString(),
          last_expense_id: insertedExpenseId,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (ruleErr) {
        console.error("[ExpensesTab] recurring rule insert failed", ruleErr);
        toast.error("Expense saved, but couldn't schedule the recurring rule.");
      } else {
        // Stamp the just-inserted expense with the rule_id so the
        // table shows the "↻ Recurring" badge.
        const ruleId = (ruleRow as { id: string } | null)?.id;
        if (ruleId) {
          await db
            .from("vendor_expenses")
            .update({ recurring_rule_id: ruleId })
            .eq("id", insertedExpenseId);
        }
      }
    }

    setSaving(false);
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
    setNewContractorVendorId(primaryVendorId);
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
    const targetVendorId =
      editingContractor === "new"
        ? (newContractorVendorId ?? primaryVendorId)
        : primaryVendorId;
    if (!targetVendorId || !user) return;
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
      vendor_id: targetVendorId,
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
      // Strip created_by + vendor_id on update — created_by stays
      // the original creator; vendor_id is fixed at insert and
      // editing must not re-parent the contractor row.
      const { created_by: _cb, vendor_id: _vid, ...updatePayload } = payload;
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


  // Filtered + sorted rows for the table — search by description /
  // payee / category, then optional category + date-range narrowing,
  // then sort by occurred_on.
  const filteredRows = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (rangePreset === "30d") {
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 30);
    } else if (rangePreset === "this_month") {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (rangePreset === "ytd") {
      cutoff = new Date(now.getFullYear(), 0, 1);
    } else if (rangePreset === "last_12m") {
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 12);
    }
    const cutoffYmd = cutoff ? cutoff.toISOString().slice(0, 10) : null;
    const term = searchTerm.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (cutoffYmd && r.occurred_on < cutoffYmd) return false;
      if (!term) return true;
      const hay = [
        r.description,
        r.item_name ?? "",
        r.quantity ?? "",
        r.paid_to ?? "",
        (r.amount_cents / 100).toFixed(2),
      ].join(" ").toLowerCase();
      return hay.includes(term);
    });
    filtered.sort((a, b) => {
      if (sortField === "amount") {
        return sortDir === "desc"
          ? b.amount_cents - a.amount_cents
          : a.amount_cents - b.amount_cents;
      }
      return sortDir === "desc"
        ? b.occurred_on.localeCompare(a.occurred_on)
        : a.occurred_on.localeCompare(b.occurred_on);
    });
    return filtered;
  }, [rows, searchTerm, rangePreset, sortField, sortDir]);

  // Pagination derived from the filtered list.
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * perPage, safePage * perPage);
  const filteredTotal = filteredRows.reduce((s, r) => s + r.amount_cents, 0);

  // KPI snapshots — YTD / this month / last 30 days / top category.
  const kpis = useMemo(() => {
    const now = new Date();
    const year = String(now.getFullYear());
    const monthStr = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thirty = new Date(now);
    thirty.setDate(thirty.getDate() - 30);
    const thirtyYmd = thirty.toISOString().slice(0, 10);
    let ytdCents = 0;
    let ytdCount = 0;
    let ytdRecurringCents = 0;
    let monthCents = 0;
    let monthCount = 0;
    let thirtyDayCents = 0;
    let thirtyDayCount = 0;
    // Group by item_name when present, else fall back to the
    // description — vendors no longer pick a category, so "top
    // item" replaces "top category" as the meaningful rollup.
    const byItem = new Map<string, number>();
    for (const r of rows) {
      const sameYear = r.occurred_on.slice(0, 4) === year;
      if (sameYear) {
        ytdCents += r.amount_cents;
        ytdCount += 1;
        if (r.recurring_rule_id) ytdRecurringCents += r.amount_cents;
        const key = (r.item_name?.trim() || r.description.trim() || "—");
        byItem.set(key, (byItem.get(key) ?? 0) + r.amount_cents);
      }
      if (r.occurred_on.slice(0, 7) === monthStr) {
        monthCents += r.amount_cents;
        monthCount += 1;
      }
      if (r.occurred_on >= thirtyYmd) {
        thirtyDayCents += r.amount_cents;
        thirtyDayCount += 1;
      }
    }
    const sortedItems = Array.from(byItem.entries()).sort((a, b) => b[1] - a[1]);
    const topItem = sortedItems[0] ?? null;
    return {
      ytdCents,
      ytdCount,
      ytdRecurringCents,
      monthCents,
      monthCount,
      thirtyDayCents,
      thirtyDayCount,
      topItem,
      topItemPct: ytdCents > 0 && topItem ? Math.round((topItem[1] / ytdCents) * 100) : 0,
    };
  }, [rows]);

  // Reset selection + page if the filters change underneath the user.
  useEffect(() => {
    setPage(1);
  }, [searchTerm, rangePreset, perPage]);

  const pageIdsKey = pageRows.map((r) => r.id).join(",");
  useEffect(() => {
    // Keep selection set scoped to the currently-rendered page —
    // selecting a row, paging away, then bulk-delete shouldn't reach
    // into rows the vendor isn't looking at.
    setSelectedIds((prev) => {
      const visible = new Set(pageRows.map((r) => r.id));
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdsKey]);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllOnPage = () => {
    setSelectedIds((prev) => {
      const allSelected = pageRows.every((r) => prev.has(r.id));
      if (allSelected) return new Set();
      return new Set(pageRows.map((r) => r.id));
    });
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} expense${selectedIds.size === 1 ? "" : "s"}?`)) return;
    setBulkDeleting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const ids = Array.from(selectedIds);
    const { error } = await db.from("vendor_expenses").delete().in("id", ids);
    setBulkDeleting(false);
    if (error) {
      console.error("[ExpensesTab] bulk delete failed", error);
      toast.error("Couldn't delete the selected expenses.");
      return;
    }
    toast.success(`Deleted ${ids.length} expense${ids.length === 1 ? "" : "s"}.`);
    setSelectedIds(new Set());
    void refresh();
  };

  const exportCsv = () => {
    // CSV-formula-injection guard: a payee or description starting
    // with `=`, `+`, `-`, `@`, tab, or CR gets a single-quote prefix
    // so spreadsheets render it as a literal string instead of
    // evaluating a formula (CWE-1236).
    const esc = (v: string | number | null | undefined) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return /[,"\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
    };
    const header = ["Date", "Item", "Quantity", "Description", "Payee", "Amount", "Currency"];
    const lines = [header.join(",")];
    for (const r of filteredRows) {
      lines.push(
        [
          esc(r.occurred_on),
          esc(r.item_name ?? ""),
          esc(r.quantity ?? ""),
          esc(r.description),
          esc(r.paid_to ?? ""),
          esc((r.amount_cents / 100).toFixed(2)),
          esc((r.currency ?? "usd").toUpperCase()),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2
            className="text-2xl font-semibold tracking-tight"
            style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#2b2320" }}
          >
            Expenses
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Manual ledger of business costs, tracked against your revenue.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportCsv} variant="outline" size="sm" className="rounded-lg" disabled={filteredRows.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </Button>
          <Button onClick={startNew} size="sm" className="rounded-lg" disabled={!primaryVendorId}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New expense
          </Button>
        </div>
      </div>

      {/* KPI strip — YTD spend, this month, last 30 days, top item.
          All four tiles use the same white + foreground/10 border
          treatment; nothing is "primary" so no tile should hijack
          attention with a different background. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl px-4 py-3 bg-white border border-foreground/10">
          <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
            YTD spend
          </div>
          <div
            className="mt-1 text-[22px] font-semibold tabular-nums leading-none"
            style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#2b2320" }}
          >
            {formatMoney(kpis.ytdCents)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {kpis.ytdCount} transaction{kpis.ytdCount === 1 ? "" : "s"}
            {kpis.ytdRecurringCents > 0 ? (
              <> · <span className="tabular-nums">{formatMoney(kpis.ytdRecurringCents)}</span> recurring</>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-white border border-foreground/10">
          <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
            This month
          </div>
          <div
            className="mt-1 text-[22px] font-semibold tabular-nums leading-none"
            style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#2b2320" }}
          >
            {formatMoney(kpis.monthCents)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {new Date().toLocaleDateString("en-US", { month: "long" })} · {kpis.monthCount} transaction{kpis.monthCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-white border border-foreground/10">
          <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
            Last 30 days
          </div>
          <div
            className="mt-1 text-[22px] font-semibold tabular-nums leading-none"
            style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#2b2320" }}
          >
            {formatMoney(kpis.thirtyDayCents)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {kpis.thirtyDayCount} transaction{kpis.thirtyDayCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-white border border-foreground/10">
          <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
            Top item
          </div>
          <div
            className="mt-1 text-[22px] font-semibold leading-none truncate"
            style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#2b2320" }}
            title={kpis.topItem ? kpis.topItem[0] : undefined}
          >
            {kpis.topItem ? kpis.topItem[0] : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
            {kpis.topItem ? `${formatMoney(kpis.topItem[1])} · ${kpis.topItemPct}%` : "No expenses yet"}
          </div>
        </div>
      </div>

      {/* Toolbar — search, category filter, date-range preset. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">⌕</span>
          <input
            type="text"
            placeholder="Search item, payee, description, amount…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-foreground/10 bg-white text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <select
          value={rangePreset}
          onChange={(e) => setRangePreset(e.target.value as typeof rangePreset)}
          className="px-3 py-2 rounded-lg border border-foreground/10 bg-white text-sm min-w-[150px]"
        >
          <option value="last_12m">Last 12 months</option>
          <option value="ytd">Year to date</option>
          <option value="this_month">This month</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Bulk action bar — only visible with at least one row checked. */}
      {selectedIds.size > 0 ? (
        <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg text-white text-sm" style={{ background: "#2b2320" }}>
          <span className="font-semibold">
            {selectedIds.size} selected
          </span>
          <div className="ml-auto flex gap-3 items-center">
            <button
              type="button"
              onClick={exportCsv}
              className="text-[#f4c9c0] hover:text-white text-sm"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => void bulkDelete()}
              disabled={bulkDeleting}
              className="text-[#f4c9c0] hover:text-white text-sm disabled:opacity-50"
            >
              {bulkDeleting ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[#f4c9c0] hover:text-white text-sm ml-2"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {editing && (
        <Card>
          <div className="p-5 space-y-3">
            <h3 className="text-sm font-semibold">
              {editing === "new" ? "New expense" : "Edit expense"}
            </h3>
            {/* Listing picker intentionally removed — the cockpit is
                account-level, so vendors don't pick a listing per
                row. New expenses default to accountVendorIds[0]
                (handled in save()). */}
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
              <input
                type="text"
                placeholder="Item name (optional — e.g. Cement bags)"
                value={form.item_name}
                onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
              <input
                type="text"
                placeholder="Quantity (optional — e.g. 20 or 5 boxes)"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
              />
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
            {/* Recurring toggle — only on the New form. Edits go
                through the "Recurring expenses" panel below. */}
            {editing === "new" && (
              <div className="rounded-lg ring-1 ring-foreground/10 bg-background/40 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
                    className="cursor-pointer"
                  />
                  <span className="text-sm font-medium">Make this recurring</span>
                  <span className="text-[11px] text-muted-foreground">— auto-log this expense on a schedule</span>
                </label>
                {form.is_recurring && (
                  <div className="pl-6">
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                      Repeat
                    </label>
                    <select
                      value={form.recurring_interval}
                      onChange={(e) => setForm({ ...form, recurring_interval: e.target.value as RecurringInterval })}
                      className="w-full rounded-lg border-0 px-3 py-2 text-sm bg-background/60 ring-1 ring-foreground/10 focus:ring-foreground/30 outline-none"
                    >
                      {(Object.keys(RECURRING_INTERVAL_LABELS) as RecurringInterval[]).map((k) => (
                        <option key={k} value={k}>{RECURRING_INTERVAL_LABELS[k]}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Today's row is logged now. The next one auto-logs on {RECURRING_INTERVAL_LABELS[form.recurring_interval].toLowerCase()} cadence.
                    </p>
                  </div>
                )}
              </div>
            )}
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


      {loading ? (
        <EmptyCard>
          <Loader2 className="w-4 h-4 mr-2 inline animate-spin" />
          Loading…
        </EmptyCard>
      ) : rows.length === 0 ? (
        <EmptyCard>
          No expenses yet. Track rentals, supplies, gas, and any other business costs here to keep a
          full ledger of what you spend to run the business.
        </EmptyCard>
      ) : filteredRows.length === 0 ? (
        <EmptyCard>
          No expenses match the current search or filter. Adjust the controls above or clear them to see everything again.
        </EmptyCard>
      ) : (
        <div className="rounded-xl border border-foreground/10 bg-white overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-foreground/[0.03]">
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id))}
                    onChange={toggleAllOnPage}
                    aria-label="Select all rows on this page"
                    className="cursor-pointer"
                  />
                </th>
                <th
                  className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("date")}
                >
                  Date {sortField === "date" ? (
                    <span className="text-[#d94f3d] text-[9px]">{sortDir === "desc" ? "▼" : "▲"}</span>
                  ) : null}
                </th>
                <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Item
                </th>
                <th className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Qty
                </th>
                <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Description
                </th>
                <th className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Payee
                </th>
                <th
                  className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("amount")}
                >
                  Total {sortField === "amount" ? (
                    <span className="text-[#d94f3d] text-[9px]">{sortDir === "desc" ? "▼" : "▲"}</span>
                  ) : null}
                </th>
                <th className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((e) => (
                <tr key={e.id} className="border-t border-foreground/5 hover:bg-foreground/[0.02]">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleRow(e.id)}
                      aria-label={`Select expense ${e.description}`}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-3 text-sm text-foreground font-bold whitespace-nowrap tabular-nums">
                    {formatDate(e.occurred_on)}
                  </td>
                  <td className="px-3 py-3 text-sm text-foreground font-bold">
                    {e.item_name || "—"}
                  </td>
                  <td className="px-3 py-3 text-sm text-foreground font-bold text-right tabular-nums">
                    {e.quantity || "—"}
                  </td>
                  <td className="px-3 py-3 text-sm text-foreground font-bold">
                    <div className="flex items-center gap-1.5">
                      <span>{e.description}</span>
                      {e.recurring_rule_id ? (
                        <span
                          title="Auto-logged from a recurring rule"
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: "#f4ece7", color: "#7d5a4f" }}
                        >
                          <RotateCcw className="w-2.5 h-2.5" /> Recurring
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm text-foreground font-bold">
                    {e.paid_to || "—"}
                  </td>
                  <td className="px-3 py-3 text-sm text-foreground font-bold text-right tabular-nums whitespace-nowrap">
                    {formatMoney(e.amount_cents, e.currency)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        type="button"
                        onClick={() => startEdit(e)}
                        className="text-[#d94f3d] hover:underline text-sm font-medium"
                      >
                        Edit
                      </button>
                      <span aria-hidden className="text-foreground/15">|</span>
                      <button
                        type="button"
                        onClick={() => void remove(e)}
                        disabled={deletingId === e.id}
                        className="w-7 h-7 rounded-md text-muted-foreground hover:bg-foreground/5 inline-flex items-center justify-center disabled:opacity-50"
                        title="Delete"
                      >
                        {deletingId === e.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-foreground/10">
                <td colSpan={8} className="px-4 py-3">
                  <div className="flex justify-between items-center gap-3 flex-wrap text-xs text-muted-foreground">
                    <span>
                      Showing {pageRows.length} of {filteredRows.length} ·{" "}
                      {filteredRows.length < rows.length ? "Filtered total" : "Total"}{" "}
                      <span
                        className="text-foreground tabular-nums"
                        style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 600, fontSize: "14px" }}
                      >
                        {formatMoney(filteredTotal)}
                      </span>
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPage(Math.max(1, safePage - 1))}
                          disabled={safePage === 1}
                          className="w-7 h-7 rounded-md border border-foreground/10 disabled:opacity-30 hover:border-accent"
                        >
                          ‹
                        </button>
                        {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => {
                          const p = i + 1;
                          const active = p === safePage;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setPage(p)}
                              className={`min-w-[28px] h-7 px-2 rounded-md text-xs border ${active ? "bg-[#d94f3d] text-white border-[#d94f3d]" : "border-foreground/10 hover:border-accent"}`}
                            >
                              {p}
                            </button>
                          );
                        })}
                        {totalPages > 5 ? <span className="text-muted-foreground">…</span> : null}
                        <button
                          type="button"
                          onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                          disabled={safePage === totalPages}
                          className="w-7 h-7 rounded-md border border-foreground/10 disabled:opacity-30 hover:border-accent"
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
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
  const navigate = useNavigate();
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
      } else if (await handleEmailBillingError(sendErr, navigate)) {
        // Out of credits or email sending not enabled: invoice is
        // safely back to draft and the helper already showed the
        // right toast (top-up / enable). Vendor can resend from the
        // list once they've resolved it.
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

function DisputesTab({ accountVendorIds }: { accountVendorIds: string[] }) {
  // Disputes list aggregates across every listing on the account.
  // The "open in Stripe Express" button still targets one connected
  // account (Stripe's dashboard is per-account), so it falls back to
  // the primary listing for now.
  const primaryVendorId = accountVendorIds[0] ?? null;
  const accountKey = accountVendorIds.join(",");
  const [rows, setRows] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const refresh = useCallback(async () => {
    if (accountVendorIds.length === 0) {
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
      .in("vendor_id", accountVendorIds)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as Dispute[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Dispute responses happen on Stripe's side — we deep-link the
  // vendor into their Express dashboard for any action.
  const openExpress = useCallback(async () => {
    if (!primaryVendorId || opening) return;
    setOpening(true);
    const { data, error } = await supabase.functions.invoke(
      "vendorapay-dashboard-link",
      { body: { business_id: primaryVendorId } },
    );
    setOpening(false);
    if (error || !(data as { url?: string })?.url) {
      toast.error("Couldn't open Stripe dashboard", {
        description: error?.message ?? "Try again in a moment.",
      });
      return;
    }
    window.open((data as { url: string }).url, "_blank", "noopener,noreferrer");
  }, [primaryVendorId, opening]);

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
            disabled={!primaryVendorId || opening}
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
  accountVendorIds,
  listings,
  links,
  status,
  onChanged,
}: {
  accountVendorIds: string[];
  listings: ListingOpt[];
  links: PaymentLink[];
  status: Status | null;
  onChanged: () => void;
}) {
  // Default "home" listing for a new link, but the form lets the
  // vendor override per-link via ListingPickerField below.
  const defaultVendorId = accountVendorIds[0] ?? null;
  const [pickedVendorId, setPickedVendorId] = useState<string | null>(defaultVendorId);
  // Keep pickedVendorId valid as the account changes.
  useEffect(() => {
    if (pickedVendorId && accountVendorIds.includes(pickedVendorId)) return;
    setPickedVendorId(defaultVendorId);
  }, [defaultVendorId, accountVendorIds, pickedVendorId]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [description, setDescription] = useState("");
  const [splitDeposit, setSplitDeposit] = useState(false);
  const [depositDollars, setDepositDollars] = useState("");
  const [balanceDueDate, setBalanceDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const create = useCallback(async () => {
    const targetVendorId = pickedVendorId ?? defaultVendorId;
    if (!targetVendorId || submitting) return;
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
      // Deposit must be >= $0.50 AND leave a balance of >= $0.50 — both
      // links hit payment_links' CHECK (amount_cents >= 50). Without the
      // upper bound, a deposit within 49¢ of the total produces a sub-50¢
      // balance: the deposit link inserts fine, then the balance insert
      // fails the constraint, orphaning the deposit link.
      if (!Number.isFinite(depositCents) || depositCents < 50 || depositCents > totalCents - 50) {
        toast.error("Deposit must be at least $0.50 and leave at least $0.50 for the balance");
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
        vendor_id: targetVendorId,
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
          vendor_id: targetVendorId,
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
        vendor_id: targetVendorId,
        title: `${title.trim()} — balance`,
        description: description.trim() || null,
        amount_cents: balanceCents,
        status: "scheduled",
        activate_at: balanceDueIso,
        parent_link_id: depositRow.id,
        created_by: userData.user.id,
      });
      if (balErr) {
        // The two inserts aren't a transaction. If the balance leg
        // fails, roll back the deposit link so the vendor doesn't end
        // up with a live half-schedule (a deposit with no balance to
        // follow). payment_links has no client DELETE policy, so cancel
        // it instead (admin UPDATE is allowed; 'cancelled' isn't a
        // settled state so the settlement-protect trigger permits it).
        // It's still 'active' and unpaid, so cancelling is safe.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("payment_links")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", depositRow.id)
          .eq("status", "active");
        setSubmitting(false);
        toast.error("Couldn't create balance link", { description: balErr.message });
        return;
      }
      setSubmitting(false);
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
    pickedVendorId,
    defaultVendorId,
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
            {/* Listing picker removed — account-level cockpit means
                we default new links to defaultVendorId (see create())
                without asking the vendor to pick. */}
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
  status: primaryStatus,
  accountVendorIds,
  listings,
  tier,
  tierLoading,
}: {
  status: Status | null;
  accountVendorIds: string[];
  listings: ListingOpt[];
  tier: VendorTier;
  tierLoading: boolean;
}) {
  // Per-listing picker. KYC + bank verification + the Stripe Express
  // dashboard link are all scoped to one connected account, so this
  // tab lets the vendor switch which listing's settings they're
  // looking at. The picker is populated from vendor_payment_secrets
  // (only listings that actually have a stripe_account_id show up;
  // a listing without VendoraPay onboarding has no settings to
  // manage). The primary listing (accountVendorIds[0]) is selected
  // by default and reuses the status the parent already fetched;
  // selecting any other listing triggers a per-account vendorapay-
  // status fetch.
  const primaryId = accountVendorIds[0] ?? null;
  const fee = TIER_FEE_COPY[tier];
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(primaryId);
  const [localStatus, setLocalStatus] = useState<Status | null>(primaryStatus);
  const [statusLoading, setStatusLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const accountKey = accountVendorIds.join(",");

  // Find every listing that's actually onboarded to VendoraPay.
  useEffect(() => {
    if (accountVendorIds.length === 0) {
      setConnectedIds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_payment_secrets")
        .select("vendor_id, stripe_account_id")
        .in("vendor_id", accountVendorIds)
        .not("stripe_account_id", "is", null);
      if (cancelled) return;
      setConnectedIds(((data ?? []) as Array<{ vendor_id: string }>).map((r) => r.vendor_id));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey]);

  // Keep selectedId valid as the account / primary changes.
  useEffect(() => {
    if (selectedId && accountVendorIds.includes(selectedId)) return;
    setSelectedId(primaryId);
  }, [primaryId, accountVendorIds, selectedId]);

  // Sync localStatus: primary listing reuses parent's fetched
  // status (no extra round-trip); any other listing fetches its
  // own status on demand.
  useEffect(() => {
    if (!selectedId) {
      setLocalStatus(null);
      return;
    }
    if (selectedId === primaryId) {
      setLocalStatus(primaryStatus);
      return;
    }
    let cancelled = false;
    setStatusLoading(true);
    (async () => {
      const { data } = await supabase.functions.invoke("vendorapay-status", {
        body: { business_id: selectedId },
      });
      if (cancelled) return;
      setLocalStatus((data as Status | null) ?? null);
      setStatusLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, primaryId, primaryStatus]);

  // The rest of the component (cards below) reads from `status` —
  // alias it to the locally-resolved one so existing markup is
  // unchanged.
  const status = localStatus;
  const vendorId = selectedId;

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
      {/* Listing picker — Settings is per-connected-account, so the
          vendor explicitly chooses which listing's KYC + bank +
          Stripe Express link they're managing. Only listings with
          VendoraPay actually onboarded show up in the dropdown; the
          rest have no settings to manage and live behind a "Connect
          VendoraPay" CTA on the Overview banner instead. */}
      {connectedIds.length > 0 ? (
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
            Listing
          </h2>
          <Card>
            <div className="p-4 flex items-center gap-3 flex-wrap">
              <label className="text-xs text-muted-foreground shrink-0" htmlFor="settings-listing-picker">
                Managing
              </label>
              <select
                id="settings-listing-picker"
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value || null)}
                className="text-sm rounded-lg border border-foreground/10 bg-background px-3 py-1.5 max-w-full"
              >
                {connectedIds.map((id) => {
                  const l = listings.find((x) => x.id === id);
                  const label =
                    l?.business_name?.trim() ||
                    [l?.category, l?.location].filter(Boolean).join(" · ") ||
                    id.slice(0, 8);
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
              {statusLoading ? (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading…
                </span>
              ) : null}
            </div>
          </Card>
        </section>
      ) : null}

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

// Small dropdown rendered inside every "create a new X" form on the
// cockpit so the vendor explicitly picks which listing the new row
// (invoice / customer / pay link / expense / contractor / block
// date / etc.) is attached to. Returns null when the account only
// has one listing — there's no decision to make. Label is rendered
// above the select for forms that want it; pass `inline` to render
// label + select on one row instead.
function ListingPickerField({
  accountVendorIds,
  listings,
  value,
  onChange,
  label = "For listing",
  inline = false,
}: {
  accountVendorIds: string[];
  listings: ListingOpt[];
  value: string | null;
  onChange: (next: string) => void;
  label?: string;
  inline?: boolean;
}) {
  if (accountVendorIds.length <= 1) return null;
  const options = accountVendorIds
    .map((id) => {
      const l = listings.find((x) => x.id === id);
      const name =
        l?.business_name?.trim() ||
        [l?.category, l?.location].filter(Boolean).join(" · ") ||
        id.slice(0, 8);
      return { id, name };
    });
  const select = (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm rounded-lg border border-foreground/10 bg-background px-2 py-1.5 max-w-full"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
  if (inline) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        {select}
      </div>
    );
  }
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground block mb-1">{label}</span>
      {select}
    </label>
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
