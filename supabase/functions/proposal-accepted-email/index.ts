// POST /proposal-accepted-email { proposal_id }
//
// Emails the vendor when a client accepts their proposal. Fired by the
// vendor_proposals AFTER UPDATE trigger (net.http_post) on the sent→accepted
// transition — same fan-out pattern as push notifications.
//
// verify_jwt=false: invoked server-side from Postgres with no JWT. It is not a
// useful abuse vector — it only ever emails the proposal's own vendor (the
// recipient is never caller-controlled), and only for a proposal already in
// 'accepted' status. Sends from the Vendora platform address (this is a
// platform→vendor notice, not a buyer-facing email).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";
const APP_ORIGIN = "https://eventvendora.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!RESEND_API_KEY) return json(500, { error: "resend_not_configured" });
  try {
    const { proposal_id } = await req.json();
    if (!proposal_id) return json(400, { error: "proposal_id required" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: p } = await admin
      .from("vendor_proposals")
      .select("id, vendor_id, title, status, accepted_name, inquiry_id")
      .eq("id", proposal_id)
      .maybeSingle();
    if (!p) return json(404, { error: "proposal_not_found" });
    // Only notify for an accepted proposal — guards against stray calls.
    if ((p as any).status !== "accepted") return json(200, { ok: true, skipped: "not_accepted" });

    const { data: vp } = await admin
      .from("vendor_profiles")
      .select("user_id, business_name")
      .eq("id", (p as any).vendor_id)
      .maybeSingle();
    const vendorUserId = (vp as any)?.user_id as string | undefined;
    if (!vendorUserId) return json(200, { ok: true, skipped: "no_vendor_user" });

    const { data: vu } = await admin.auth.admin.getUserById(vendorUserId);
    const toEmail = vu?.user?.email ?? "";
    if (!toEmail) return json(200, { ok: true, skipped: "no_vendor_email" });

    const title = String((p as any).title ?? "your proposal");
    const who = String((p as any).accepted_name ?? "Your client");
    const inquiryId = (p as any).inquiry_id as string | null;
    const link = inquiryId
      ? `${APP_ORIGIN}/vendor/inbox/${inquiryId}`
      : `${APP_ORIGIN}/vendor/workspace?tab=files`;

    const html = `<!doctype html><html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center"><table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;padding:40px 32px;"><tr><td style="font-size:13px;color:#888;padding-bottom:8px;">Proposal accepted 🎉</td></tr><tr><td style="font-size:22px;font-weight:600;line-height:1.3;padding-bottom:14px;">${escapeHtml(who)} accepted "${escapeHtml(title)}"</td></tr><tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;padding-bottom:24px;">Nice work. You can follow up with the agreement and invoice from your workspace.</td></tr><tr><td><a href="${escapeHtml(link)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 30px;border-radius:999px;">Open in Vendora</a></td></tr><tr><td style="padding-top:36px;border-top:1px solid #ececec;font-size:12px;color:#999;">Vendora</td></tr></table></td></tr></table></body></html>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: toEmail,
        subject: `${who} accepted "${title}"`,
        html,
      }),
    });
    if (!r.ok) {
      console.error("[proposal-accepted-email] resend error", await r.text());
      return json(502, { error: "email_failed" });
    }
    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: "server_error", detail: String(e).slice(0, 200) });
  }
});
