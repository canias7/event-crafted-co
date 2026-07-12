// Deep-link target for Stripe redirects (vendora-vendor://checkout-return).
//
// Normally expo-web-browser's auth session intercepts this URL and the
// subscription screen handles the rest — this route only renders when
// the link arrives through the OS instead (e.g. the user tapped "Open
// the app" on the web bounce page after the browser sheet was already
// dismissed). Just land them back on the subscription screen, which
// re-syncs plan state on focus.
import { Redirect } from "expo-router";

export default function CheckoutReturn() {
  return <Redirect href="/(vendor)/subscription" />;
}
