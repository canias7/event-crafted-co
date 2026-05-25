// VendoraPay checkout — the host pays a proposal here.
//
// Lives at /pay/:proposalId. Flow:
//   1. Load the proposal under the host's RLS to display amount +
//      vendor name. Block + bail if status isn't 'accepted' or
//      payment_status is already 'paid_in_full'.
//   2. Call vendorapay-charge with a client-generated idempotency
//      key so double-clicks don't double-charge. Get back a
//      client_secret.
//   3. Mount Stripe Elements <PaymentElement /> against that
//      client_secret. The card form lives INSIDE our app — no
//      Stripe-hosted page — but is themed to match VendoraPay's
//      glassy cream/orange palette.
//   4. On submit, stripe.confirmPayment() handles 3DS + card auth.
//      Stripe redirects to ?vendorapay_payment=success which the
//      page reads to show a confirmation card.
//   5. vendorapay-webhook fires payment.succeeded in parallel,
//      flipping proposal.payment_status in the DB. The host sees
//      the success card immediately; the proposal state is
//      eventually consistent via webhook.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { ArrowLeft, Check, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Publishable key (safe to embed; Stripe's PK is meant for browsers).
// Set VITE_STRIPE_PUBLISHABLE_KEY in .env / Vercel project settings.
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
  | string
  | undefined;
const stripePromise: Promise<StripeJs | null> = STRIPE_PUBLISHABLE_KEY
  ? loadStripe(STRIPE_PUBLISHABLE_KEY)
  : Promise.resolve(null);

interface ProposalSummary {
  id: string;
  title: string;
  subtotal_cents: number;
  deposit_cents: number | null;
  payment_status: string;
  status: string;
  vendor: { business_name: string | null } | null;
}

type Mode = "full" | "deposit";

