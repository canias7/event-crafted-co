// AI Website Builder — generate OR edit a small event microsite.
//
// Two modes:
//   • new      — POST {prompt, conversation?, owner_user_id?}
//                → creates a new row, returns a slug.
//   • edit     — POST {prompt, edit_site_id, conversation?}
//                → loads current HTML, asks Claude for the modified
//                  full HTML, UPDATEs the row in place. Same slug.
//
// Streaming: response is text/event-stream. Each Anthropic text_delta
// becomes `data: {"type":"chunk","text":"..."}`. After the model
// finishes we save and emit `data: {"type":"done","slug":"...","title":"..."}`.
//
// Auth: public (verify_jwt = false). Inserts/updates run with service
// role; if owner_user_id is included in the request payload we trust
// it (the frontend reads it from the user's session — see the
// useAuth-gated builder page).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// Pre-flight content filter. Anthropic + OpenAI both have safety
// layers; this is a cheap upfront gate to reject obvious abuse
// before we burn an API call. Kept inline (rather than imported from
// _shared) because the Supabase function deploy bundles one file at
// a time.
const BLOCKED_TERMS = [
  "porn", "pornographic", "xxx", "nude", "nudes", "nsfw", "erotic",
  "kill yourself", "kys", "school shooting", "make a bomb",
  "build a bomb", "child porn", "csam",
  "nigger", "n1gger", "faggot", "kike", "chink", "spic", "tranny",
  "retard",
];
function moderatePrompt(prompt: string): { ok: true } | { ok: false; reason: string } {
  if (!prompt) return { ok: true };
  const n = prompt.toLowerCase();
  for (const t of BLOCKED_TERMS) {
    if (n.includes(t)) return { ok: false, reason: "blocked_content" };
  }
  return { ok: true };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const MODEL = "claude-sonnet-4-6";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Verified working Unsplash photo IDs. These are stable URLs that
// returned 200 at the time of the playbook write. Claude is told to
// pick FROM this list rather than invent IDs (which often 404).
//
// If you want to extend: HEAD-check first with
// `curl -sk -o /dev/null -w "%{http_code}" https://images.unsplash.com/photo-<id>?w=400&q=80`.
const VERIFIED_PHOTOS = `
ROMANTIC / WEDDING / COUPLES:
  photo-1519741497674-611481863552 (couple silhouette beach)
  photo-1465495976277-4387d4b0b4c6 (couple sunset)
  photo-1469371670807-013ccf25f16a (couple romantic)
  photo-1464366400600-7168b8af9bc3 (couple twilight)
  photo-1525772764200-be829a350797 (wedding florals)
  photo-1519225421980-715cb0215aed (wedding decor)
  photo-1511795409834-ef04bbd61622 (pink florals)
  photo-1583939003579-730e3918a45a (rings)
  photo-1478146896981-b80fe463b330 (elegant flowers)
  photo-1487530811176-3780de880c2d (wedding flowers)

PARTY / CELEBRATION:
  photo-1530103862676-de8c9debad1d (birthday balloons)
  photo-1530103043960-ef38714abb15 (cake)
  photo-1492684223066-81342ee5ff30 (party balloons)
  photo-1502635385003-ee1e6a1a742d (celebration scene)
  photo-1606800052052-a08af7148866 (decor elegant)
  photo-1565538810643-b5bdb714032a (party decor)
  photo-1471520201477-47a62a269a87 (decor / atmosphere)
  photo-1500076656116-558758c991c1 (event scene)
  photo-1490822180406-880c226c150b (event atmosphere)
  photo-1503424886307-b090341d25d1 (party scene)
  photo-1543351611-58f69d7c1781 (party / decor)
  photo-1517457373958-b7bdd4587205 (decor)
  photo-1496843916299-590492c751f4 (celebration)

FOOD / TABLE:
  photo-1414235077428-338989a2e8c0 (set table)
  photo-1555939594-58d7cb561ad1 (grill / bbq)
  photo-1607706189992-eae578626c86 (florals + items)

URL format: https://images.unsplash.com/photo-<id>?w=1600&auto=format&fit=crop
`;

const EVENT_PLAYBOOKS = `=== EVENT PLAYBOOKS ===

Before generating, identify the event type from the user's prompt and apply the matching playbook. Use the playbook's expected sections, copy patterns, and palette guidance. Adapt to specifics the user provided (names, dates, vibe) — never override their explicit choices.

— WEDDING (formal or casual)
  Sections: Hero (couple names + date + location), Our Story (how they met / proposal), Wedding Party (optional), Schedule (Ceremony → Cocktail Hour → Reception), Travel & Stay, Registry, Dress Code, FAQs, RSVP, Thank you.
  RSVP wording — formal: "Kindly respond by [date]". Casual: "Save us a seat by [date]". Always include a deadline.
  Dress codes: Black Tie, Black Tie Optional, Formal, Cocktail Attire, Semi-Formal, Garden Party, Beach Formal, Festive, Casual.
  Registry default phrasing: "Your presence is the greatest gift, but if you'd like to contribute..."
  Tone: warm, sincere, never crass. First-person plural.
  Palette: deep jewel tones for formal; dusty pastels for garden; warm neutrals for boho/beach; ivory + black + gold for classic.

— KIDS BIRTHDAY (ages 1–12)
  Sections: Hero (kid's name + age + theme), Party Details (start AND end time, address), Activities, What to Bring, Parking/Drop-off, RSVP (to PARENT), Optional Gift Note.
  RSVP wording: "RSVP to [parent name] at [phone/email] by [date]" — parents need contact, not the kid. ALWAYS include end time.
  Dress code: "Wear your favorite [theme]!" / "Costumes encouraged!" — never formal.
  Tone: playful, energetic, plenty of emoji (🎉🎂🎈🦄🦖🌈).
  Palette: bright primaries, candy colors, or theme-driven.
  Photos: AVOID identifiable kid photos. Use emoji decoration, illustrations, party-setup, or CSS art.

— ADULT BIRTHDAY (milestone — 21, 30, 40, 50, 60+)
  Sections: Hero ("Cheers to [age]!"), Details, Optional Memory Wall, No-Gifts Note, Dress Code, RSVP.
  Default no-gifts phrasing: "Your presence is the only present needed."
  Tone: warm, slightly nostalgic for milestones.
  Palette: black/gold/champagne for elegant; bright fun for casual; 1920s reds/golds for speakeasy.

— BABY SHOWER
  Sections: Hero, Shower Details, Games (defaults below), Registry, Diaper Raffle, Dress Code ("pastel attire"), Wishes for Baby, RSVP.
  Default games: "Guess the Date Baby Arrives", "Baby Photo Match", "Don't Say Baby", "Write a Note to Baby".
  Tone: warm, sweet, sometimes sentimental.
  Palette: SOFT pastels. Sage + cream + dusty rose for gender-neutral. AVOID screaming pink/blue.

— GENDER REVEAL
  Sections: Hero ("Boy or Girl?" — both colors), Details, "Place Your Guess" (Team Blue / Team Pink), The Reveal description, Dress Code ("Wear your guess!"), RSVP.
  Tone: anticipatory, playful.
  Palette: 50/50 pink + blue with white/cream.

— BRIDAL SHOWER
  Sections: Hero, Details, Games (defaults below), Registry, Recipe Cards station, RSVP.
  Default games: "How Well Do You Know the Bride", "Bridal Bingo", "Advice for the Bride", "Two Truths and a Lie".
  Tone: feminine, celebratory.
  Palette: blush + champagne + cream; white + sage + gold.

— ENGAGEMENT PARTY
  Sections: Hero (couple + "are engaged!"), Their Story, Party Details, Dress Code, RSVP. NO registry.
  Tone: celebratory, romantic, often less formal than the wedding.
  Palette: champagne + cream + soft pink; navy + blush.

— ANNIVERSARY (10, 25, 50 etc.)
  Sections: Hero, Their Story (longer history), Party Details, Memory Wall, Dress Code, RSVP. No gifts standard.
  Tone: nostalgic, multi-generational.
  Palette: 25th = silver+white, 50th = gold+ivory.

— GRADUATION
  Sections: Hero (grad name + degree + class year), Party Details, About the Grad ("what's next"), Photo Journey (optional), RSVP.
  Tone: proud, parent-voiced.

— QUINCEAÑERA
  Sections: Hero ("[Name]'s Quinceañera"), La Misa (Mass), La Recepción, Court of Honor (chambelanes y damas), El Vals, Dress Code, RSVP.
  Tone: regal, family-centered. Bilingual phrases encouraged.
  Palette: rich pinks + gold; deep purples + gold; royal blue + silver. Hint of metallic.

— BAR/BAT MITZVAH
  Sections: Hero (English + Hebrew name + temple), Service Details, Party Details (often Saturday evening), Mitzvah Project, RSVP.
  Tone: warm, achievement-focused.

— HOLIDAY PARTY (Christmas, Hanukkah, NYE, Halloween, Thanksgiving)
  Sections: Hero, Details, Potluck Assignments, Dress Code, RSVP.
  Palette: Christmas — forest green + cranberry + gold; NYE — black + gold; Halloween — black + orange + purple.

— BACKYARD BBQ / COOKOUT / 4TH OF JULY
  Sections: Hero, Details (BYOC), What We're Grilling, Bring-a-Dish, RSVP.
  Tone: casual, fun.
  Palette: 4th of July — red/white/blue; generic — grass green + sunshine yellow.

— DINNER PARTY (intimate)
  Sections: Hero, Details, Menu Tease, Dietary ask, Dress Code, RSVP.
  Palette: candlelight neutrals — cream + black + amber.

— RETIREMENT
  Sections: Hero (years of service), Party Details, About Their Career, Send-off, RSVP.

— HOUSEWARMING
  Sections: Hero ("we're home!"), Details, Gift policy, Directions, RSVP.

— GENERIC / UNCLEAR
  Default to warm and elegant. Serif display + sans body, warm neutrals.

=== END EVENT PLAYBOOKS ===`;

function buildSystemPrompt(rsvpEndpoint: string): string {
  return `You design beautiful single-page event websites — weddings, birthdays, baby showers, engagement parties, anniversaries, graduations, bridal showers, gender reveals, holiday parties, quinceañeras, bar/bat mitzvahs, and more. The vibe is small, cute, personal — not corporate.

${EVENT_PLAYBOOKS}

=== IMAGES (CRITICAL — pick from this list, do NOT invent IDs) ===
${VERIFIED_PHOTOS}

For decorative/filler photos when no themed option fits, use https://picsum.photos/seed/<unique-word>/1600/900 — these always work. CSS gradients + large emoji are also great alternatives. NEVER use a placeholder URL or a made-up Unsplash photo ID.

=== RSVP FORM (CRITICAL — include in EVERY site) ===
Every site MUST include an RSVP <form> with this EXACT shape:

<form method="POST" action="${rsvpEndpoint}">
  <label>Your name<input type="text" name="name" required></label>
  <label>Email (optional)<input type="email" name="email"></label>
  <fieldset>
    <legend>Will you make it?</legend>
    <label><input type="radio" name="attending" value="yes" required> Yes, can't wait!</label>
    <label><input type="radio" name="attending" value="maybe"> Maybe</label>
    <label><input type="radio" name="attending" value="no"> Can't make it</label>
  </fieldset>
  <label>How many of you?<input type="number" name="guests" min="1" max="20" value="1"></label>
  <label>A note (optional)<textarea name="message" rows="3"></textarea></label>
  <button type="submit">Send RSVP</button>
</form>

Style the form to match the site's palette. The action URL is the EXACT string above — do not modify it, do not relativize it, do not add anchors. Keep field names exactly as shown ('name', 'email', 'attending', 'guests', 'message') — these are required for the backend to read them. You can rewrite the visible labels and the submit button text to match the site's voice ("Yes, I'll be there!", "Hold me a seat", "Going / Not going / Maybe"), but the input name attributes and the form's action+method must stay verbatim.

=== OUTPUT RULES (STRICT) ===
1. Reply with ONE complete HTML document and nothing else. No prose before or after, no markdown fences. Start with <!DOCTYPE html> and end with </html>.
2. All CSS in a single <style> tag in <head>. No external CSS, no <link> tags to fonts/CSS, no Tailwind/Bootstrap — system font stacks only.
3. Absolutely NO <script> tags. NO JavaScript. NO inline event handlers. The page MUST work with JS disabled (and indeed JS is blocked).
4. Apply the matching EVENT PLAYBOOK for sections, copy conventions, RSVP wording, default games, palette, and tone. Honor explicit user overrides.
5. Be specific. Use the user's names/dates/locations verbatim. If they didn't provide them, invent plausible specifics rather than leaving "[Your Name]" blanks.
6. Mobile-first responsive. clamp() for fonts, flex/grid layout, max-width 1200px.
7. Keep total HTML under ~80KB. No filler.
8. Include the RSVP form exactly as specified above.

After </html>, return NOTHING.

Also, on the very first line of your reply, include a comment: <!-- TITLE: Your Chosen Title --> where the title is 3–6 words. Then on the next line start the <!DOCTYPE html>.`;
}

const EDIT_SUFFIX = `

=== EDIT MODE ===
The CURRENT site HTML follows. Apply the user's latest change request to it and return the FULL modified HTML document. Preserve sections the user didn't ask to change — only touch what they asked for. Same output rules: one HTML doc, no prose, no fences, start with the title comment then <!DOCTYPE html>.

CURRENT SITE HTML:
`;

function extractTitle(html: string): string {
  const commentMatch = html.match(/<!--\s*TITLE:\s*([^>-]+?)\s*-->/i);
  if (commentMatch) return commentMatch[1].trim().slice(0, 80);
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim().slice(0, 80);
  return "Untitled event";
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "site";
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${base}-${suffix}`;
}

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "");
  }
  return t.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const userPrompt = String(payload?.prompt ?? "").trim();
  if (!userPrompt) return jsonResponse(400, { error: "missing_prompt" });
  if (userPrompt.length > 4000) return jsonResponse(400, { error: "prompt_too_long" });
  const moderation = moderatePrompt(userPrompt);
  if (!moderation.ok) return jsonResponse(400, { error: moderation.reason });
  if (!ANTHROPIC_API_KEY) return jsonResponse(500, { error: "ANTHROPIC_API_KEY not set" });

  const editSiteId =
    typeof payload?.edit_site_id === "string" && payload.edit_site_id.length > 0
      ? payload.edit_site_id
      : null;

  // Resolve the signed-in user (if any) from the bearer header. We
  // only honor owner_user_id from the JWT — never trust a client-
  // provided field.
  let authedUserId: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearer && bearer !== SUPABASE_ANON_KEY) {
    try {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data } = await userClient.auth.getUser();
      authedUserId = data?.user?.id ?? null;
    } catch {
      // anon — ignore
    }
  }

  const rawConv = Array.isArray(payload?.conversation) ? payload.conversation : [];
  const conversation = rawConv
    .filter(
      (m: any) =>
        m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .slice(-10)
    .map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content).slice(0, 8000),
    }));

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // For edit mode, load the current site and gate access.
  let currentSite: {
    id: string;
    slug: string;
    html: string;
    owner_user_id: string | null;
    edit_count: number;
  } | null = null;
  if (editSiteId) {
    const { data, error } = await admin
      .from("ai_sites")
      .select("id, slug, html, owner_user_id, edit_count")
      .eq("id", editSiteId)
      .maybeSingle();
    if (error || !data) {
      return jsonResponse(404, { error: "site_not_found" });
    }
    currentSite = data as any;
    // If the site has an owner, only the owner can edit. Anonymous
    // sites (owner_user_id IS NULL) are editable by anyone during
    // their builder session — slug isn't shared until they publish,
    // and the testing flow needs this.
    if (
      currentSite!.owner_user_id &&
      currentSite!.owner_user_id !== authedUserId
    ) {
      return jsonResponse(403, { error: "not_owner" });
    }
  }

  const rsvpEndpoint = `${SUPABASE_URL}/functions/v1/ai-site-rsvp-submit?slug=__SLUG__`;
  const baseSystem = buildSystemPrompt(rsvpEndpoint);
  const systemText = currentSite
    ? baseSystem + EDIT_SUFFIX + currentSite.html
    : baseSystem;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      stream: true,
      system: [
        {
          type: "text",
          text: systemText,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        ...conversation,
        { role: "user" as const, content: userPrompt },
      ],
    }),
  });

  if (!anthropicRes.ok || !anthropicRes.body) {
    const errText = await anthropicRes.text().catch(() => "");
    console.error("[ai-site-generate] anthropic error", anthropicRes.status, errText);
    return jsonResponse(502, { error: `anthropic_${anthropicRes.status}` });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      let fullText = "";
      try {
        const reader = anthropicRes.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const events = buf.split("\n\n");
          buf = events.pop() ?? "";
          for (const evt of events) {
            for (const line of evt.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const payloadStr = line.slice(6);
              try {
                const data = JSON.parse(payloadStr);
                if (
                  data?.type === "content_block_delta" &&
                  data?.delta?.type === "text_delta" &&
                  typeof data.delta.text === "string"
                ) {
                  fullText += data.delta.text;
                  send({ type: "chunk", text: data.delta.text });
                }
              } catch {
                // ignore non-JSON keepalive lines
              }
            }
          }
        }
      } catch (e) {
        console.error("[ai-site-generate] stream read error", e);
        send({ type: "error", message: "stream_failed" });
        controller.close();
        return;
      }

      let html = stripCodeFences(fullText);
      if (!html.toLowerCase().includes("<!doctype html")) {
        console.error("[ai-site-generate] non-html reply", html.slice(0, 200));
        send({ type: "error", message: "invalid_generation" });
        controller.close();
        return;
      }

      const title = extractTitle(html);
      const slug = currentSite ? currentSite.slug : slugify(title);
      // Short description for OG tags. Pull from <meta name="description">
      // if Claude included one; otherwise derive from title.
      const descMatch = html.match(
        /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
      );
      const ogDescription = descMatch
        ? descMatch[1].slice(0, 200)
        : `${title} — RSVP and event details.`;

      // Force-correct the slug in the RSVP form action. Claude often
      // ignores the __SLUG__ placeholder and invents a plausible slug
      // from the event title — that would cause RSVPs to 404 against
      // the real slug. We rewrite ANY slug= query param attached to
      // ai-site-rsvp-submit URLs to the actual slug for this site.
      html = html.replace(
        /(ai-site-rsvp-submit[^"' ]*?[?&]slug=)([^"'&\s]*)/g,
        (_m, prefix) => `${prefix}${slug}`,
      );
      // If Claude included the literal placeholder anywhere, fix it too.
      html = html.replaceAll("__SLUG__", slug);

      try {
        if (currentSite) {
          const { error: updateErr } = await admin
            .from("ai_sites")
            .update({
              title,
              prompt: userPrompt,
              html,
              og_description: ogDescription,
              edit_count: (currentSite.edit_count ?? 0) + 1,
            })
            .eq("id", currentSite.id);
          if (updateErr) {
            console.error("[ai-site-generate] update error", updateErr);
            send({ type: "error", message: "save_failed" });
            controller.close();
            return;
          }
          send({ type: "done", slug, title, site_id: currentSite.id });
        } else {
          const { data: inserted, error: insertErr } = await admin
            .from("ai_sites")
            .insert({
              slug,
              title,
              prompt: userPrompt,
              html,
              og_description: ogDescription,
              owner_user_id: authedUserId,
            })
            .select("id")
            .maybeSingle();
          if (insertErr || !inserted) {
            console.error("[ai-site-generate] insert error", insertErr);
            send({ type: "error", message: "save_failed" });
            controller.close();
            return;
          }
          send({
            type: "done",
            slug,
            title,
            site_id: (inserted as { id: string }).id,
          });
        }
      } catch (e) {
        console.error("[ai-site-generate] save exception", e);
        send({ type: "error", message: "save_failed" });
        controller.close();
        return;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});
