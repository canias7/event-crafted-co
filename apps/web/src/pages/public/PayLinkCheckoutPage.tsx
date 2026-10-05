// VendoraPay public pay-link checkout. Hosts land here from a link
// the vendor shared (/pay/link/<slug>). No auth required.
//
// Renders the vendor's brand + amount + description, then collects card
// details RIGHT HERE via Stripe's embedded Payment Element — no redirect
// to checkout.stripe.com. Flow:
//   1. Load the link via get_payment_link_for_checkout (no JWT) to show
//      brand / amount / title.
//   2. When the link is active, call vendorapay-link-intent (no JWT) to
//      mint a PaymentIntent (destination charge + platform fee) and get
//      back a client_secret + publishable key.
//   3. Mount <Elements>/<PaymentElement> against that client_secret and
//      confirm the payment in-page. Stripe redirects back here with
//      ?status=success on completion.
//   4. vendorapay-webhook flips the link to paid via metadata correlation.
//
// Fallback: if the embedded path isn't configured (no publishable key on
// the edge function → use_hosted:true) or the intent can't be minted, we
// fall back to the original hosted Checkout Session redirect so payments
// never break.
//
// States: loading / not-found / expired / cancelled / paid / scheduled /
// active (embedded form, or hosted-redirect fallback).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Check, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface LinkDetails {
  id: string;
  vendor_id: string;
  title: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  vendor_business_name: string | null;
  vendor_logo_url: string | null;
  collect_contact?: boolean | null;
}

interface IntentResult {
  use_hosted?: boolean;
  client_secret?: string;
  publishable_key?: string;
}

// The publishable key is browser-safe. The web app already ships one for
// the proposal Payment Element; reuse it so the embedded pay-link flow
// needs no new server secret. The edge function may also return one.
const WEB_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
  | string
  | undefined;

// loadStripe must be called outside render and cached per publishable key
// so we don't reinitialize Stripe.js on every render. Keyed cache because
// the key arrives asynchronously from the edge function.
const stripeCache = new Map<string, Promise<StripeJs | null>>();
function stripeFor(pk: string): Promise<StripeJs | null> {
  let p = stripeCache.get(pk);
  if (!p) {
    p = loadStripe(pk);
    stripeCache.set(pk, p);
  }
  return p;
}

// Money stays en-US in both languages: "$1,234.50" is also how US
// Spanish writes it.
function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

// Checkout-start failures. English shows the server's text as before;
// Spanish gets a translated line (checkout.json → startError), with
// its own wording for the server errors a payer can actually hit.
const START_ERRORS = new Map([
  ["vendor not ready to receive payments", "vendorNotReady"],
  ["rate_limited", "rateLimited"],
]);

function startErrorDetail(t: TFunction, detail: string | null): string {
  if (detail === null) return t("startError.tryAgain");
  return t(`startError.${START_ERRORS.get(detail) ?? "detail"}`, { detail });
}

