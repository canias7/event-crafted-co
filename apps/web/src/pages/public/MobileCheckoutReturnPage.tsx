import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Bounce page for Stripe redirects launched from the mobile apps.
//
// Stripe Checkout / the customer portal need an https success_url,
// but the purchase started inside the app's in-app browser session
// (expo-web-browser openAuthSessionAsync). Landing here, we redirect
// to the app's custom URL scheme, which closes the in-app browser
// and hands control back to the subscription screen. The screen then
// reconciles state via stripe-sync-subscription, so even if the
// deep link never fires (old build without the scheme, desktop
// browser, etc.) the purchase still lands — this page is UX, not
// the source of truth.
//
// The `app` query param picks the scheme from a whitelist — never a
// caller-supplied URL, so this can't be abused as an open redirect.
const APP_SCHEMES: Record<string, string> = {
  vendor: "vendora-vendor",
  host: "vendora-host",
};

export default function MobileCheckoutReturnPage() {
  const [search] = useSearchParams();
  const { t } = useTranslation("checkout");

  // `outcome` picks the headline + body in checkout.json → mobileReturn.
  const { deepLink, outcome } = useMemo(() => {
    const scheme = APP_SCHEMES[search.get("app") ?? ""] ?? APP_SCHEMES.vendor;
    // Forward every flag except `app` so the mobile screen can read
    // the same upgraded/topup/cancelled params the web page uses.
    const forwarded = new URLSearchParams(search);
    forwarded.delete("app");
    const qs = forwarded.toString();
    const link = `${scheme}://checkout-return${qs ? `?${qs}` : ""}`;

    let outcome = "done";
    if (search.get("upgraded")) {
      outcome = "upgraded";
    } else if (search.get("topup")) {
      outcome = "topup";
    } else if (search.get("cancelled") || search.get("topup_cancelled")) {
      outcome = "cancelled";
    } else if (search.get("portal")) {
      outcome = "portal";
    }
    return { deepLink: link, outcome };
  }, [search]);
  const headline = t(`mobileReturn.${outcome}.title`);
  const body = t(`mobileReturn.${outcome}.body`);

  // Fire the deep link automatically; inside openAuthSessionAsync the
  // scheme navigation closes the browser sheet. The button below is
  // the fallback for browsers that block automatic scheme navigation.
  useEffect(() => {
    window.location.replace(deepLink);
  }, [deepLink]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <h1 className="font-editorial text-3xl">{headline}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        <a
          href={deepLink}
          className="inline-flex items-center justify-center rounded-full bg-gold text-foreground text-sm font-bold px-6 hover:bg-gold-hover h-11"
        >
          {t("mobileReturn.open")}
        </a>
        <p className="text-xs text-muted-foreground">
          {t("mobileReturn.hint")}
        </p>
      </div>
    </div>
  );
}
