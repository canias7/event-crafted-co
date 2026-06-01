// My Space scheduled-action worker. Invoked every 5 minutes by pg_cron
// (see migration 20260527006000_my_space_scheduled_actions.sql; the
// cadence was throttled from 1m → 5m in a later migration). On an empty
// queue this is a single 0-row UPDATE, so the looser cadence just means
// a scheduled action fires up to ~5 minutes late instead of ~1.
//
// Polls my_space_scheduled_actions for rows where status='pending'
// and run_at <= now(). For each, flips status to 'executing', runs
// the action, and writes done/failed with the result. Caps the batch
// so a backlog doesn't blow the function timeout — anything missed
// gets picked up on the next minute's tick.
//
// Action kinds supported (mirror my-space-chat's write tools):
//   • send_host_reply       — args: { inquiry_id, body }
//   • send_email            — args: { to, subject, body }
//   • mark_notifications_read — args: { ids?, all_unread? }

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const BATCH_LIMIT = 25;

interface ActionRow {
  id: string;
  user_id: string;
  vendor_id: string | null;
  kind: string;
  args: any;
}

async function execSendHostReply(
  admin: any,
  row: ActionRow,
): Promise<unknown> {
  const inquiryId = String(row.args?.inquiry_id ?? "");
  const body = String(row.args?.body ?? "").trim();
  if (!inquiryId || !body || !row.vendor_id) {
    throw new Error("missing inquiry_id / body / vendor_id");
  }
  const { data: inq } = await admin
    .from("inquiries")
    .select("id, vendor_id")
    .eq("id", inquiryId)
    .eq("vendor_id", row.vendor_id)
    .maybeSingle();
  if (!inq) throw new Error("inquiry_not_found_or_not_owned");
  const { data: thread } = await admin
    .from("direct_threads")
    .select("id")
    .eq("inquiry_id", inquiryId)
    .maybeSingle();
  if (!(thread as any)?.id) throw new Error("no_thread_for_inquiry");
  const now = new Date().toISOString();
  const { data: msg, error } = await admin
    .from("direct_messages")
    .insert({
      thread_id: (thread as any).id,
      sender_id: row.user_id,
      sender_role: "vendor",
      body,
      is_hilux_generated: false,
    })
    .select("id, created_at")
    .single();
  if (error) throw new Error(error.message);
  await admin
    .from("direct_threads")
    .update({ last_message_at: now })
    .eq("id", (thread as any).id);
  await admin
    .from("inquiries")
    .update({ last_message_at: now })
    .eq("id", inquiryId);
  return {
    message_id: (msg as any).id,
    sent_at: (msg as any).created_at,
  };
}

async function execSendEmail(admin: any, row: ActionRow): Promise<unknown> {
  if (!RESEND_API_KEY) throw new Error("resend_key_missing");
  const to = String(row.args?.to ?? "").trim();
  const subject = String(row.args?.subject ?? "").trim();
  const body = String(row.args?.body ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error("invalid_to");
  if (!subject || !body) throw new Error("missing subject/body");
  let fromName = "Vendora";
  if (row.vendor_id) {
    const { data: vendor } = await admin
      .from("vendor_profiles")
      .select("business_name")
      .eq("id", row.vendor_id)
      .maybeSingle();
    if ((vendor as any)?.business_name) fromName = (vendor as any).business_name;
  }
  const FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") ??
    `${fromName} <noreply@eventvendora.com>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, text: body }),
  });
  if (!res.ok) {
    throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
  const out = (await res.json()) as any;
  return { sent: true, to, subject, resend_id: out?.id ?? null };
}

async function execMarkNotificationsRead(
  admin: any,
  row: ActionRow,
): Promise<unknown> {
  const now = new Date().toISOString();
  if (row.args?.all_unread === true) {
    const { count, error } = await admin
      .from("notifications")
      .update({ read_at: now }, { count: "exact" })
      .eq("user_id", row.user_id)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { marked_read: count ?? 0, scope: "all_unread" };
  }
  const ids = Array.isArray(row.args?.ids)
    ? (row.args.ids as unknown[]).map(String).filter(Boolean)
    : [];
  if (ids.length === 0) throw new Error("pass ids[] or all_unread=true");
  const { count, error } = await admin
    .from("notifications")
    .update({ read_at: now }, { count: "exact" })
    .eq("user_id", row.user_id)
    .in("id", ids);
  if (error) throw new Error(error.message);
  return { marked_read: count ?? 0, ids };
}

async function executeAction(
  admin: any,
  row: ActionRow,
): Promise<unknown> {
  if (row.kind === "send_host_reply") return execSendHostReply(admin, row);
  if (row.kind === "send_email") return execSendEmail(admin, row);
  if (row.kind === "mark_notifications_read") {
    return execMarkNotificationsRead(admin, row);
  }
  throw new Error(`unknown_kind:${row.kind}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Atomically claim pending due rows. We update status='pending' rows
  // where run_at <= now() to 'executing' and SELECT them back so we
  // never claim the same row twice across cron ticks.
  const { data: claimed, error: claimErr } = await admin
    .from("my_space_scheduled_actions")
    .update({ status: "executing", updated_at: new Date().toISOString() })
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .select("id, user_id, vendor_id, kind, args")
    .limit(BATCH_LIMIT);
  if (claimErr) {
    console.error("[my-space-action-worker] claim failed", claimErr);
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const rows = (claimed ?? []) as ActionRow[];
  const results: Array<{ id: string; ok: boolean; detail?: string }> = [];

  for (const row of rows) {
    try {
      const out = await executeAction(admin, row);
      await admin
        .from("my_space_scheduled_actions")
        .update({
          status: "done",
          result: out as any,
          executed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      results.push({ id: row.id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await admin
        .from("my_space_scheduled_actions")
        .update({
          status: "failed",
          error_message: message.slice(0, 480),
          executed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      results.push({ id: row.id, ok: false, detail: message.slice(0, 240) });
    }
  }

  return new Response(
    JSON.stringify({ processed: rows.length, results }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