export default function PayLinkCheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation("checkout");
  const [searchParams] = useSearchParams();
  // Stripe appends redirect_status (succeeded | failed | pending) when it
  // returns from a redirect-based method (e.g. 3DS). Only treat the
  // ?status=success return as paid when Stripe didn't tell us it failed —
  // otherwise a failed 3DS would flash a false "Payment received". The
  // webhook remains the source of truth (link.status === "paid").
  const flow = searchParams.get("status");
  const redirectStatus = searchParams.get("redirect_status");
  const paidFlow = flow === "success" && redirectStatus !== "failed";

  const [link, setLink] = useState<LinkDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Embedded checkout state.
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [intentLoading, setIntentLoading] = useState(false);
  const [useHosted, setUseHosted] = useState(false);
  const intentFiredRef = useRef(false);

  // Hosted-redirect fallback state.
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!slug) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "get_payment_link_for_checkout",
        { p_slug: slug },
      );
      if (cancelled) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setLink(row as LinkDetails);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Once the link is known and active (and not a post-payment return),
  // mint a PaymentIntent for the embedded Payment Element.
  useEffect(() => {
    if (!slug || !link || paidFlow) return;
    if (link.status !== "active") return;
    if (intentFiredRef.current) return;
    intentFiredRef.current = true;

    let cancelled = false;
    (async () => {
      setIntentLoading(true);
      const { data, error } = await supabase.functions.invoke(
        "vendorapay-link-intent",
        { body: { slug } },
      );
      if (cancelled) return;
      const res = (data ?? {}) as IntentResult;
      // Prefer the edge function's key, else the web app's own. Embedded
      // checkout only needs a client_secret + some publishable key.
      const pk = res.publishable_key || WEB_PUBLISHABLE_KEY;
      // Any failure, or no usable key anywhere, falls back to the hosted
      // Checkout Session redirect so payment still works.
      if (error || res.use_hosted || !res.client_secret || !pk) {
        setUseHosted(true);
        setIntentLoading(false);
        return;
      }
      setClientSecret(res.client_secret);
      setPublishableKey(pk);
      setIntentLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, link, paidFlow]);

  // Hosted Checkout Session redirect — fallback path only.
  const handleHostedPay = useCallback(async () => {
    if (!slug || paying) return;
    setPaying(true);
    const { data, error } = await supabase.functions.invoke("vendorapay-link-checkout", {
      body: { slug },
    });
    if (error || !(data as { url?: string })?.url) {
      // null = nothing from the server ("Try again in a moment.").
      let detail: string | null = null;
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
      toast.error(t("startError.title"), {
        description: startErrorDetail(t, detail),
      });
      setPaying(false);
      return;
    }
    window.location.href = (data as { url: string }).url;
  }, [slug, paying, t]);

  const stripePromise = useMemo(
    () => (publishableKey ? stripeFor(publishableKey) : null),
    [publishableKey],
  );

  // Stripe.js can fail to load — blocked by a privacy extension
  // (Brave Shields, uBlock) or a flaky network — in which case
  // loadStripe(pk) resolves to null and <PaymentElement> can never
  // mount, leaving the page on an infinite spinner. Watch the promise:
  // if it resolves null (or hasn't resolved in 8s), fall back to the
  // hosted Checkout redirect, which doesn't depend on us loading
  // Stripe.js in this page.
  useEffect(() => {
    if (!stripePromise || useHosted) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setUseHosted(true);
    }, 8000);
    stripePromise
      .then((s) => {
        if (cancelled) return;
        if (!s) setUseHosted(true);
        else clearTimeout(timer);
      })
      .catch(() => {
        if (!cancelled) setUseHosted(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stripePromise, useHosted]);

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (notFound || !link) {
    return (
      <Shell>
        <Centered
          title={t("payLink.notFound.title")}
          sub={t("payLink.notFound.body")}
        />
      </Shell>
    );
  }

  if (paidFlow || link.status === "paid") {
    return (
      <Shell>
        <Centered
          icon={<Check className="w-7 h-7 text-accent" />}
          title={t("payLink.paid.title")}
          sub={t("payLink.paid.body", {
            vendor: link.vendor_business_name ?? t("payLink.paid.yourVendor"),
          })}
        />
      </Shell>
    );
  }

  if (link.status === "cancelled") {
    return (
      <Shell>
        <Centered
          title={t("payLink.cancelled.title")}
          sub={t("payLink.cancelled.body", {
            vendor: link.vendor_business_name ?? t("payLink.cancelled.theVendor"),
          })}
        />
      </Shell>
    );
  }

  if (link.status === "expired") {
    return (
      <Shell>
        <Centered
          title={t("payLink.expired.title")}
          sub={
            link.vendor_business_name != null
              ? t("payLink.expired.bodyVendor", { vendor: link.vendor_business_name })
              : t("payLink.expired.body")
          }
        />
      </Shell>
    );
  }

  if (link.status === "scheduled") {
    return (
      <Shell>
        <Centered
          title={t("payLink.scheduled.title")}
          sub={t("payLink.scheduled.body")}
        />
      </Shell>
    );
  }

  // active — render checkout
  const expired = link.status !== "active";

  return (
    <Shell>
      <div className="max-w-md mx-auto px-4 py-12">
        {/* Vendor brand */}
        <div className="flex items-center gap-3 mb-8">
          {link.vendor_logo_url ? (
            <img
              src={link.vendor_logo_url}
              alt={link.vendor_business_name ?? ""}
              className="w-12 h-12 rounded-full object-cover ring-1 ring-foreground/10"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-foreground/5 inline-flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {link.vendor_business_name ?? "VendoraPay"}
            </div>
            <div className="text-[11px] text-muted-foreground">{t("payLink.poweredBy")}</div>
          </div>
        </div>

        {/* Amount + title */}
        <div
          className="rounded-2xl p-6 mb-4"
          style={{
            background: "rgba(255,255,255,0.6)",
            border: "0.5px solid rgba(0,0,0,0.08)",
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            {t("payLink.amountDue")}
          </div>
          <div className="text-4xl font-editorial mt-1">
            {formatMoney(link.amount_cents, link.currency)}
          </div>
          <div className="text-sm mt-3">{link.title}</div>
          {link.description ? (
            <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
              {link.description}
            </p>
          ) : null}
        </div>

        {/* Payment */}
        {expired ? (
          <div className="text-center text-sm text-muted-foreground">
            {t("payLink.inactive")}
          </div>
        ) : useHosted ? (
          // Fallback: hosted Stripe Checkout redirect.
          <Button
            onClick={handleHostedPay}
            disabled={paying}
            className="w-full rounded-full h-12 text-base"
          >
            {paying ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4 mr-2" />
            )}
            {t("payLink.pay", { amount: formatMoney(link.amount_cents, link.currency) })}
          </Button>
        ) : intentLoading || !clientSecret || !stripePromise ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("payLink.preparing")}
          </div>
        ) : (
          // Embedded Stripe Payment Element — themed to the brand palette.
          <Elements
            key={clientSecret}
            stripe={stripePromise}
            options={{
              clientSecret,
              // Card form labels and Stripe's own error messages in the
              // page's language ("auto", the default, in English).
              locale: i18n.resolvedLanguage === "es" ? "es-419" : "auto",
              fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" }],
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#14161a",
                  colorBackground: "#ffffff",
                  colorText: "#14161a",
                  colorTextSecondary: "#14161a",
                  colorDanger: "#b23a34",
                  fontFamily: "'Libre Baskerville', Georgia, 'Times New Roman', serif",
                  borderRadius: "12px",
                },
              },
            }}
          >
            <PayForm
              slug={slug!}
              amountLabel={formatMoney(link.amount_cents, link.currency)}
              collectContact={Boolean(link.collect_contact)}
              onNeedsHosted={() => setUseHosted(true)}
            />
          </Elements>
        )}

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          {t("payLink.statement")}
        </p>
      </div>
    </Shell>
  );
}

// Embedded card form. Confirms the PaymentIntent in-page and redirects
// back to this route with ?status=success on completion.
function PayForm({
  slug,
  amountLabel,
  collectContact,
  onNeedsHosted,
}: {
  slug: string;
  amountLabel: string;
  collectContact: boolean;
  onNeedsHosted: () => void;
}) {
  const { t } = useTranslation("checkout");
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  // Gate the Pay button on the PaymentElement actually mounting. Clicking
  // before it's ready makes confirmPayment throw "elements should have a
  // mounted Payment Element" (an unhandled rejection that hung the button
  // spinning forever). If the element never loads, escalate to hosted.
  const [ready, setReady] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !ready || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/pay/link/${slug}?status=success`,
        },
      });
      // Reached only if confirmPayment fails immediately (validation, card
      // declined without redirect). On success Stripe navigates away.
      if (error) {
        toast.error(error.message ?? t("payLink.toast.paymentFailed"));
      }
    } catch (err) {
      // A thrown error (e.g. element not mounted) must never leave the
      // button stuck spinning.
      console.error("[PayLinkCheckout] confirmPayment threw", err);
      toast.error(t("payLink.toast.processError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement
        options={{
          // Collect the host's name + phone in-form when the vendor
          // opted in. 'auto' makes Stripe render AND submit them with the
          // charge automatically — no manual confirmParams.payment_method_data
          // needed (which 'never' would require, and getting that wrong
          // throws at confirm). Webhook reads them off billing_details.
          fields: collectContact
            ? { billingDetails: { name: "auto", phone: "auto" } }
            : undefined,
        }}
        onReady={() => setReady(true)}
        onLoadError={(e) => {
          // The Element couldn't load (network, blocked script, bad
          // config). Fall back to hosted checkout so the host can still pay.
          console.error("[PayLinkCheckout] PaymentElement load error", e);
          onNeedsHosted();
        }}
      />
      {!ready ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("payLink.loadingForm")}
        </div>
      ) : null}
      <Button
        type="submit"
        disabled={!stripe || !ready || submitting}
        className="w-full rounded-full h-12 text-base"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <CreditCard className="w-4 h-4 mr-2" />
        )}
        {t("payLink.pay", { amount: amountLabel })}
      </Button>
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="w-3.5 h-3.5" />
        {t("payLink.secured")}
      </div>
    </form>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen vendor-canvas">
      {children}
    </div>
  );
}

function Centered({
  icon,
  title,
  sub,
}: {
  icon?: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      {icon ? (
        <div className="w-14 h-14 rounded-full bg-pending inline-flex items-center justify-center mb-4">
          {icon}
        </div>
      ) : null}
      <h1 className="font-editorial text-2xl">{title}</h1>
      <p className="text-sm text-muted-foreground mt-2">{sub}</p>
    </div>
  );
}
