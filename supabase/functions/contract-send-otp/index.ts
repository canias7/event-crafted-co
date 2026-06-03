// POST /contract-send-otp { token, email? }
//
// Public (verify_jwt=false): the signer is anonymous. Gated by the
// contract's 128-bit sign token — only a valid 'sent' contract token
// can trigger a code. The code is emailed to the contract's bound
// recipient (the host it was sent to), looked up server-side by token —
// the client cannot redirect it to an arbitrary inbox, so only the
// intended recipient can sign. The submitted `email` is only used as a
// fallback for legacy contracts with no recipient on file. Stores the
// code's SHA-256 hash (matching the sign_contract RPC's check).
// Rate-limited to 5 codes per contract per hour.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";

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
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}
async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!RESEND_API_KEY) return json(500, { error: "resend_not_configured" });
  try {
    const { token, email } = await req.json();
    if (!token) return json(400, { error: "token required" });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: c } = await admin
      .from("vendor_contracts")
      .select("id, status, title, recipient_email")
      .eq("sign_token", token)
      .maybeSingle();
    if (!c) return json(404, { error: "contract_not_found" });
    if ((c as any).status !== "sent") return json(400, { error: "not_signable" });

    // The code always goes to the contract's bound recipient. A client-supplied
    // email is only honored for legacy contracts with no recipient on file.
    const recipient = String((c as any).recipient_email ?? "").trim().toLowerCase();
    const cleanEmail = recipient || String(email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return json(400, { error: "invalid email" });
    }

    // Rate limit: at most 5 codes per contract per hour.
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count } = await admin
      .from("contract_sign_otps")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", (c as any).id)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) return json(429, { error: "too_many_requests" });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256hex(code);
    await admin.from("contract_sign_otps").insert({
      contract_id: (c as any).id,
      email: cleanEmail,
      code_hash,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    const title = escapeHtml(String((c as any).title ?? "your contract"));
    const html = `<!doctype html><html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center"><table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:8px;padding:40px 32px;"><tr><td style="font-size:20px;font-weight:600;padding-bottom:12px;">Your signing code</td></tr><tr><td style="font-size:15px;color:#3a3a3a;padding-bottom:20px;">Use this code to sign <strong>${title}</strong>:</td></tr><tr><td style="font-size:34px;font-weight:700;letter-spacing:8px;color:#111;padding-bottom:20px;">${code}</td></tr><tr><td style="font-size:13px;color:#999;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</td></tr></table></td></tr></table></body></html>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: cleanEmail,
        subject: `Your code to sign "${(c as any).title ?? "a contract"}"`,
        html,
      }),
    });
    if (!r.ok) {
      console.error("[contract-send-otp] resend error", await r.text());
      return json(502, { error: "email_failed" });
    }
    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: "server_error", detail: String(e).slice(0, 200) });
  }
});
