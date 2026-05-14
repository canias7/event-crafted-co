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
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";
const APP_URL =
  Deno.env.get("APP_URL") ??
  "https://event-crafted-co-web-git-main-canias7s-projects.vercel.app";
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

interface VendorDecisionPayload {
  // Original: caller passes the listing id (vendor_profiles.id) and we
  // join through to user_id. Still used for listing_approved / listing_rejected
  // from the admin Listings tab.
  vendorProfileId?: string;
  // Newer: admin VendorApplicationsPage calls with userId because at
  // approval time there may not be a publish-ready vendor_profiles row,
  // and the row id is irrelevant when we just need the email + name.
  userId?: string;
  reviewNotes?: string | null;
}

interface PlanningInvitePayload {
  email: string;
  token: string;
  hostName?: string | null;
  role: "editor" | "viewer";
}

interface GuestBlastPayload {
  hostId: string;
  subject: string;
  body: string;
  audience: { rsvp_status?: "attending" | "all"; vip_only?: boolean };
}

interface ReengagementPayload {
  to: string;
  vendorBusinessName: string;
  hostDisplayName: string;
  occasion: string;
  eventType: string;
  upcomingDate: string;
  inquiryId: string;
}

interface SavedSearchMatchPayload {
  to: string;
  searchName: string;
  matchCount: number;
  searchId: string;
}

interface PartyInvitePayload {
  email: string;
  roleLabel: string;
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
  // `from` is optional — when set, overrides FROM_ADDRESS for that
  // specific email. Used by cold-outreach paths so each template can
  // send from a real person (chris@eventvendora.com) instead of the
  // default noreply@.
  let emails: { to: string; subject: string; html: string; from?: string }[] = [];

