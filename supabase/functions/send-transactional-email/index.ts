// Transactional email sender. Single endpoint that routes to per-kind
// templates so the rest of the app only learns one invocation pattern.
//
// Required env (set in Supabase project secrets):
//   RESEND_API_KEY              — your Resend API key
//   EMAIL_FROM_ADDRESS          — e.g. "Vendora <hello@vendora.app>" (default below)
//   APP_URL                     — base URL for absolute links (default below)
//   SUPABASE_URL                — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY   — auto-injected by Supabase
//
// Invoke from frontend:
//   await supabase.functions.invoke("send-transactional-email", {
//     body: { kind: "team_invite", email, businessName, token, role }
//   });
//   await supabase.functions.invoke("send-transactional-email", {
//     body: { kind: "new_inquiry", inquiryId }
//   });

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <hello@vendora.app>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://vendora.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function adminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase admin credentials not configured");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TeamInvitePayload {
  email: string;
  token: string;
  businessName?: string | null;
  role: "admin" | "member";
}

interface NewInquiryPayload {
  inquiryId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (!RESEND_API_KEY) {
    return json(
      { error: "RESEND_API_KEY is not configured on the function" },
      500,
    );
  }

  let body: { kind?: string } & Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const kind = body.kind;
  let emails: { to: string; subject: string; html: string }[] = [];

  try {
    if (kind === "team_invite") {
      const e = teamInviteEmail(body as TeamInvitePayload);
      if (e) emails = [e];
    } else if (kind === "new_inquiry") {
      emails = await newInquiryEmails(body as NewInquiryPayload);
    } else {
      return json({ error: `Unknown kind: ${kind}` }, 400);
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }

  if (emails.length === 0) {
    return json({ ok: true, sent: 0 }, 200);
  }

  let sent = 0;
  const errors: string[] = [];
  for (const email of emails) {
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: email.to,
        subject: email.subject,
        html: email.html,
      }),
    });
    if (send.ok) {
      sent++;
    } else {
      errors.push(`${email.to}: ${await send.text()}`);
    }
  }

  if (sent === 0) {
    return json({ ok: false, sent: 0, errors }, 500);
  }
  return json({ ok: true, sent, errors: errors.length ? errors : undefined }, 200);
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function shellHtml(title: string, bodyHtml: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
            <tr>
              <td style="font-size:14px;letter-spacing:0.18em;color:#a08259;text-transform:uppercase;padding-bottom:24px;">
                — Vendora
              </td>
            </tr>
            <tr>
              <td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">
                ${title}
              </td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:1.6;color:#3a3a3a;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">
                Vendora · Premium event planning &amp; vendor marketplace
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:500;">${label}</a>`;
}

function teamInviteEmail(p: TeamInvitePayload) {
  const businessName = p.businessName ?? "A Vendora vendor";
  const link = `${APP_URL}/accept-team-invite/${p.token}`;
  const roleCopy =
    p.role === "admin"
      ? "manage inquiries, edit the vendor profile, and add other teammates"
      : "manage inquiries, templates, and availability";
  const body = `
    <p style="margin:0 0 16px;">${escape(businessName)} invited you to join their Vendora vendor account as a <strong>${p.role}</strong>.</p>
    <p style="margin:0 0 24px;">As a ${p.role}, you'll be able to ${roleCopy}.</p>
    <p style="margin:0 0 24px;">${button(link, "Accept and join the team")}</p>
    <p style="margin:0;font-size:13px;color:#777;">Or paste this link into your browser:<br/>
      <span style="word-break:break-all;">${link}</span></p>
    <p style="margin:24px 0 0;font-size:13px;color:#777;">This invite expires in 14 days.</p>`;
  return {
    to: p.email,
    subject: `${businessName} invited you to their Vendora team`,
    html: shellHtml(`You've been invited to join ${escape(businessName)}`, body),
  };
}

async function newInquiryEmails(p: NewInquiryPayload) {
  const admin = adminClient();

  const { data: inquiry, error: inqErr } = await admin
    .from("inquiries")
    .select(
      "id, vendor_id, event_type, event_date, budget_min_cents, budget_max_cents, host_id",
    )
    .eq("id", p.inquiryId)
    .maybeSingle();
  if (inqErr || !inquiry) {
    throw new Error(`Inquiry not found: ${inqErr?.message ?? p.inquiryId}`);
  }

  const { data: hostProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", (inquiry as any).host_id)
    .maybeSingle();
  const hostName = (hostProfile as any)?.display_name ?? "A new host";
  const eventType = String((inquiry as any).event_type ?? "event").replace(
    /_/g,
    " ",
  );
  const link = `${APP_URL}/vendor/inbox/${(inquiry as any).id}`;
  const dateLine = (inquiry as any).event_date
    ? `<li style="margin:0 0 6px;">Event date: <strong>${escape((inquiry as any).event_date)}</strong></li>`
    : "";
  const budgetMin = (inquiry as any).budget_min_cents;
  const budgetMax = (inquiry as any).budget_max_cents;
  const budgetLine =
    budgetMin != null || budgetMax != null
      ? `<li style="margin:0 0 6px;">Budget: <strong>$${Math.round((budgetMin ?? 0) / 100).toLocaleString()} – $${Math.round((budgetMax ?? 0) / 100).toLocaleString()}</strong></li>`
      : "";
  const subject = `New inquiry from ${hostName} (${eventType})`;
  const html = shellHtml(
    `New inquiry from ${escape(hostName)}`,
    `
    <p style="margin:0 0 16px;">${escape(hostName)} sent a new inquiry about a <strong>${escape(eventType)}</strong>.</p>
    <ul style="margin:0 0 24px;padding-left:18px;">
      ${dateLine}
      ${budgetLine}
    </ul>
    <p style="margin:0 0 24px;">${button(link, "View and reply")}</p>
    <p style="margin:0;font-size:13px;color:#777;">Hosts on Vendora typically expect a reply within 24 hours.</p>`,
  );

  // Resolve every team member's email via auth.users.
  const { data: members } = await admin
    .from("vendor_team_members")
    .select("user_id")
    .eq("vendor_id", (inquiry as any).vendor_id);
  const userIds = ((members as any[] | null) ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const out: { to: string; subject: string; html: string }[] = [];
  for (const uid of userIds) {
    const { data: u } = await admin.auth.admin.getUserById(uid);
    const email = u?.user?.email;
    if (email) {
      out.push({ to: email, subject, html });
    }
  }
  return out;
}

function escape(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
