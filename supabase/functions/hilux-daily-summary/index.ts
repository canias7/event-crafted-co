// HILUX daily summary. Scheduled daily (16:00 UTC = 9am PT). For
// every profile with hilux_action_daily_summary = true, computes
// HILUX's last-24h activity and emails a digest to the vendor team.
//
// Counts: replies sent, escalations, and hot leads detected — the
// three action types HILUX writes to hilux_action_log. Silent days
// (zero activity) are skipped rather than emailed.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
// HILUX emails are temporarily disabled while the feature is being reworked.
// Flip to false to restore the daily summary email.
const HILUX_EMAILS_DISABLED = true;
const EMAIL_FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";

const LOOKBACK_HOURS = 24;
const MAX_VENDORS_PER_RUN = 200;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function log(...args: unknown[]) {
  console.log("[hilux-daily-summary]", ...args);
}

interface Counts {
  reply: number;
  escalate: number;
  lead_score_hot: number;
}

function emptyCounts(): Counts {
  return {
    reply: 0,
    escalate: 0,
    lead_score_hot: 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (!RESEND_API_KEY) {
    return json({ ok: true, sent: 0, note: "RESEND_API_KEY not set" }, 200);
  }
  if (HILUX_EMAILS_DISABLED) {
    return json({ ok: true, sent: 0, note: "HILUX emails disabled" }, 200);
  }

  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString();

  // 1. Pull every profile that wants a daily digest.
  const { data: profs, error: profErr } = await admin
    .from("profiles")
    .select("id, hilux_action_daily_summary")
    .eq("hilux_action_daily_summary", true)
    .eq("hilux_enabled", true)
    .limit(MAX_VENDORS_PER_RUN);
  if (profErr) {
    log("profile fetch failed", profErr);
    return json({ error: profErr.message }, 500);
  }
  const profiles = (profs ?? []) as Array<{ id: string }>;
  if (profiles.length === 0) {
    return json({ ok: true, sent: 0, considered: 0 }, 200);
  }

  let sent = 0;
  const errors: string[] = [];

  for (const p of profiles) {
    try {
      // 2. Look up vendor display name (use the profile's first owned
      //    vendor profile for the email subject + greeting).
      const { data: vp } = await admin
        .from("vendor_profiles")
        .select("business_name")
        .eq("user_id", p.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const vendorName =
        (vp as { business_name?: string } | null)?.business_name ?? "your business";

      // 3. Pull last-24h action log entries for this user.
      const { data: rows } = await admin
        .from("hilux_action_log")
        .select("action, detail, created_at")
        .eq("user_id", p.id)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false });
      const entries = (rows ?? []) as Array<{
        action: string;
        detail: string | null;
        created_at: string;
      }>;
      const counts = emptyCounts();
      for (const e of entries) {
        if ((counts as any)[e.action] !== undefined) {
          (counts as any)[e.action]++;
        }
      }

      // 4. Look up the user's auth email.
      const { data: u } = await admin.auth.admin.getUserById(p.id);
      const to = u?.user?.email;
      if (!to) continue;

      // 5. Skip silent days — no point emailing "0 replies, 0 escalations".
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total === 0) continue;

      const html = summaryHtml({
        vendorName,
        counts,
        recent: entries.slice(0, 5),
        appUrl: APP_URL,
      });
      const subject = `HILUX yesterday: ${counts.reply} replies, ${counts.escalate} escalations`;

      const send = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: EMAIL_FROM_ADDRESS, to, subject, html }),
      });
      if (send.ok) {
        sent++;
      } else {
        errors.push(`${p.id}: ${await send.text()}`);
      }
    } catch (err) {
      errors.push(`${p.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return json(
    {
      ok: true,
      considered: profiles.length,
      sent,
      errors: errors.length ? errors : undefined,
    },
    200,
  );
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ACTION_LABEL: Record<string, string> = {
  reply: "replied to a host",
  escalate: "escalated to you",
  lead_score_hot: "flagged a hot lead",
};

function summaryHtml(args: {
  vendorName: string;
  counts: Counts;
  recent: Array<{ action: string; detail: string | null; created_at: string }>;
  appUrl: string;
}): string {
  const stat = (n: number, label: string) => `
    <div style="flex:1;text-align:center;padding:16px;border:1px solid #eee;border-radius:8px;margin:0 4px;">
      <div style="font-size:28px;font-weight:700;color:#111;">${n}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#666;margin-top:4px;">${label}</div>
    </div>`;
  const recent = args.recent
    .map((r) => {
      const label = ACTION_LABEL[r.action] ?? r.action;
      const when = new Date(r.created_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      return `<li style="margin:6px 0;color:#555;"><strong style="color:#111;">${when}</strong> — HILUX ${escapeHtml(label)}${r.detail ? `: <em style="color:#777;">${escapeHtml(r.detail)}</em>` : ""}</li>`;
    })
    .join("");
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="margin:0 0 4px;font-size:20px;">HILUX yesterday for ${escapeHtml(args.vendorName)}</h2>
  <p style="color:#666;margin:0 0 24px;">Here's what your always-on agent handled in the last 24 hours.</p>
  <div style="display:flex;margin:0 -4px 24px;">
    ${stat(args.counts.reply, "Replies sent")}
    ${stat(args.counts.escalate, "Escalations")}
    ${stat(args.counts.lead_score_hot, "Hot leads")}
  </div>
  ${recent ? `<h3 style="font-size:14px;margin:0 0 8px;color:#111;">Recent activity</h3><ul style="margin:0 0 24px;padding:0;list-style:none;font-size:13px;">${recent}</ul>` : ""}
  <p style="margin:0;"><a href="${escapeHtml(args.appUrl)}/vendor/inbox" style="background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block;">Open your inbox</a></p>
  <p style="color:#999;font-size:11px;margin-top:32px;">You're getting this because the Daily summary toggle is on for HILUX. Turn it off in your agent settings to stop.</p>
</body></html>`;
}
