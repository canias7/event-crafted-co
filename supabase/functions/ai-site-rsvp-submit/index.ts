// AI Website Builder — RSVP submission handler.
//
// Generated event sites include a <form method="POST" action="...">
// pointing at this endpoint. The form posts with form-encoded body
// and a ?slug=<slug> query string. We insert into ai_site_rsvps and
// return a pretty thank-you HTML page that the iframe navigates to.
//
// No JS required in the generated site — the browser handles the
// POST + navigate natively, which is why allow-forms is the only
// sandbox flag the public renderer needs.
//
// Auth: public (verify_jwt = false).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function htmlPage(opts: {
  status: number;
  title: string;
  heading: string;
  body: string;
  accent?: string;
}) {
  const accent = opts.accent ?? "#1a1a1a";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${opts.title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #fafaf7;
    color: #1a1a1a;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    line-height: 1.6;
  }
  .card {
    max-width: 480px;
    text-align: center;
    background: #fff;
    padding: 3rem 2rem;
    border-radius: 24px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.08);
    animation: fadeUp 0.6s ease;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${accent};
    margin: 0 auto 1.5rem;
  }
  h1 {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 500;
    font-size: clamp(1.5rem, 4vw, 2rem);
    margin-bottom: 0.75rem;
    color: #1a1a1a;
  }
  p { color: #555; font-size: 0.95rem; }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="dot"></div>
    <h1>${opts.heading}</h1>
    <p>${opts.body}</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: opts.status,
    headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method !== "POST") {
    return htmlPage({
      status: 405,
      title: "Method not allowed",
      heading: "Whoops",
      body: "This page only accepts RSVP submissions.",
    });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim() ?? "";
  if (!slug) {
    return htmlPage({
      status: 400,
      title: "Missing site",
      heading: "Hmm.",
      body: "The RSVP form is missing the site reference.",
    });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return htmlPage({
      status: 400,
      title: "Bad request",
      heading: "Couldn't read your reply",
      body: "Please go back and try again.",
    });
  }

  const guestName = String(form.get("name") ?? "").trim().slice(0, 120);
  const guestEmail = String(form.get("email") ?? "").trim().slice(0, 200) || null;
  const attendingRaw = String(form.get("attending") ?? "").trim().toLowerCase();
  const attending =
    attendingRaw === "yes" || attendingRaw === "no" || attendingRaw === "maybe"
      ? attendingRaw
      : null;
  const guestsCountRaw = Number(form.get("guests") ?? "1");
  const guestsCount =
    Number.isFinite(guestsCountRaw) && guestsCountRaw >= 1 && guestsCountRaw <= 20
      ? Math.floor(guestsCountRaw)
      : 1;
  const message = String(form.get("message") ?? "").trim().slice(0, 2000) || null;
  const mealChoice = String(form.get("meal") ?? form.get("meal_choice") ?? "").trim().slice(0, 80) || null;
  const plusOneName = String(form.get("plus_one_name") ?? "").trim().slice(0, 120) || null;
  const plusOneMeal = String(form.get("plus_one_meal") ?? "").trim().slice(0, 80) || null;

  if (!guestName) {
    return htmlPage({
      status: 400,
      title: "Name needed",
      heading: "We need your name",
      body: "Please go back and add who's RSVPing.",
    });
  }
  if (!attending) {
    return htmlPage({
      status: 400,
      title: "Attending?",
      heading: "Pick yes, no, or maybe",
      body: "Please go back and select whether you can make it.",
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: site, error: siteErr } = await admin
    .from("ai_sites")
    .select("id, title")
    .eq("slug", slug)
    .maybeSingle();

  if (siteErr || !site) {
    return htmlPage({
      status: 404,
      title: "Site not found",
      heading: "We couldn't find that event",
      body: "The link might be expired or mistyped.",
    });
  }

  const { error: insertErr } = await admin.from("ai_site_rsvps").insert({
    site_id: (site as { id: string }).id,
    guest_name: guestName,
    guest_email: guestEmail,
    attending,
    guests_count: guestsCount,
    message,
    meal_choice: mealChoice,
    plus_one_name: plusOneName,
    plus_one_meal: plusOneMeal,
  });

  if (insertErr) {
    console.error("[ai-site-rsvp-submit] insert error", insertErr);
    return htmlPage({
      status: 500,
      title: "Couldn't save",
      heading: "Something went wrong",
      body: "Your RSVP didn't save. Please try again in a moment.",
    });
  }

  const thanks =
    attending === "yes"
      ? `Can't wait to see you, ${escapeHtml(guestName.split(" ")[0])}! 🎉`
      : attending === "maybe"
        ? `Got it, ${escapeHtml(guestName.split(" ")[0])} — keep us posted.`
        : `Thanks for letting us know, ${escapeHtml(guestName.split(" ")[0])}.`;

  return htmlPage({
    status: 200,
    title: "RSVP received",
    heading: thanks,
    body: `Your reply for ${escapeHtml((site as { title: string }).title)} is in.`,
  });
});
