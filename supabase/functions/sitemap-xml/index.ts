// Dynamic sitemap.xml. Returns urlset entries for the static public pages
// plus every public vendor profile and every published inspiration entry.
//
// Submit to Google Search Console as <APP_URL>/functions/v1/sitemap-xml
// (or front it behind a /sitemap.xml redirect at the hosting layer).
//
// No auth required (verify_jwt = false in config.toml). Uses anon-key reads
// since both vendor_profiles and featured_events are public-readable.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://vendora.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

interface VendorRow {
  id: string;
  updated_at: string | null;
  category?: string | null;
  location?: string | null;
}
interface InspirationRow {
  slug: string;
  updated_at?: string | null;
  published_at?: string | null;
}

const CATEGORY_SLUGS = [
  "photographers",
  "florists",
  "catering",
  "djs",
  "venues",
  "makeup-artists",
  "videographers",
  "bakers",
  "event-planners",
  "decorators",
];

function citySlugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const STATIC_PATHS: Array<{ path: string; priority: number; freq: string }> = [
  { path: "/", priority: 1.0, freq: "daily" },
  { path: "/vendors", priority: 0.9, freq: "daily" },
  { path: "/vendors/locations", priority: 0.7, freq: "weekly" },
  { path: "/real-events", priority: 0.8, freq: "weekly" },
  { path: "/inspiration", priority: 0.8, freq: "weekly" },
  { path: "/how-it-works", priority: 0.6, freq: "monthly" },
  { path: "/vendor-apply", priority: 0.6, freq: "monthly" },
  { path: "/compare", priority: 0.6, freq: "weekly" },
  { path: "/guides", priority: 0.7, freq: "weekly" },
  { path: "/admin/reports", priority: 0.1, freq: "yearly" },
  { path: "/privacy", priority: 0.3, freq: "yearly" },
  { path: "/terms", priority: 0.3, freq: "yearly" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return text("Sitemap unavailable: Supabase env not configured", 500);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const [{ data: vendors }, { data: inspiration }, { data: realEvents }] =
    await Promise.all([
      sb
        .from("vendor_profiles")
        .select("id, slug, updated_at, category, location")
        .order("updated_at", { ascending: false }),
      sb
        .from("featured_events")
        .select("slug, updated_at, published_at")
        .not("published_at", "is", null)
        .order("published_at", { ascending: false }),
      sb
        .from("real_events")
        .select("slug, updated_at, published_at, host_consent_given_at")
        .not("published_at", "is", null)
        .not("host_consent_given_at", "is", null)
        .not("slug", "is", null)
        .order("published_at", { ascending: false }),
    ]);

  const { data: articles } = await sb
    .from("editorial_articles")
    .select("slug, updated_at, published_at")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const s of STATIC_PATHS) {
    lines.push(urlEntry(`${APP_URL}${s.path}`, undefined, s.priority, s.freq));
  }

  // All category landing pages (high SEO value).
  for (const c of CATEGORY_SLUGS) {
    lines.push(
      urlEntry(`${APP_URL}/vendors/category/${c}`, undefined, 0.85, "weekly"),
    );
  }

  // Per-city landing pages — derived from current vendor locations so we
  // don't list ghost cities with zero inventory.
  const cities = new Set<string>();
  for (const v of (vendors as VendorRow[] | null) ?? []) {
    const slug = citySlugify(v.location ?? "");
    if (slug) cities.add(slug);
  }
  for (const cs of cities) {
    lines.push(
      urlEntry(`${APP_URL}/vendors/in/${cs}`, undefined, 0.75, "weekly"),
    );
  }

  for (const v of (vendors as VendorRow[] | null) ?? []) {
    lines.push(
      urlEntry(`${APP_URL}/vendors/${v.id}`, v.updated_at ?? undefined, 0.7, "weekly"),
    );
    if ((v as any).slug) {
      lines.push(
        urlEntry(`${APP_URL}/v/${(v as any).slug}`, v.updated_at ?? undefined, 0.7, "weekly"),
      );
    }
  }

  for (const a of (articles as InspirationRow[] | null) ?? []) {
    lines.push(
      urlEntry(
        `${APP_URL}/guides/${a.slug}`,
        a.updated_at ?? a.published_at ?? undefined,
        0.6,
        "monthly",
      ),
    );
  }

  for (const i of (inspiration as InspirationRow[] | null) ?? []) {
    lines.push(
      urlEntry(
        `${APP_URL}/inspiration/${i.slug}`,
        i.updated_at ?? i.published_at ?? undefined,
        0.6,
        "monthly",
      ),
    );
  }

  for (const r of (realEvents as InspirationRow[] | null) ?? []) {
    lines.push(
      urlEntry(
        `${APP_URL}/real-events/${r.slug}`,
        r.updated_at ?? r.published_at ?? undefined,
        0.7,
        "monthly",
      ),
    );
  }

  lines.push("</urlset>");

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});

function urlEntry(
  loc: string,
  lastmod: string | undefined,
  priority: number,
  changefreq: string,
) {
  const parts = [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${new Date(lastmod).toISOString()}</lastmod>` : "",
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority.toFixed(1)}</priority>`,
    "  </url>",
  ].filter(Boolean);
  return parts.join("\n");
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function text(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" },
  });
}
