// Branded auth email sender. Wired to Supabase's "Send Email Hook"
// (Authentication → Hooks → Send Email Hook in the dashboard).
// Renders branded Vendora HTML for every auth flow and ships it
// through Resend so the From address matches our transactional emails.
//
// Required env (Supabase function secrets):
//   RESEND_API_KEY
//   SEND_EMAIL_HOOK_SECRET   "v1,whsec_..." value Supabase shows when
//                             you create the hook
//   EMAIL_FROM_ADDRESS       defaults to "Vendora <noreply@eventvendora.com>"
//   SUPABASE_URL             auto-injected; used as the verify host

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

type ActionType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "reauthentication";

interface HookPayload {
  user: {
    email: string;
    id?: string;
    user_metadata?: Record<string, unknown>;
    raw_user_meta_data?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to?: string;
    email_action_type: ActionType;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

function vendorBusinessName(p: HookPayload): string | null {
  // Different versions of the hook payload use different metadata keys.
  // Try both so we can detect vendor signups regardless of which one is set.
  const m =
    (p.user.user_metadata ?? p.user.raw_user_meta_data ?? {}) as Record<
      string,
      unknown
    >;
  const v = m.vendor_business_name;
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

// Detect vendor signups that didn't include vendor_business_name in
// metadata (the web SignupPage just sends intended_role: 'vendor').
// Without this, those signups slip through and get the host-style
// confirm-link email — which would let them bypass admin approval
// by clicking the link.
function isVendorSignup(p: HookPayload): boolean {
  if (vendorBusinessName(p)) return true;
  const m =
    (p.user.user_metadata ?? p.user.raw_user_meta_data ?? {}) as Record<
      string,
      unknown
    >;
  return m.intended_role === "vendor";
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, webhook-id, webhook-timestamp, webhook-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured");
    return json({ error: "Server misconfigured" }, 500);
  }

  const rawBody = await req.text();

  if (HOOK_SECRET) {
    try {
      await verifySignature(req.headers, rawBody, HOOK_SECRET);
    } catch (err) {
      console.error("Signature verification failed", { err: String(err) });
      return json({ error: "Invalid signature" }, 401);
    }
  } else {
    // Raise this from warn → error so it stands out in dashboards.
    // This hook handles password-reset + email-confirmation links;
    // accepting unsigned input is a security gap. Set
    // SEND_EMAIL_HOOK_SECRET (Supabase → Auth → Email hook) to close it.
    console.error(
      "SEND_EMAIL_HOOK_SECRET not set — accepting unsigned hook. " +
        "Set this secret to enable HMAC verification.",
    );
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!payload?.user?.email || !payload?.email_data?.email_action_type) {
    return json({ error: "Malformed payload" }, 400);
  }

  const rendered = renderEmail(payload);
  if (!rendered) {
    return json(
      { error: `Unsupported action: ${payload.email_data.email_action_type}` },
      400,
    );
  }

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: payload.user.email,
      subject: rendered.subject,
      html: rendered.html,
    }),
  });

  if (!send.ok) {
    const errText = await send.text();
    console.error("Resend send failed", { status: send.status, errText });
    return json({ error: "Send failed", detail: errText }, 502);
  }

  console.log("Auth email sent", {
    action: payload.email_data.email_action_type,
    to: payload.user.email,
  });
  return json({ ok: true }, 200);
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

// Standard Webhooks signature verification. Header format:
//   webhook-signature: "v1,<base64-hmac-sha256>" (space-separated for multiple)
// Signed payload is `${webhook-id}.${webhook-timestamp}.${body}` and the key
// is the base64-decoded portion after "whsec_".
async function verifySignature(headers: Headers, body: string, secret: string) {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) {
    throw new Error("Missing webhook headers");
  }

  const tsNum = parseInt(ts, 10);
  if (!Number.isFinite(tsNum)) throw new Error("Bad webhook-timestamp");
  const skewSec = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (skewSec > 5 * 60) throw new Error("Timestamp out of tolerance");

  const keyBody = secret.startsWith("v1,whsec_")
    ? secret.slice("v1,whsec_".length)
    : secret.startsWith("whsec_")
      ? secret.slice("whsec_".length)
      : secret;
  const keyBytes = b64Decode(keyBody);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(`${id}.${ts}.${body}`);
  const expected = b64Encode(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, data)),
  );

  const valid = sigHeader.split(" ").some((part) => {
    const [, value] = part.split(",", 2);
    return value === expected;
  });
  if (!valid) throw new Error("Invalid signature");
}

function b64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64Encode(buf: Uint8Array): string {
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
}