  try {
    if (kind === "team_invite") {
      const e = teamInviteEmail(body as TeamInvitePayload);
      if (e) emails = [e];
    } else if (kind === "planning_invite") {
      const e = planningInviteEmail(body as PlanningInvitePayload);
      if (e) emails = [e];
    } else if (kind === "new_inquiry") {
      emails = await newInquiryEmails(body as NewInquiryPayload);
    } else if (kind === "guest_blast") {
      emails = await guestBlastEmails(body as GuestBlastPayload);
    } else if (kind === "reengagement_opportunity") {
      const e = reengagementEmail(body as ReengagementPayload);
      if (e) emails = [e];
    } else if (kind === "saved_search_match") {
      const e = savedSearchMatchEmail(body as SavedSearchMatchPayload);
      if (e) emails = [e];
    } else if (kind === "party_invite") {
      const e = await partyInviteEmail(body as PartyInvitePayload);
      if (e) emails = [e];
    } else if (
      kind === "vendor_approved" ||
      kind === "vendor_rejected" ||
      kind === "listing_approved" ||
      kind === "listing_rejected"
    ) {
      const e = await vendorDecisionEmail(body as VendorDecisionPayload, kind as Decision);
      if (e) emails = [e];
    } else if (kind === "vendor_applied") {
      const e = await vendorAppliedEmail(body as VendorAppliedPayload);
      if (e) emails = [e];
    } else if (kind === "signin_code") {
      const e = signinCodeEmail(body as SigninCodePayload);
      if (e) emails = [e];
    } else if (kind === "outreach_lead") {
      const e = await outreachLeadEmail(body as OutreachLeadPayload);
      if (e) emails = [e];
    } else if (kind === "outreach_lead_preview") {
      // Preview-only path. AI-personalizes the email body for this lead
      // and returns it without sending. The caller (admin UI) shows it
      // in a modal, the operator can edit, then calls `outreach_lead`
      // with subject_override / body_override to actually send.
      const preview = await outreachLeadPreview(body as OutreachLeadPayload);
      return json(preview, 200);
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
        from: email.from ?? FROM_ADDRESS,
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

async function partyInviteEmail(p: PartyInvitePayload) {
  // Look up the most recent party invite for this email (the row was
  // just inserted by the host's UI). Use service-role client so RLS
  // doesn't hide it.
  const sb = adminClient();
  const { data } = await sb
    .from("event_party_invites")
    .select(
      "token, role_label, host_id, event:host_events!event_party_invites_event_id_fkey(name, event_type, event_date)",
    )
    .eq("email", p.email.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as
    | {
        token: string;
        role_label: string;
        host_id: string;
        event: { name: string | null; event_type: string; event_date: string | null } | null;
      }
    | null;
  if (!row) return null;

  const { data: hostProf } = await sb
    .from("profiles")
    .select("display_name")
    .eq("id", row.host_id)
    .maybeSingle();
  const hostName =
    (hostProf as { display_name: string | null } | null)?.display_name ??
    "Your friend";

  const link = `${APP_URL}/accept-party-invite/${row.token}`;
  const dateStr = row.event?.event_date
    ? new Date(`${row.event.event_date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const body = `
    <p style="margin:0 0 16px;">${escape(hostName)} added you to their inner circle as <strong>${escape(p.roleLabel)}</strong>.</p>
    ${dateStr ? `<p style="margin:0 0 16px;font-size:14px;color:#3a3a3a;">${escape(dateStr)}</p>` : ""}
    <p style="margin:0 0 24px;">You'll get a private VIP portal with the schedule, vendor names, group gifts, registry, and any tasks they assign — no inquiries, no finances.</p>
    <p style="margin:0 0 24px;">${button(link, "Accept invitation")}</p>
    <p style="margin:0;font-size:13px;color:#777;">If the button doesn't work, paste this URL into your browser: <a href="${link}" style="color:#a08259;">${escape(link)}</a></p>`;

  return {
    to: p.email,
    subject: `${hostName} invited you to their event's inner circle`,
    html: shellHtml("You're invited", body),
  };
}

function savedSearchMatchEmail(p: SavedSearchMatchPayload) {
  const link = `${APP_URL}/customer/saved-searches`;
  const browseLink = `${APP_URL}/vendors`;
  const noun = p.matchCount === 1 ? "vendor matches" : "vendors match";
  const body = `
    <p style="margin:0 0 16px;">${p.matchCount} new ${noun} <strong>"${escape(p.searchName)}"</strong> on Vendora.</p>
    <p style="margin:0 0 24px;">Tap through to see who joined the directory since your last check.</p>
    <p style="margin:0 0 24px;">${button(browseLink, "View matches")}</p>
    <p style="margin:0;font-size:13px;color:#777;">Manage which saved searches send email at <a href="${link}" style="color:#a08259;">your saved searches page</a>.</p>`;
  return {
    to: p.to,
    subject: `New on Vendora: ${p.matchCount} ${noun} "${p.searchName}"`,
    html: shellHtml(`New matches for "${escape(p.searchName)}"`, body),
  };
}

type Decision =
  | "vendor_approved"
  | "vendor_rejected"
  | "listing_approved"
  | "listing_rejected";

async function vendorDecisionEmail(
  p: VendorDecisionPayload,
  decision: Decision,
) {
  const sb = adminClient();
  let userId: string | null = null;
  let businessName: string | null = null;

  // Two entry shapes (see VendorDecisionPayload). Resolve user_id +
  // business_name from whichever was passed.
  if (p.vendorProfileId) {
    const { data, error: vpErr } = await sb
      .from("vendor_profiles")
      .select("business_name, user_id")
      .eq("id", p.vendorProfileId)
      .maybeSingle();
    if (vpErr) console.error("vendor_profiles select error:", vpErr);
    const row = data as { business_name: string; user_id: string } | null;
    if (row?.user_id) {
      userId = row.user_id;
      businessName = row.business_name ?? null;
    }
  } else if (p.userId) {
    userId = p.userId;
    // Pull business_name from auth metadata first (set at signup),
    // fall back to a stub vendor_profiles row if one exists.
    const { data: userRow } = await sb
      .from("profiles")
      .select("display_name")
      .eq("id", p.userId)
      .maybeSingle();
    const profileName =
      (userRow as { display_name?: string | null } | null)?.display_name ?? null;
    const { data: vpRow } = await sb
      .from("vendor_profiles")
      .select("business_name")
      .eq("user_id", p.userId)
      .maybeSingle();
    businessName =
      (vpRow as { business_name?: string | null } | null)?.business_name ??
      profileName ??
      "Your business";
  }

  if (!userId) return null;
  const { data: emailData } = await sb.rpc("get_user_email", { p_user_id: userId });
  const email = emailData as string | null;
  if (!email) return null;
  const row = { business_name: businessName ?? "Your business", user_id: userId };

  const link = `${APP_URL}/vendor/dashboard`;
  const business = escape(row.business_name);
  const reasonLine = p.reviewNotes
    ? `<p style="margin:0 0 16px;color:#555;"><strong>Reviewer notes:</strong> ${escape(p.reviewNotes)}</p>`
    : "";

  if (decision === "vendor_approved") {
    const body = `
      <p style="margin:0 0 16px;">Welcome to Vendora! Your application for <strong>${business}</strong> has been approved.</p>
      <p style="margin:0 0 24px;">Sign in to finish setting up your listing — pricing, location, packages, photos. When you're ready, publish it and we'll review the final listing one more time before it goes live in the public directory.</p>
      <p style="margin:0 0 24px;">${button(link, "Sign in to your dashboard")}</p>
      <p style="margin:0;font-size:13px;color:#777;">Welcome aboard.</p>`;
    return {
      to: email,
      subject: `${row.business_name} — your Vendora application is approved`,
      html: shellHtml(`Welcome to Vendora`, body),
    };
  }

  if (decision === "vendor_rejected") {
    const body = `
      <p style="margin:0 0 16px;">Thanks for applying to list <strong>${business}</strong> on Vendora. After review, we're not able to approve this application at the moment.</p>
      ${reasonLine}
      <p style="margin:0 0 16px;">If you'd like to address the feedback and reapply, you're welcome to submit again from the same email.</p>
      <p style="margin:0;font-size:13px;color:#777;">Questions? Reply to this email and our team will get back to you.</p>`;
    return {
      to: email,
      subject: `Update on your Vendora application for ${row.business_name}`,
      html: shellHtml(`Application update`, body),
    };
  }

  if (decision === "listing_approved") {
    const body = `
      <p style="margin:0 0 16px;">Your latest listing update for <strong>${business}</strong> has been approved and is now live in the Vendora directory.</p>
      <p style="margin:0 0 24px;">Hosts browsing your category will see your updated profile, pricing, and photos. Inquiries flow to your inbox as usual.</p>
      <p style="margin:0 0 24px;">${button(link, "Open your dashboard")}</p>
      <p style="margin:0;font-size:13px;color:#777;">Thanks for keeping your listing fresh.</p>`;
    return {
      to: email,
      subject: `${row.business_name} — your updated listing is live`,
      html: shellHtml(`Listing update approved`, body),
    };
  }

  // listing_rejected
  const body = `
    <p style="margin:0 0 16px;">Your latest listing update for <strong>${business}</strong> wasn't approved. Your previously approved listing is still live — only the new changes are paused.</p>
    ${reasonLine}
    <p style="margin:0 0 16px;">Sign in, address the feedback, and re-publish whenever you're ready.</p>
    <p style="margin:0 0 24px;">${button(link, "Open your dashboard")}</p>
    <p style="margin:0;font-size:13px;color:#777;">Questions? Reply to this email and our team will get back to you.</p>`;
  return {
    to: email,
    subject: `${row.business_name} — listing update needs changes`,
    html: shellHtml(`Listing update needs changes`, body),
  };
}

interface VendorAppliedPayload {
  vendorProfileId: string;
}

async function vendorAppliedEmail(p: VendorAppliedPayload) {
  // Used when an already-authenticated host applies to become a vendor
  // via the apply_as_vendor RPC — no auth.signUp fires, so the auth
  // email hook never runs, and we send the thank-you here instead.
  const sb = adminClient();
  const { data } = await sb
    .from("vendor_profiles")
    .select("business_name, user_id")
    .eq("id", p.vendorProfileId)
    .maybeSingle();
  const row = data as { business_name: string; user_id: string } | null;
  if (!row) return null;
  const { data: emailData } = await sb.rpc("get_user_email", {
    p_user_id: row.user_id,
  });
  const email = emailData as string | null;
  if (!email) return null;

  const business = escape(row.business_name);
  const body = `
    <p style="margin:0 0 16px;">Thanks for applying to list <strong>${business}</strong> on Vendora.</p>
    <p style="margin:0 0 16px;">Our team hand-reviews every application. We'll email you within 2–3 business days with the decision — if approved, you'll be able to finish setting up your listing right away.</p>
    <p style="margin:0;font-size:13px;color:#777;">Questions? Just reply to this email.</p>`;
  return {
    to: email,
    subject: "Thanks for applying to Vendora",
    html: shellHtml("Application received", body),
  };
}

interface SigninCodePayload {
  email: string;
  code: string;
}

function signinCodeEmail(p: SigninCodePayload) {
  const code = String(p.code).replace(/[^0-9]/g, "").slice(0, 6);
  const body = `
    <p style="margin:0 0 16px;">Use this 6-digit code to finish signing in to Vendora:</p>
    <p style="margin:0 0 24px;text-align:center;">
      <span style="display:inline-block;font-family:'SF Mono',ui-monospace,'Cascadia Mono',Menlo,monospace;font-size:34px;letter-spacing:0.4em;font-weight:600;color:#1a1a1a;background:#f7f5f2;border:1px solid #ececec;border-radius:8px;padding:18px 28px;">
        ${escape(code)}
      </span>
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:#555;">This code expires in 10 minutes. Don't share it with anyone — Vendora will never ask for it.</p>
    <p style="margin:0;font-size:13px;color:#777;">If you didn't try to sign in, you can ignore this email.</p>`;
  return {
    to: p.email,
    subject: `Your Vendora sign-in code is ${code}`,
    html: shellHtml(`Sign-in code`, body),
  };
}

function reengagementEmail(p: ReengagementPayload) {
  const eventTypeLabel = p.eventType.replace(/_/g, " ");
  const upcoming = new Date(p.upcomingDate).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const inboxLink = `${APP_URL}/vendor/inbox/${p.inquiryId}`;
  const body = `
    <p style="margin:0 0 16px;">${escape(p.hostDisplayName)}'s <strong>${escape(p.occasion)}</strong> is coming up on <strong>${escape(upcoming)}</strong>.</p>
    <p style="margin:0 0 16px;">You worked together on a ${escape(eventTypeLabel)} — a quick "thinking of you" message right now is the kind of touch that turns a one-time client into a long-term one. Possible follow-ups:</p>
    <ul style="margin:0 0 24px;padding-left:18px;color:#3a3a3a;font-size:14px;line-height:1.7;">
      <li>An anniversary photo session or vow renewal</li>
      <li>A milestone party (birthday, anniversary celebration, family gathering)</li>
      <li>Holiday-season rebooking or referral to a friend</li>
    </ul>
    <p style="margin:0 0 24px;">${button(inboxLink, "Open the original conversation")}</p>
    <p style="margin:0;font-size:13px;color:#777;">You're getting this because Vendora detects re-engagement opportunities for past clients automatically. Manage notification preferences in <a href="${APP_URL}/settings" style="color:#a08259;">Settings</a>.</p>`;
  return {
    to: p.to,
    subject: `${p.hostDisplayName}'s ${p.occasion} is in 30 days`,
    html: shellHtml(`Reach out to ${escape(p.hostDisplayName)}`, body),
  };
}

function planningInviteEmail(p: PlanningInvitePayload) {
  const hostName = p.hostName ?? "A Vendora host";
  const link = `${APP_URL}/accept-planning-invite/${p.token}`;
  const roleCopy =
    p.role === "editor"
      ? "edit the guest list, checklist, budget, mood boards, and timeline"
      : "see the guest list, checklist, budget, mood boards, and timeline";
  const body = `
    <p style="margin:0 0 16px;">${escape(hostName)} invited you to help plan their event as a <strong>${p.role}</strong>.</p>
    <p style="margin:0 0 24px;">As a ${p.role}, you'll be able to ${roleCopy}.</p>
    <p style="margin:0 0 24px;">${button(link, "Accept and join the team")}</p>
    <p style="margin:0;font-size:13px;color:#777;">Or paste this link into your browser:<br/>
      <span style="word-break:break-all;">${link}</span></p>
    <p style="margin:24px 0 0;font-size:13px;color:#777;">This invite expires in 14 days.</p>`;
  return {
    to: p.email,
    subject: `${hostName} invited you to help plan their event`,
    html: shellHtml(`Help ${escape(hostName)} plan their event`, body),
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
  const budgetMin = (inquiry as any).budget_min_cents as number | null;
  const budgetMax = (inquiry as any).budget_max_cents as number | null;
  // Render an open-ended range when only one side is set instead of
  // pinning the missing side to "$0", which made the email read
  // "Budget: $0 – $5,000" or "Budget: $0 – $0" when both were null
  // and the line shouldn't have rendered at all.
  function fmtDollars(cents: number): string {
    return `$${Math.round(cents / 100).toLocaleString()}`;
  }
  let budgetLine = "";
  if (budgetMin != null && budgetMax != null) {
    budgetLine = `<li style="margin:0 0 6px;">Budget: <strong>${fmtDollars(budgetMin)} – ${fmtDollars(budgetMax)}</strong></li>`;
  } else if (budgetMin != null) {
    budgetLine = `<li style="margin:0 0 6px;">Budget: <strong>${fmtDollars(budgetMin)}+</strong></li>`;
  } else if (budgetMax != null) {
    budgetLine = `<li style="margin:0 0 6px;">Budget: <strong>up to ${fmtDollars(budgetMax)}</strong></li>`;
  }
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

interface OutreachLeadPayload {
  lead_id: string;
  template_id: string;
  // Optional overrides for the actually-sent subject / body. The admin
  // UI does an AI-personalized preview first, lets the operator edit,
  // then passes the final versions back in these fields. When absent,
  // we fall back to template + {{var}} substitution (no AI rewrite).
  subject_override?: string;
  body_override?: string;
}

async function loadLeadAndTemplate(p: OutreachLeadPayload) {
  if (!p.lead_id || !p.template_id) {
    throw new Error("lead_id and template_id are required");
  }
  const sb = adminClient();
  const { data: lead, error: leadErr } = await sb
    .from("email_leads")
    .select("id, email, name, source, notes")
    .eq("id", p.lead_id)
    .maybeSingle();
  if (leadErr) throw new Error(`Lead lookup: ${leadErr.message}`);
  const leadRow = lead as {
    id: string;
    email: string;
    name: string | null;
    source: string | null;
    notes: string | null;
  } | null;
  if (!leadRow) throw new Error(`Lead not found: ${p.lead_id}`);

  const { data: template, error: tplErr } = await sb
    .from("email_templates")
    .select("id, name, subject, body, from_name, from_address")
    .eq("id", p.template_id)
    .maybeSingle();
  if (tplErr) throw new Error(`Template lookup: ${tplErr.message}`);
  const tplRow = template as {
    id: string;
    name: string;
    subject: string;
    body: string;
    from_name: string | null;
    from_address: string | null;
  } | null;
  if (!tplRow) throw new Error(`Template not found: ${p.template_id}`);
  return { sb, lead: leadRow, template: tplRow };
}

const PERSONALIZE_SYSTEM = `You are personalizing a cold-outreach email for one specific event vendor we want to recruit to our new marketplace.

You will receive:
- The template email body (the message we want to convey)
- What we know about the vendor (name, source/context, notes)

Your job: rewrite the body so it feels written specifically for this vendor. Pull 1-2 concrete details from the notes and weave them in naturally — a quick compliment about their style, a reference to their specialty / location / niche, etc. Keep the same value prop, hook, and CTA the template has. Match the tone (warm, inviting, not salesy).

Rules:
- Output only the rewritten email body. No subject, no preamble, no markdown, no quotes around the output.
- Plain text only. Use blank lines between paragraphs. No HTML.
- Stay roughly the same length as the template. Don't pad.
- DO NOT invent facts. If the notes are thin or vague, keep the personalization light — just use the vendor's name and a generic-but-warm reference. Better to under-personalize than to make things up.
- Never reference the notes verbatim. Re-phrase them as natural observations a human would make.
- Sign off with the same closing the template uses ("— Vendora team" etc.).`;

async function personalizeBody(input: {
  templateBody: string;
  name: string | null;
  source: string | null;
  notes: string | null;
}) {
  if (!ANTHROPIC_API_KEY) {
    // No key configured — fall back to the template as-is.
    console.warn("[outreach] ANTHROPIC_API_KEY not set; skipping personalization");
    return input.templateBody;
  }
  const userMsg = `Template body (the message to convey):\n---\n${input.templateBody}\n---\n\nWhat we know about this vendor:\n- Business name: ${input.name ?? "(unknown)"}\n- Source / context: ${input.source ?? "(unknown)"}\n- Notes: ${input.notes ?? "(no notes captured)"}\n\nReturn ONLY the rewritten email body.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        { type: "text", text: PERSONALIZE_SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[outreach] anthropic personalize failed:", res.status, errText.slice(0, 500));
    // Fail open — fall back to the template body so the send still works.
    return input.templateBody;
  }
  const apiBody = (await res.json()) as any;
  const text = ((apiBody.content ?? []) as any[])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
  return text || input.templateBody;
}

// Preview: returns the AI-personalized email subject + body for this
// lead without sending. Caller (admin UI) shows it in a modal, lets
// the operator edit, then calls outreach_lead with the final overrides.
async function outreachLeadPreview(p: OutreachLeadPayload) {
  const { lead, template } = await loadLeadAndTemplate(p);
  const vars: Record<string, string> = {
    name: lead.name ?? "there",
    email: lead.email,
    source: lead.source ?? "",
  };
  const subject = applyVars(template.subject, vars);
  const personalizedBody = await personalizeBody({
    templateBody: applyVars(template.body, vars),
    name: lead.name,
    source: lead.source,
    notes: lead.notes,
  });
  return {
    subject,
    body: personalizedBody,
    from_name: template.from_name,
    from_address: template.from_address,
    lead: { id: lead.id, email: lead.email, name: lead.name },
  };
}

// Send an outreach email. If subject_override / body_override are
// provided (the typical path — UI shows a preview, operator edits, then
// confirms), we send those verbatim. Otherwise we fall back to the
// template with {{var}} substitution (no AI rewrite).
//
// Cold-outreach deliverability is brittle: branded HTML wrappers,
// noreply@ senders, and big logos all push these into spam. So we
// deliberately do NOT use shellHtml here — outreach goes out as
// minimal HTML (just paragraph tags) so it reads like a 1:1 email,
// not a newsletter.
//
// After a successful send, marks the lead as contacted and stamps
// last_sent_at / last_template_id.
async function outreachLeadEmail(p: OutreachLeadPayload) {
  const { sb, lead, template } = await loadLeadAndTemplate(p);

  const vars: Record<string, string> = {
    name: lead.name ?? "there",
    email: lead.email,
    source: lead.source ?? "",
  };
  const subject = (p.subject_override ?? applyVars(template.subject, vars)).trim();
  const bodyText = (p.body_override ?? applyVars(template.body, vars)).trim();
  if (!subject || !bodyText) {
    throw new Error("Subject and body are required");
  }
  const html = outreachBodyHtml(bodyText);

  const from = template.from_address
    ? template.from_name
      ? `${template.from_name} <${template.from_address}>`
      : template.from_address
    : undefined;

  await sb
    .from("email_leads")
    .update({
      status: "contacted",
      last_sent_at: new Date().toISOString(),
      last_template_id: template.id,
    })
    .eq("id", lead.id);

  return { to: lead.email, subject, html, from };
}

// Minimal HTML wrapper for cold outreach. No logo, no header, no
// footer, no branding — just paragraphs in a vanilla <html><body>.
// Looks like a 1:1 personal email when rendered. All content is
// HTML-escaped before substitution.
function outreachBodyHtml(text: string) {
  const escaped = escape(text);
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="margin:0 0 12px;">${para.replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;">${paragraphs}</body></html>`;
}

// Replace {{name}}, {{ email }}, etc. with values from vars. Unknown
// placeholders are left as-is — easier to spot a typo in a template
// than to silently render an empty string.
function applyVars(input: string, vars: Record<string, string>) {
  return input.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m;
  });
}

async function guestBlastEmails(p: GuestBlastPayload) {
  const admin = adminClient();

  // Caller authenticates via the function's verify_jwt; we still
  // double-check ownership via the host_id passed in (the SELECT below
  // is server-side and the writes log to guest_message_blasts under
  // that host_id, not the caller's auth.uid). Acceptable for v1.
  let q = admin
    .from("event_guests")
    .select("id, name, email, rsvp_status, is_vip")
    .eq("host_id", p.hostId);

  if (p.audience.rsvp_status === "attending") {
    q = q.eq("rsvp_status", "attending");
  }
  if (p.audience.vip_only) {
    q = q.eq("is_vip", true);
  }

  const { data: guests, error } = await q;
  if (error) throw new Error(error.message);
  const recipients = ((guests as any[] | null) ?? []).filter((g) => g.email);
  if (recipients.length === 0) return [];

  const { data: hostProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", p.hostId)
    .maybeSingle();
  const hostName = (hostProfile as any)?.display_name ?? "Your host";

  // Log the blast (regardless of how many emails actually go out below).
  await admin.from("guest_message_blasts").insert({
    host_id: p.hostId,
    subject: p.subject,
    body: p.body,
    sent_to_count: recipients.length,
    audience: p.audience,
  });

  return recipients.map((g) => ({
    to: g.email,
    subject: p.subject,
    html: shellHtml(
      escape(p.subject),
      `<p style="margin:0 0 12px;font-size:15px;color:#3a3a3a;">Hi ${escape(g.name ?? "there")},</p>
      <div style="font-size:15px;line-height:1.6;color:#3a3a3a;white-space:pre-wrap;">${escape(p.body)}</div>
      <p style="margin:24px 0 0;font-size:13px;color:#777;">— ${escape(hostName)}</p>`,
    ),
  }));
}