export default function VendoraPayCheckoutPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const successFlag = search.get("vendorapay_payment");

  const [proposal, setProposal] = useState<ProposalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("full");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [chargeAmount, setChargeAmount] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  // Idempotency key: stable for the lifetime of the page, regenerated
  // when the host changes the mode (full vs deposit) so each amount
  // gets its own key.
  const idempotencyKey = useMemo(
    () => `${crypto.randomUUID()}:${mode}`,
    [proposalId, mode],
  );

  // Hold onto a ref so we don't create a PaymentIntent twice on the
  // initial render under React Strict mode.
  const initialChargeFiredRef = useRef(false);

  useEffect(() => {
    if (!proposalId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase as any)
        .from("proposals")
        .select(
          "id, title, subtotal_cents, deposit_cents, payment_status, status, vendor:vendor_profiles!proposals_vendor_id_fkey(business_name)",
        )
        .eq("id", proposalId)
        .maybeSingle();
      if (cancelled) return;
      if (e || !data) {
        setError("Proposal not found or no longer available.");
        setLoading(false);
        return;
      }
      setProposal(data as ProposalSummary);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  // Once we know the proposal, mint a PaymentIntent for the chosen mode.
  useEffect(() => {
    if (!proposal || successFlag) return;
    if (proposal.status !== "accepted") return;
    if (proposal.payment_status === "paid_in_full") return;
    if (initialChargeFiredRef.current) return;
    initialChargeFiredRef.current = true;
    void createIntent(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, successFlag]);

  async function createIntent(nextMode: Mode) {
    setCreating(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.functions.invoke(
        "vendorapay-charge",
        {
          body: {
            proposal_id: proposalId,
            mode: nextMode,
            idempotency_key: idempotencyKey,
          },
        },
      );
      if (e) throw e;
      const row = data as {
        client_secret?: string;
        amount_cents?: number;
        error?: string;
      };
      if (row.error) throw new Error(row.error);
      if (!row.client_secret) throw new Error("missing client_secret");
      setClientSecret(row.client_secret);
      setChargeAmount(row.amount_cents ?? null);
    } catch (err) {
      console.error("[VendoraPayCheckout] createIntent failed", err);
      setError(
        err instanceof Error ? err.message : "Couldn't start the payment.",
      );
    } finally {
      setCreating(false);
    }
  }

  if (!user) {
    return (
      <Wrapper>
        <p className="text-sm text-muted-foreground">
          Sign in to pay.
        </p>
      </Wrapper>
    );
  }

  if (successFlag) {
    return (
      <Wrapper>
        <SuccessCard
          onDone={() => navigate("/customer/inquiries")}
        />
      </Wrapper>
    );
  }

  if (loading) {
    return (
      <Wrapper>
        <Skeleton className="h-32 w-full rounded-2xl" />
      </Wrapper>
    );
  }
  if (error && !proposal) {
    return (
      <Wrapper>
        <p className="text-sm text-destructive">{error}</p>
      </Wrapper>
    );
  }
  if (!proposal) return null;

  if (proposal.status !== "accepted") {
    return (
      <Wrapper>
        <p className="text-sm text-muted-foreground">
          This proposal isn't ready for payment yet.
        </p>
      </Wrapper>
    );
  }
  if (proposal.payment_status === "paid_in_full") {
    return (
      <Wrapper>
        <p className="text-sm text-foreground">This proposal is paid in full.</p>
      </Wrapper>
    );
  }

  const remaining =
    proposal.subtotal_cents -
    (proposal.payment_status === "deposit_paid"
      ? (proposal.deposit_cents ?? 0)
      : 0);

  return (
    <Wrapper>
      {/* Pay-mode selector — full balance vs. deposit only. Switching
          mints a new PaymentIntent so the amount + Elements UI re-renders. */}
      {proposal.deposit_cents && proposal.payment_status !== "deposit_paid" ? (
        <div
          className="inline-flex items-center gap-1 rounded-full bg-secondary/40 p-1 self-start text-xs"
        >
          <ModeChip
            active={mode === "full"}
            onClick={() => {
              setMode("full");
              setClientSecret(null);
              initialChargeFiredRef.current = false;
              void createIntent("full");
            }}
            label={`Pay in full · $${(proposal.subtotal_cents / 100).toLocaleString()}`}
          />
          <ModeChip
            active={mode === "deposit"}
            onClick={() => {
              setMode("deposit");
              setClientSecret(null);
              initialChargeFiredRef.current = false;
              void createIntent("deposit");
            }}
            label={`Deposit only · $${((proposal.deposit_cents ?? 0) / 100).toLocaleString()}`}
          />
        </div>
      ) : null}

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "rgba(255,253,250,0.7)",
          border: "0.5px solid rgba(255,138,76,0.22)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 8px 28px -12px rgba(196,84,30,0.18)",
        }}
      >
        <div className="p-5 md:p-6 border-b" style={{ borderColor: "rgba(255,138,76,0.18)" }}>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Paying
          </p>
          <h2 className="font-editorial text-2xl mt-1">{proposal.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {proposal.vendor?.business_name ?? "Vendor"}
          </p>
          <div className="flex items-baseline gap-2 mt-4">
            <span className="text-3xl font-semibold tnum">
              ${((chargeAmount ?? remaining) / 100).toLocaleString()}
            </span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              USD
            </span>
          </div>
        </div>

        <div className="p-5 md:p-6">
          {!STRIPE_PUBLISHABLE_KEY ? (
            <p className="text-sm text-destructive">
              VendoraPay not configured (missing publishable key). Contact support.
            </p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : creating || !clientSecret ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              Preparing secure checkout…
            </div>
          ) : (
            <Elements
              key={clientSecret}
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: "stripe",
                  variables: {
                    colorPrimary: "#c4541e",
                    colorBackground: "#fffdfa",
                    colorText: "#1a0d08",
                    colorTextSecondary: "#6b5a4f",
                    colorDanger: "#dc2626",
                    fontFamily: "system-ui, sans-serif",
                    borderRadius: "12px",
                  },
                },
              }}
            >
              <CheckoutForm proposalId={proposal.id} />
            </Elements>
          )}
        </div>

        <div
          className="px-5 md:px-6 py-3 flex items-center gap-2 text-[11px] text-muted-foreground border-t"
          style={{ borderColor: "rgba(255,138,76,0.18)" }}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Payments processed by VendoraPay · Card statement will read
          VENDORAPAY
        </div>
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen vendor-canvas">
      <main id="main-content" className="flex-1 pb-20">
        <div className="px-4 md:px-8 py-5 sticky top-0 z-40 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <h1 className="font-editorial text-3xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            VendoraPay
          </h1>
          <p className="text-sm text-muted-foreground">
            Secure payment for your event.
          </p>
        </div>
        <div className="p-4 md:p-8 max-w-xl space-y-4">{children}</div>
      </main>
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 font-semibold transition-colors ${
        active
          ? "bg-foreground text-background"
          : "text-foreground/70 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function CheckoutForm({ proposalId }: { proposalId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Stripe redirects here with vendorapay_payment=success (or
        // failed) appended. The page reads the flag on mount.
        return_url: `${window.location.origin}/pay/${proposalId}?vendorapay_payment=success`,
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message ?? "Payment failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement />
      <Button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-11"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : null}
        Pay now
      </Button>
    </form>
  );
}

function SuccessCard({ onDone }: { onDone: () => void }) {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: "rgba(255,253,250,0.7)",
        border: "0.5px solid rgba(255,138,76,0.22)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="w-14 h-14 mx-auto rounded-full inline-flex items-center justify-center mb-4"
        style={{
          background: "rgba(34,197,94,0.15)",
          color: "#0a7c4a",
        }}
      >
        <Check className="w-6 h-6" />
      </div>
      <h2 className="font-editorial text-2xl mb-1">Payment received</h2>
      <p className="text-sm text-muted-foreground mb-5">
        We're confirming with your vendor now. You'll get a receipt by email.
      </p>
      <Button
        onClick={onDone}
        className="rounded-full bg-foreground text-background hover:bg-foreground/90"
      >
        Back to my inquiries
      </Button>
    </div>
  );
}