function renderEmail(p: HookPayload): { subject: string; html: string } | null {
  const action = p.email_data.email_action_type;
  const verifyUrl = buildVerifyUrl(p);

  if (action === "signup") {
    // Vendor applicants don't see a "confirm your email" CTA — admin
    // review is the real gate. The welcome email after approval
    // doubles as proof of email ownership + hands them the sign-in
    // link. Detect via vendor_business_name OR intended_role.
    if (isVendorSignup(p)) {
      const business = vendorBusinessName(p);
      const opener = business
        ? `Thanks for applying to list <strong>${escape(business)}</strong> on Vendora.`
        : `Thanks for applying to list your business on Vendora.`;
      return {
        subject: "Thanks for applying to Vendora",
        html: shell(
          "Application received",
          `<p style="margin:0 0 16px;">${opener}</p>
           <p style="margin:0 0 16px;">Our team hand-reviews every application. We'll email you within 2–3 business days with the decision — if approved, that email will include your sign-in details.</p>
           <p style="margin:0;font-size:13px;color:#777;">If you didn't submit this application, you can safely ignore this message.</p>`,
        ),
      };
    }
    return {
      subject: "Confirm your Vendora account",
      html: shell(
        "Confirm your account",
        `<p style="margin:0 0 16px;">Welcome to Vendora. Tap the button below to confirm your email and finish setting up your account.</p>
         <p style="margin:0 0 24px;">${button(verifyUrl, "Confirm my email")}</p>
         <p style="margin:0;font-size:13px;color:#777;">If the button doesn't work, paste this link into your browser:<br/><span style="word-break:break-all;">${verifyUrl}</span></p>`,
      ),
    };
  }
  if (action === "invite") {
    return {
      subject: "You've been invited to Vendora",
      html: shell(
        "You're invited",
        `<p style="margin:0 0 16px;">You've been invited to join Vendora. Tap below to accept and set up your account.</p>
         <p style="margin:0 0 24px;">${button(verifyUrl, "Accept invitation")}</p>
         <p style="margin:0;font-size:13px;color:#777;">If the button doesn't work, paste this link into your browser:<br/><span style="word-break:break-all;">${verifyUrl}</span></p>`,
      ),
    };
  }
  if (action === "magiclink") {
    return {
      subject: "Your Vendora sign-in link",
      html: shell(
        "Sign in to Vendora",
        `<p style="margin:0 0 16px;">Tap below to sign in to your Vendora account. This link expires in 1 hour.</p>
         <p style="margin:0 0 24px;">${button(verifyUrl, "Sign me in")}</p>
         <p style="margin:0;font-size:13px;color:#777;">If you didn't request this, you can safely ignore this email.</p>`,
      ),
    };
  }
  if (action === "recovery") {
    return {
      subject: "Reset your Vendora password",
      html: shell(
        "Reset your password",
        `<p style="margin:0 0 16px;">We received a request to reset your password. Tap below to choose a new one.</p>
         <p style="margin:0 0 24px;">${button(verifyUrl, "Reset password")}</p>
         <p style="margin:0;font-size:13px;color:#777;">If you didn't request this, you can ignore this email — your password won't change.</p>`,
      ),
    };
  }
  if (action === "email_change") {
    return {
      subject: "Confirm your new Vendora email",
      html: shell(
        "Confirm your new email",
        `<p style="margin:0 0 16px;">Tap below to confirm <strong>${escape(p.user.email)}</strong> as the new email on your Vendora account.</p>
         <p style="margin:0 0 24px;">${button(verifyUrl, "Confirm new email")}</p>
         <p style="margin:0;font-size:13px;color:#777;">If you didn't request this change, contact support immediately.</p>`,
      ),
    };
  }
  if (action === "reauthentication") {
    const code = String(p.email_data.token).replace(/[^0-9]/g, "").slice(0, 6);
    return {
      subject: `Your Vendora verification code is ${code}`,
      html: shell(
        "Verification code",
        `<p style="margin:0 0 16px;">Use this 6-digit code to confirm it's you:</p>
         <p style="margin:0 0 24px;text-align:center;">
           <span style="display:inline-block;font-family:'SF Mono',ui-monospace,Menlo,monospace;font-size:34px;letter-spacing:0.4em;font-weight:600;color:#1a1a1a;background:#f7f5f2;border:1px solid #ececec;border-radius:8px;padding:18px 28px;">${escape(code)}</span>
         </p>
         <p style="margin:0;font-size:13px;color:#777;">This code expires in 10 minutes. Vendora will never ask you to share it.</p>`,
      ),
    };
  }
  return null;
}

function buildVerifyUrl(p: HookPayload): string {
  const base = (p.email_data.site_url || SUPABASE_URL).replace(/\/+$/, "");
  const params = new URLSearchParams({
    token: p.email_data.token_hash,
    type: p.email_data.email_action_type,
  });
  if (p.email_data.redirect_to) {
    params.set("redirect_to", p.email_data.redirect_to);
  }
  return `${base}/auth/v1/verify?${params.toString()}`;
}

function shell(title: string, bodyHtml: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
          <tr><td style="font-size:14px;letter-spacing:0.18em;color:#a08259;text-transform:uppercase;padding-bottom:24px;">— Vendora</td></tr>
          <tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">${title}</td></tr>
          <tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">${bodyHtml}</td></tr>
          <tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">Vendora · Premium event planning &amp; vendor marketplace</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:500;">${label}</a>`;
}

function escape(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
