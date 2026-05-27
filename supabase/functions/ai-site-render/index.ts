// AI Website Builder — server-side renderer for public /s/<slug>.
//
// Vercel rewrites /s/:slug → this endpoint, so crawlers (Facebook,
// Twitter/X, iMessage, Slack, etc.) receive a raw HTML response with
// proper Open Graph + Twitter Card meta tags injected into the
// <head>. Crawlers don't execute JS, so SPA-side document.title +
// dynamic meta injection wouldn't work for link previews.
//
// Also strips <script> tags from the stored HTML as defense in
// depth — the model is instructed never to emit JS, but a future
// model regression shouldn't be able to execute on our origin.
//
// Auth: public. GET only.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function htmlResponse(status: number, html: string, cacheSeconds = 60) {
  return new Response(html, {
    status,
    headers: {
      ...cors,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": status === 200 ? `public, max-age=${cacheSeconds}` : "no-store",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripScripts(html: string): string {
  // Belt-and-braces: model is told not to emit <script>, but if it
  // ever did we don't want JS executing on our origin. Strip
  // <script>...</script> blocks and any on* event handlers and
  // javascript: URLs.
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");
}

function findHeroImage(html: string): string | null {
  // Prefer an explicit Unsplash hero (the photo bank ones the model
  // picks), then any <img src> in the document.
  const unsplash = html.match(
    /<img[^>]+src=["']?(https?:\/\/images\.unsplash\.com\/photo-[^"'\s>]+)["']?/i,
  );
  if (unsplash) return unsplash[1];
  const generated = html.match(
    /<img[^>]+src=["']?(https?:\/\/[^"'\s>]*ai-site-images[^"'\s>]+)["']?/i,
  );
  if (generated) return generated[1];
  const anyImg = html.match(/<img[^>]+src=["']?(https?:\/\/[^"'\s>]+)["']?/i);
  if (anyImg) return anyImg[1];
  return null;
}

function injectMetaTags(
  html: string,
  opts: { title: string; description: string; image: string | null; canonical: string },
): string {
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeAttr(opts.title)}">`,
    `<meta property="og:description" content="${escapeAttr(opts.description)}">`,
    `<meta property="og:url" content="${escapeAttr(opts.canonical)}">`,
    `<meta property="og:site_name" content="Vendora">`,
    opts.image
      ? `<meta property="og:image" content="${escapeAttr(opts.image)}">`
      : "",
    `<meta name="twitter:card" content="${opts.image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${escapeAttr(opts.title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(opts.description)}">`,
    opts.image
      ? `<meta name="twitter:image" content="${escapeAttr(opts.image)}">`
      : "",
    `<meta name="description" content="${escapeAttr(opts.description)}">`,
    `<link rel="canonical" href="${escapeAttr(opts.canonical)}">`,
  ]
    .filter(Boolean)
    .join("\n");

  // Inject right after <head>. If somehow there's no <head>, prepend.
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${tags}\n`);
  }
  return tags + html;
}

function notFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Site not found</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #fafafa; color: #1a1a1a;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 2rem; text-align: center; }
  .card { max-width: 420px; }
  h1 { font-family: Georgia, serif; font-weight: 500; font-size: 1.8rem; margin: 0 0 0.75rem; }
  p { color: #666; line-height: 1.6; margin: 0 0 1.5rem; }
  a { display: inline-block; background: #1a1a1a; color: #fff; padding: 0.75rem 1.5rem;
    border-radius: 999px; text-decoration: none; font-size: 0.9rem; }
</style>
</head>
<body>
<div class="card">
  <h1>This event site doesn't exist</h1>
  <p>The link might be expired or mistyped.</p>
  <a href="/website-builder">Build your own</a>
</div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  // Slug can come from query string (when Vercel rewrites
  // /s/:slug?slug=:slug) OR from a path segment.
  let slug = url.searchParams.get("slug")?.trim() ?? "";
  if (!slug) {
    const parts = url.pathname.split("/").filter(Boolean);
    slug = parts[parts.length - 1] ?? "";
  }
  if (!slug) return htmlResponse(404, notFoundPage());

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from("ai_sites")
    .select("id, slug, title, html, og_description, is_blocked, view_count")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data || (data as any).is_blocked) {
    return htmlResponse(404, notFoundPage());
  }

  const site = data as {
    id: string;
    slug: string;
    title: string;
    html: string;
    og_description: string | null;
    view_count: number;
  };

  // Best-effort view counter — don't block the response on it.
  admin
    .rpc("ai_sites_increment_view", { p_slug: site.slug })
    .then(() => undefined, () => undefined);

  const origin = `${url.protocol}//${url.host}`;
  const canonical = `${origin.includes("supabase.co") ? "https://eventvendora.com" : origin}/s/${site.slug}`;
  const description =
    site.og_description?.trim() ||
    `${site.title} — RSVP, schedule, and details.`;
  const heroImage = findHeroImage(site.html);

  let html = stripScripts(site.html);
  html = injectMetaTags(html, {
    title: site.title,
    description,
    image: heroImage,
    canonical,
  });

  // Personalized greeting. If the URL has ?g=<token>, look up the guest
  // and inject their name into the __GUEST_NAME__ placeholder. The
  // generated site is told (via the SAVE-THE-DATE / GUEST GREETING
  // section of the design bible) to wrap the placeholder in a greeting
  // block that's hidden by default and shown when a guest token is
  // present. Server-side lookup means guest names never leak to other
  // visitors.
  const guestToken = url.searchParams.get("g")?.trim() ?? "";
  let guestName: string | null = null;
  if (guestToken && /^[a-z0-9]{6,32}$/i.test(guestToken)) {
    const { data: guest } = await admin
      .from("ai_site_guests")
      .select("name")
      .eq("site_id", site.id)
      .eq("token", guestToken)
      .maybeSingle();
    if (guest) guestName = (guest as { name: string }).name;
  }
  if (html.includes("__GUEST_NAME__") || html.includes("__GUEST_BLOCK__")) {
    if (guestName) {
      html = html.replaceAll("__GUEST_NAME__", guestName);
      html = html.replaceAll(
        "__GUEST_BLOCK__",
        `<div class="guest-greet" style="display:block">Welcome, ${guestName.replace(/[<>&"]/g, "")}.</div>`,
      );
    } else {
      // No guest match — render a sensible default and remove the
      // block so we don't show "Welcome, __GUEST_NAME__" literally.
      html = html.replaceAll("__GUEST_NAME__", "friend");
      html = html.replaceAll("__GUEST_BLOCK__", "");
    }
  }

  // Live RSVP counter. If the generated site includes a __RSVP_COUNT__
  // placeholder anywhere, swap it for the current attending tallies.
  // Cheap aggregate query — count yes/maybe rows from ai_site_rsvps.
  if (html.includes("__RSVP_COUNT__") || html.includes("__RSVP_YES__")) {
    const { data: rsvps } = await admin
      .from("ai_site_rsvps")
      .select("attending")
      .eq("site_id", site.id);
    const rows = (rsvps ?? []) as Array<{ attending: string | null }>;
    let yes = 0, maybe = 0, no = 0;
    for (const r of rows) {
      if (r.attending === "yes") yes++;
      else if (r.attending === "maybe") maybe++;
      else if (r.attending === "no") no++;
    }
    const blockHtml = (yes + maybe + no) === 0
      ? `<span class="rsvp-empty" style="opacity:0.55;font-style:italic">Be the first to RSVP</span>`
      : `<span class="rsvp-tally"><strong>${yes}</strong> yes${maybe ? ` · <strong>${maybe}</strong> maybe` : ""}${no ? ` · <strong>${no}</strong> can't` : ""} so far</span>`;
    html = html.replaceAll("__RSVP_COUNT__", blockHtml);
    html = html.replaceAll("__RSVP_YES__", String(yes));
    html = html.replaceAll("__RSVP_MAYBE__", String(maybe));
    html = html.replaceAll("__RSVP_NO__", String(no));
  }

  return htmlResponse(200, html);
});
