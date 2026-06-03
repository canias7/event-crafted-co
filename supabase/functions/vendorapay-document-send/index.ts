// VendoraPay: POST /vendorapay-document-send
//   { vendor_id, kind: "contract"|"proposal", name, body, to_email,
//     cta_url?, cta_label? }
//
// Vendor-initiated email of a contract/proposal TEMPLATE (title + body
// text) to a typed recipient. Mirrors vendorapay-invoice-send: same
// auth model (vendor team admin OR service role), same verified-domain
// sender, same client-email consent gate. No money, no DB state change —
// it just emails the document text the vendor composed.
//
// Runs with verify_jwt=false (config.toml): self-authenticates via the
// caller's JWT (team-admin check) or the service-role bearer.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { senderFrom } from "../_shared/sender.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function shellHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;"><tr><td style="padding-bottom:24px;"><img src="https://eventvendora.com/pwa-192.png" alt="Vendora" width="44" height="44" style="display:block;border:0;border-radius:8px;" /></td></tr><tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">${title}</td></tr><tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">${bodyHtml}</td></tr><tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">VendoraPay · Premium event payments</td></tr></table></td></tr></table></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!RESEND_API_KEY) return json(500, { error: "resend_not_configured" });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole =
      SUPABASE_SERVICE_ROLE_KEY.length > 0 &&
      authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;

    const reqBody = await req.json().catch(() => ({}));
    const vendorId = (reqBody?.vendor_id as string | undefined)?.trim();
    const kind = (reqBody?.kind as string | undefined) === "proposal" ? "proposal" : "contract";
    const docName = (reqBody?.name as string | undefined)?.trim() || (kind === "contract" ? "Contract" : "Proposal");
    const docBody = (reqBody?.body as string | undefined) ?? "";
    const toEmail = (reqBody?.to_email as string | undefined)?.trim() ?? "";
    // Optional call-to-action button (e.g. proposals link to the shareable
    // /proposal/<token> page so the client can review and accept). Contracts
    // omit it and keep the plain text email.
    const ctaUrl = (reqBody?.cta_url as string | undefined)?.trim() ?? "";
    const ctaLabel = (reqBody?.cta_label as string | undefined)?.trim() || "Open";

    if (!vendorId) return json(400, { error: "vendor_id required" });
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return json(400, { error: "invalid to_email" });
    }
    if (!docBody.trim()) return json(400, { error: "empty document body" });

    // Auth: a non-service-role caller must be a team admin of vendor_id.
    let userClient: ReturnType<typeof createClient> | null = null;
    if (!isServiceRole) {
      userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json(401, { error: "unauthorized" });
      const { data: isAdmin } = await userClient.rpc("is_vendor_team_admin", {
        _vendor_id: vendorId,
      });
      if (!isAdmin) return json(403, { error: "forbidden" });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: vp } = await admin
      .from("vendor_profiles")
      .select("user_id, business_name")
      .eq("id", vendorId)
      .maybeSingle();
    const vpRow = vp as { user_id?: string | null; business_name?: string | null } | null;
    const businessName = vpRow?.business_name ?? "your vendor";

    // Client-email consent gate — same as invoice send. The vendor must
    // opt into client email delivery before the app emails on their behalf.
    const { data: esRow } = await admin
      .from("vendor_email_settings")
      .select("sending_enabled")
      .eq("user_id", vpRow?.user_id ?? "")
      .maybeSingle();
    if (!(esRow as { sending_enabled?: boolean } | null)?.sending_enabled) {
      return json(403, {
        error: "email_not_enabled",
        message: "Enable client email sending in your Email settings to send documents.",
      });
    }

    // Verified sending domain (brand From) if hooked up.
    let verifiedDomain: string | null = null;
    const { data: dom } = await admin
      .from("vendor_email_domains")
      .select("domain, status")
      .eq("vendor_id", vendorId)
      .maybeSingle();
    const domRow = dom as { domain?: string; status?: string } | null;
    if (domRow?.status === "verified" && domRow.domain) verifiedDomain = domRow.domain;

    // Reply-To routes to the vendor's account email.
    let vendorEmail: string | null = null;
    if (vpRow?.user_id) {
      const { data: vu } = await admin.auth.admin.getUserById(vpRow.user_id);
      vendorEmail = vu?.user?.email ?? null;
    }

    const kindLabel = kind === "contract" ? "Contract" : "Proposal";
    // Preserve the vendor's line breaks; escape the rest.
    let bodyHtml = `<p style="margin:0 0 8px;font-size:13px;color:#777;">From ${escapeHtml(businessName)}</p><div style="white-space:pre-wrap;font-size:14px;line-height:1.7;color:#3a3a3a;">${escapeHtml(docBody)}</div>`;
    if (ctaUrl && /^https?:\/\//i.test(ctaUrl)) {
      bodyHtml += `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 30px;border-radius:999px;">${escapeHtml(ctaLabel)}</a></td></tr></table>`;
    }
    const html = shellHtml(escapeHtml(docName), bodyHtml);

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: senderFrom(businessName, verifiedDomain),
        reply_to: vendorEmail ?? undefined,
        to: toEmail,
        subject: `${kindLabel}: ${docName} from ${businessName}`,
        html,
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error("[vendorapay-document-send] resend error", txt);
      return json(500, { error: "email_failed", detail: txt.slice(0, 240) });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error("[vendorapay-document-send] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: "send_failed", detail: message.slice(0, 240) });
  }
});
