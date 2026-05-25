// Renders the payment options a vendor has connected in their
// Integrations settings as tappable buttons on the host side
// (inquiry detail / vendor profile). Each button deep-links
// straight to the right app or web flow so the host can pay
// the vendor directly — Vendora isn't in the money path.
//
// Supports Stripe Connect (when the vendor has a connected
// stripe_account_id, host gets a "Pay with Stripe" button that
// opens the vendor's Stripe-hosted payment link / invoice flow
// — actual checkout-link generation is out of scope here and a
// follow-up) and the five handle-based services (Square, PayPal,
// Venmo, Cash App, Zelle).
//
// Empty state: nothing rendered if the vendor hasn't connected
// anything. Host UI doesn't show a "Payment options" header in
// that case — it just isn't there.

import { ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export interface VendorPaymentInfo {
  // Stripe Connect account ID. Presence = vendor has gone through
  // Stripe Express onboarding. UI doesn't expose the ID — just
  // surfaces a "Pay with card" button that the host clicks. The
  // actual charge link is the vendor's responsibility for now
  // (they create an invoice in their own Stripe dashboard and
  // share it); future PR will wire a one-click Connect destination
  // checkout.
  stripe_account_id: string | null;
  payment_handles: Partial<{
    square: string;
    paypal: string;
    venmo: string;
    cashapp: string;
    zelle: string;
  }> | null;
}

interface ButtonSpec {
  key: string;
  label: string;
  bg: string;
  fg: string;
  href?: string;
  copyText?: string;
  copyLabel?: string;
}

function stripAt(s: string) {
  return s.replace(/^@+/, "");
}
function stripDollar(s: string) {
  return s.replace(/^\$+/, "");
}

function buildButtons(info: VendorPaymentInfo): ButtonSpec[] {
  const out: ButtonSpec[] = [];
  const h = info.payment_handles ?? {};

  if (info.stripe_account_id) {
    out.push({
      key: "stripe",
      label: "Pay with card (Stripe)",
      bg: "#635bff",
      fg: "#ffffff",
    });
  }

  if (h.square) {
    const s = h.square.trim();
    const href = /^https?:\/\//i.test(s)
      ? s
      : /^square\.link\//i.test(s)
        ? `https://${s}`
        : undefined;
    out.push({
      key: "square",
      label: "Pay with Square",
      bg: "#000000",
      fg: "#ffffff",
      href,
      copyText: !href ? s : undefined,
      copyLabel: !href ? "Copy Square handle" : undefined,
    });
  }

  if (h.paypal) {
    const p = h.paypal.trim();
    let href: string | undefined;
    if (/^https?:\/\//i.test(p)) href = p;
    else if (/^paypal\.me\//i.test(p)) href = `https://${p}`;
    else if (/@/.test(p))
      href = `https://www.paypal.com/paypalme/${p.split("@")[0]}`;
    out.push({
      key: "paypal",
      label: "Pay with PayPal",
      bg: "#003087",
      fg: "#ffffff",
      href,
      copyText: !href ? p : undefined,
      copyLabel: !href ? "Copy PayPal handle" : undefined,
    });
  }

  if (h.venmo) {
    const v = stripAt(h.venmo.trim());
    out.push({
      key: "venmo",
      label: `Pay on Venmo @${v}`,
      bg: "#3D95CE",
      fg: "#ffffff",
      href: `https://venmo.com/${v}`,
    });
  }

  if (h.cashapp) {
    const c = stripDollar(h.cashapp.trim());
    out.push({
      key: "cashapp",
      label: `Pay on Cash App $${c}`,
      bg: "#00D632",
      fg: "#ffffff",
      href: `https://cash.app/$${c}`,
    });
  }

  if (h.zelle) {
    // Zelle has no public deep-link — host pastes into their
    // bank's Zelle screen. So this one's a copy-to-clipboard
    // affordance with the handle displayed inline.
    out.push({
      key: "zelle",
      label: `Pay via Zelle: ${h.zelle.trim()}`,
      bg: "#6D1ED4",
      fg: "#ffffff",
      copyText: h.zelle.trim(),
      copyLabel: "Copy Zelle handle",
    });
  }

  return out;
}

export function VendorPaymentButtons({
  info,
  className,
}: {
  info: VendorPaymentInfo;
  className?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const buttons = buildButtons(info);
  if (buttons.length === 0) return null;

  async function onCopy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success("Copied — paste it into your bank's Zelle screen");
      // Briefly flip the icon to a checkmark.
      window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually");
    }
  }

  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-2">
        Pay this vendor
      </p>
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => {
          const isCopy = !b.href && b.copyText;
          if (isCopy) {
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => onCopy(b.key, b.copyText!)}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80"
                style={{ background: b.bg, color: b.fg }}
                aria-label={b.copyLabel ?? b.label}
              >
                {copied === b.key ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span>{b.label}</span>
              </button>
            );
          }
          return (
            <a
              key={b.key}
              href={b.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80"
              style={{ background: b.bg, color: b.fg }}
            >
              <span>{b.label}</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Payments go directly to the vendor — Vendora isn't in the money path.
      </p>
    </div>
  );
}
