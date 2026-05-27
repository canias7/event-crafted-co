// AI Website Builder — public comment wall / well-wishes board.
//
// POST {slug, name, message} (public) → creates a new message for the site.
// POST {site_id, action: "list"}      → owner lists all (approved + pending).
// POST {site_id, action: "delete", message_id} → owner deletes.
//
// Form-encoded and JSON bodies both supported on public posts so the
// generated site can submit via plain <form method="POST"> like the
// RSVP form does.
//
// Auth:
// - Public POST (slug + name + message): no auth needed. The slug
//   resolves to a site row; we never trust client-provided site_id
//   on public posts.
// - Owner POST (action: list/delete): owner-only via JWT.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") ?? "";
  return xf.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || "";
}

async function rateLimit(
  admin: any,
  ip: string,
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  if (!ip) return true;
  const now = Date.now();
  try {
    const { data } = await admin
      .from("ai_site_rate_limits")
      .select("hits, window_start")
      .eq("ip", ip)
      .eq("bucket", bucket)
      .maybeSingle();
    if (!data) {
      await admin.from("ai_site_rate_limits").insert({ ip, bucket, hits: 1 });
      return true;
    }
    const wsTime = new Date((data as any).window_start).getTime();
    if (wsTime < now - windowSec * 1000) {
      await admin
        .from("ai_site_rate_limits")
        .update({ hits: 1, window_start: new Date().toISOString() })
        .eq("ip", ip)
        .eq("bucket", bucket);
      return true;
    }
    if ((data as any).hits >= limit) return false;
    await admin
      .from("ai_site_rate_limits")
      .update({ hits: (data as any).hits + 1 })
      .eq("ip", ip)
      .eq("bucket", bucket);
    return true;
  } catch {
    return true;
  }
}

function rateLimitedPage(slug: string): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, "");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Slow down</title><style>body{font-family:Georgia,serif;background:#1a1a1a;color:#f5ead5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center}.c{max-width:380px}h1{font-style:italic;font-size:1.8rem;margin:0 0 0.75rem;color:#c9a86a}p{opacity:0.7;line-height:1.6;margin:0 0 1.5rem}a{display:inline-block;color:#c9a86a;border:1px solid #c9a86a;padding:0.6rem 1.4rem;border-radius:999px;text-decoration:none;font-size:0.85rem}</style></head><body><div class="c"><h1>One sec</h1><p>You've posted a lot of messages in the last couple minutes. Try again shortly.</p><a href="/s/${safe}">Back to the site</a></div></body></html>`;
}

function thankYouPage(slug: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Message sent</title>
<style>body{font-family:Georgia,serif;background:#1a1a1a;color:#f5ead5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center}.c{max-width:380px}h1{font-style:italic;font-size:1.8rem;margin:0 0 0.75rem;color:#c9a86a}p{opacity:0.7;line-height:1.6;margin:0 0 1.5rem}a{display:inline-block;color:#c9a86a;border:1px solid #c9a86a;padding:0.6rem 1.4rem;border-radius:999px;text-decoration:none;font-size:0.85rem;letter-spacing:0.1em}</style>
</head><body><div class="c"><h1>Thank you</h1><p>Your message has been added to the wall.</p><a href="/s/${slug.replace(/[^a-z0-9-]/gi, "")}">Back to the site</a></div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Public form-encoded posts come from the generated site's comment wall form.
  // Owner JSON posts (list/delete) come from the builder.
  const contentType = req.headers.get("content-type") ?? "";
  const isForm = contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  // --- PUBLIC POST PATH ---
  if (isForm) {
    const form = await req.formData();
    const slug = (form.get("slug") ?? new URL(req.url).searchParams.get("slug") ?? "").toString().trim();
    const name = (form.get("name") ?? "").toString().trim().slice(0, 80);
    const message = (form.get("message") ?? "").toString().trim().slice(0, 600);
    if (!slug || !name || !message) {
      return new Response("Missing fields", { status: 400 });
    }

    // Throttle comment posts: 4 per IP per slug per 2 minutes.
    const ip = clientIp(req);
    const allowed = await rateLimit(admin, ip, `msg:${slug}`, 4, 120);
    if (!allowed) {
      return new Response(rateLimitedPage(slug), {
        status: 429,
        headers: { "Content-Type": "text/html; charset=utf-8", ...cors },
      });
    }

    const { data: site } = await admin
      .from("ai_sites")
      .select("id, slug, is_blocked")
      .eq("slug", slug)
      .maybeSingle();
    if (!site || (site as any).is_blocked) {
      return new Response("Site not found", { status: 404 });
    }
    await admin.from("ai_site_messages").insert({
      site_id: (site as any).id,
      name,
      message,
      approved: true,
    });
    return new Response(thankYouPage((site as any).slug), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...cors },
    });
  }

  // --- JSON-only owner paths (list / delete) ---
  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const action = String(payload?.action ?? "list");
  const siteId = String(payload?.site_id ?? "").trim();
  if (!siteId) return json(400, { error: "missing_site_id" });

  let authedUserId: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearer && bearer !== SUPABASE_ANON_KEY) {
    try {
      const uc = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data } = await uc.auth.getUser();
      authedUserId = data?.user?.id ?? null;
    } catch { /* anon */ }
  }

  const { data: site, error: siteErr } = await admin
    .from("ai_sites")
    .select("id, slug, owner_user_id")
    .eq("id", siteId)
    .maybeSingle();
  if (siteErr || !site) return json(404, { error: "site_not_found" });
  const s = site as { id: string; slug: string; owner_user_id: string | null };
  if (s.owner_user_id && s.owner_user_id !== authedUserId) {
    return json(403, { error: "not_owner" });
  }

  if (action === "list") {
    const { data, error } = await admin
      .from("ai_site_messages")
      .select("id, name, message, approved, created_at")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return json(500, { error: "list_failed" });
    return json(200, { messages: data ?? [] });
  }

  if (action === "delete") {
    const messageId = String(payload?.message_id ?? "").trim();
    if (!messageId) return json(400, { error: "missing_message_id" });
    const { error } = await admin
      .from("ai_site_messages")
      .delete()
      .eq("id", messageId)
      .eq("site_id", siteId);
    if (error) return json(500, { error: "delete_failed" });
    return json(200, { deleted: true });
  }

  if (action === "moderate") {
    const messageId = String(payload?.message_id ?? "").trim();
    if (!messageId) return json(400, { error: "missing_message_id" });
    const approved = !!payload?.approved;
    const { error } = await admin
      .from("ai_site_messages")
      .update({ approved })
      .eq("id", messageId)
      .eq("site_id", siteId);
    if (error) return json(500, { error: "moderate_failed" });
    return json(200, { ok: true });
  }

  return json(400, { error: "invalid_action" });
});
