// Vercel Edge function: serves public event sites at /s/<slug>.
//
// Why this exists: ai-site-render is a Supabase Edge Function, and the
// Supabase platform forces `Content-Type: text/plain` + a sandbox CSP
// (`default-src 'none'; sandbox`) on any HTML response from the
// *.supabase.co domain (anti-phishing). Proxying that straight through
// Vercel makes browsers show raw source instead of rendering the page.
//
// So we fetch the rendered HTML from the Supabase function and re-emit it
// from our own domain with a proper `text/html; charset=utf-8` header and
// no sandbox CSP — which makes it render (and fixes the text/plain
// charset mojibake on em-dashes etc.). OG/Twitter meta are already in the
// HTML, so link previews keep working.
export const config = { runtime: "edge" };

const RENDER_URL =
  "https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/ai-site-render";

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const guest = url.searchParams.get("g") ?? "";

  const upstream = new URL(RENDER_URL);
  if (slug) upstream.searchParams.set("slug", slug);
  if (guest) upstream.searchParams.set("g", guest);

  let res: Response;
  try {
    res = await fetch(upstream.toString(), {
      headers: { accept: "text/html" },
    });
  } catch {
    return new Response("Upstream render error.", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Body is the fully-rendered HTML (meta tags, motion runtime, etc.).
  // Re-serve it as real HTML from our domain.
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control":
        res.status === 200
          ? "public, max-age=60, s-maxage=60, stale-while-revalidate=300"
          : "no-store",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
