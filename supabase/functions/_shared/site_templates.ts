// AI Website Builder — template composition engine.
//
// Takes a structured event spec and returns a complete, premium HTML
// document. Replaces the "Claude writes every CSS rule from scratch"
// approach with hand-crafted component templates that compose in
// milliseconds. Claude is upstream: it only generates the spec
// (which theme, what copy, what photos) — never the HTML itself.
//
// Why this exists: generating an 18k-token wedding HTML through
// Claude takes ~3-5 minutes at ~60 tok/s. Generating a ~500-token
// spec takes ~5s. The premium feel is preserved because the
// templates here are hand-tuned and never change.
//
// Architecture: pure data → string. No DB calls, no fetch. Safe to
// import from any edge function. The output still uses our standard
// placeholders (__SLUG__, __RSVP_COUNT__, __GUEST_BLOCK__,
// __COMMENT_WALL__, __PHOTO_ALBUM__, __PLUS_ONE_BLOCK__) so
// ai-site-render's existing injection pipeline keeps working.

// deno-lint-ignore-file no-explicit-any

// ───────────────────────────────────────────────────────────────────
// THEMES
// Each theme is a palette + font pairing + minor accent overrides.
// Hand-tuned for premium feel; the renderer pulls these into CSS
// custom properties and reads them everywhere.
// ───────────────────────────────────────────────────────────────────

export type ThemeId =
  | "moody-burgundy"
  | "garden-floral"
  | "tuscan-dusk"
  | "navy-champagne"
  | "dusty-pink-sage"
  | "black-tie-velvet"
  | "baby-pastel"
  | "evergreen-holiday"
  | "tropical-boho"
  | "corporate-mono";

export interface Theme {
  id: ThemeId;
  label: string;
  // Hex palette
  bg: string;       // page background (cover + body fallback)
  surface: string;  // cream paper card surface
  surface2: string; // alt surface for variety
  text: string;     // body text on surface
  accent: string;   // primary accent
  gold: string;     // secondary accent
  // Google Font names (loaded via one <link>)
  display: string;  // hero / cover names
  body: string;     // paragraph + form text
  script: string;   // italic accents
  // Vibe hints
  paperTexture: "linen" | "marble" | "kraft" | "velvet" | "parchment" | "smooth";
  particle: "petal" | "ember" | "snow" | "leaf" | "star" | "bokeh" | "confetti" | "none";
}

export const THEMES: Record<ThemeId, Theme> = {
  "moody-burgundy": {
    id: "moody-burgundy", label: "Moody Burgundy",
    bg: "#1a1a1a", surface: "#f5ead5", surface2: "#ede0c4", text: "#1a1610",
    accent: "#8b2c2c", gold: "#c9a86a",
    display: "Cormorant Garamond", body: "Inter", script: "Pinyon Script",
    paperTexture: "linen", particle: "petal",
  },
  "garden-floral": {
    id: "garden-floral", label: "Garden Floral",
    bg: "#1f3327", surface: "#f5f0e6", surface2: "#ebe3d2", text: "#1f3327",
    accent: "#5e7548", gold: "#b9a76d",
    display: "Italiana", body: "Karla", script: "Allura",
    paperTexture: "linen", particle: "petal",
  },
  "tuscan-dusk": {
    id: "tuscan-dusk", label: "Tuscan Dusk",
    bg: "#2a1810", surface: "#f7ebd9", surface2: "#ecdcc2", text: "#2a1810",
    accent: "#a8341e", gold: "#d4a857",
    display: "Cormorant Garamond", body: "Lora", script: "Allura",
    paperTexture: "parchment", particle: "ember",
  },
  "navy-champagne": {
    id: "navy-champagne", label: "Navy & Champagne",
    bg: "#14213d", surface: "#fefae0", surface2: "#f3ebbf", text: "#14213d",
    accent: "#6d6875", gold: "#d4a957",
    display: "Playfair Display", body: "Lato", script: "Pinyon Script",
    paperTexture: "smooth", particle: "bokeh",
  },
  "dusty-pink-sage": {
    id: "dusty-pink-sage", label: "Dusty Pink & Sage",
    bg: "#fdf2ec", surface: "#ffffff", surface2: "#f7ede4", text: "#5d4037",
    accent: "#8b5d62", gold: "#b4a47a",
    display: "DM Serif Display", body: "Manrope", script: "Caveat",
    paperTexture: "smooth", particle: "petal",
  },
  "black-tie-velvet": {
    id: "black-tie-velvet", label: "Black Tie",
    bg: "#000000", surface: "#f8f1e0", surface2: "#e8dcc0", text: "#0a0a0a",
    accent: "#5e2129", gold: "#c5a572",
    display: "Bodoni Moda", body: "Inter", script: "Pinyon Script",
    paperTexture: "velvet", particle: "star",
  },
  "baby-pastel": {
    id: "baby-pastel", label: "Baby Pastel",
    bg: "#fdf8f0", surface: "#ffffff", surface2: "#fdf2ec", text: "#3d2f25",
    accent: "#c3b39d", gold: "#e6c1ba",
    display: "DM Serif Display", body: "Quicksand", script: "Caveat",
    paperTexture: "smooth", particle: "petal",
  },
  "evergreen-holiday": {
    id: "evergreen-holiday", label: "Evergreen Holiday",
    bg: "#0d2818", surface: "#f5f0e6", surface2: "#e8dac2", text: "#0d2818",
    accent: "#7d1f1f", gold: "#b59060",
    display: "Cinzel", body: "Lato", script: "Allura",
    paperTexture: "kraft", particle: "snow",
  },
  "tropical-boho": {
    id: "tropical-boho", label: "Tropical Boho",
    bg: "#3a2a1a", surface: "#fdf2dc", surface2: "#f0dfb8", text: "#3a2a1a",
    accent: "#d97757", gold: "#c9a86a",
    display: "Cormorant Garamond", body: "Karla", script: "Allura",
    paperTexture: "kraft", particle: "leaf",
  },
  "corporate-mono": {
    id: "corporate-mono", label: "Corporate Monochrome",
    bg: "#fafafa", surface: "#ffffff", surface2: "#f0f0f0", text: "#1a1a1a",
    accent: "#1a1a1a", gold: "#888888",
    display: "Playfair Display", body: "Inter", script: "Inter",
    paperTexture: "smooth", particle: "none",
  },
};

// ───────────────────────────────────────────────────────────────────
// SECTION SPEC TYPES
// ───────────────────────────────────────────────────────────────────

export type EventType =
  | "wedding" | "engagement" | "anniversary" | "vow_renewal"
  | "birthday" | "milestone_birthday" | "kids_birthday"
  | "baby_shower" | "bridal_shower" | "gender_reveal"
  | "graduation" | "retirement"
  | "dinner" | "cocktail" | "holiday_party"
  | "quinceanera" | "bar_mitzvah" | "bat_mitzvah"
  | "corporate" | "gala" | "fundraiser"
  | "housewarming" | "bbq" | "general";

export type Section =
  | { type: "story"; title?: string; body: string; image?: string }
  | { type: "schedule"; title?: string; items: Array<{ time: string; label: string; detail?: string }> }
  | { type: "travel"; title?: string; body: string; hotel?: string; map?: boolean }
  | { type: "registry"; title?: string; intro?: string; links: Array<{ label: string; url: string }> }
  | { type: "dress_code"; code: string; body?: string }
  | { type: "faqs"; title?: string; items: Array<{ q: string; a: string }> }
  | { type: "rsvp"; title?: string; intro?: string; include_meal?: boolean }
  | { type: "photo_album"; title?: string; intro?: string }
  | { type: "comment_wall"; title?: string; intro?: string }
  | { type: "quote"; body: string; attribution?: string }
  | { type: "gallery_strip"; images: string[] }
  | { type: "signature"; body: string; signoff?: string };

export interface Spec {
  event_type: EventType;
  theme: ThemeId;
  title: string;
  subtitle?: string;
  honorees?: string[];
  monogram?: string;
  event_start?: string; // ISO 8601 with tz
  event_end?: string;
  venue?: string;
  venue_address?: string;
  venue_lat?: number;
  venue_lng?: number;
  hero_image?: string;
  hero_overlay_opacity?: number;
  cover_variant?: "envelope" | "monogram" | "magazine";
  cover_eyebrow?: string;
  cover_seal_text?: string;
  sections: Section[];
  meta_description?: string;
}

// ───────────────────────────────────────────────────────────────────
// HTML COMPOSITION
// ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  ));
}

function fmtDateISO(iso?: string): { day: number; date: string; year: number; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const hours = d.getUTCHours();
  const mins = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = ((hours + 11) % 12) + 1;
  return {
    day: d.getUTCDate(),
    date: months[d.getUTCMonth()] + " " + d.getUTCDate(),
    year: d.getUTCFullYear(),
    time: `${h12}:${mins} ${ampm}`,
  };
}

function googleFontsLink(t: Theme): string {
  const families = new Set([t.display, t.body, t.script]);
  const family = Array.from(families).map((f) => f.replace(/\s+/g, "+")).join("&family=");
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}:wght@300;400;500;600;700&display=swap">`;
}

function paperTextureCss(t: Theme): string {
  switch (t.paperTexture) {
    case "linen":
      return `background-image:repeating-linear-gradient(45deg,transparent 0 2px,rgba(0,0,0,0.025) 2px 3px),repeating-linear-gradient(-45deg,transparent 0 2px,rgba(0,0,0,0.02) 2px 3px);`;
    case "parchment":
      return `background-image:radial-gradient(at 30% 20%, rgba(180,140,90,0.08) 0%, transparent 50%),radial-gradient(at 70% 80%, rgba(180,140,90,0.05) 0%, transparent 40%);`;
    case "marble":
      return `background-image:radial-gradient(ellipse at 30% 40%, rgba(255,255,255,0.4) 0%, transparent 60%),radial-gradient(ellipse at 70% 70%, rgba(0,0,0,0.04) 0%, transparent 60%);`;
    case "velvet":
      return `background-image:radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 100%);`;
    case "kraft":
      return `background-image:repeating-linear-gradient(0deg,transparent 0 1px,rgba(120,80,40,0.04) 1px 2px);`;
    default:
      return "";
  }
}

function particleField(t: Theme): string {
  if (t.particle === "none") return "";
  const colors: Record<string, string> = {
    petal: t.accent,
    ember: "#ff8c40",
    snow: "#ffffff",
    leaf: "#a8623f",
    star: t.gold,
    bokeh: t.gold,
    confetti: t.accent,
  };
  const c = colors[t.particle];
  const spans = Array.from({ length: 14 }, (_, i) => {
    const x = ((i * 7.3) % 100).toFixed(1);
    const dur = (10 + (i % 5) * 2).toFixed(0);
    const delay = (i * 0.6).toFixed(1);
    return `<span style="--x:${x}%;--d:${dur}s;--delay:${delay}s"></span>`;
  }).join("");
  return `<div class="particles" aria-hidden="true">${spans}</div>
<style>
.particles{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:1}
.particles span{position:absolute;top:-20px;left:var(--x);width:8px;height:11px;background:${c};border-radius:50% 0 50% 0;opacity:0.5;animation:fall var(--d) linear infinite;animation-delay:var(--delay)}
@keyframes fall{0%{transform:translateY(0) rotate(0deg) translateX(0)}50%{transform:translateY(50vh) rotate(360deg) translateX(20px)}100%{transform:translateY(110vh) rotate(720deg) translateX(-10px)}}
</style>`;
}

function staticMap(spec: Spec, t: Theme): string {
  if (!spec.venue_lat || !spec.venue_lng) return "";
  const { venue_lat: la, venue_lng: lo } = spec;
  // OpenStreetMap embed with a small offset bbox around the venue.
  const off = 0.012;
  const bbox = `${(lo - off).toFixed(5)},${(la - off).toFixed(5)},${(lo + off).toFixed(5)},${(la + off).toFixed(5)}`;
  return `<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${la.toFixed(5)},${lo.toFixed(5)}&layer=mapnik" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px;filter:saturate(0.7)" loading="lazy" title="Venue map"></iframe>`;
}

// ───── Cover variants ─────

function renderCover(spec: Spec, t: Theme): string {
  const variant = spec.cover_variant || "envelope";
  const eyebrow = spec.cover_eyebrow ?? "You're invited to";
  const dateInfo = fmtDateISO(spec.event_start);
  const dateLine = dateInfo
    ? `<div class="cover-date" style="font-family:'${t.body}',sans-serif;font-size:0.72rem;letter-spacing:0.3em;text-transform:uppercase;color:${t.gold};margin-top:2rem;opacity:0.85">${dateInfo.date}, ${dateInfo.year}</div>`
    : "";

  const titleHtml = spec.honorees && spec.honorees.length
    ? spec.honorees.map(esc).join(`<br><span style="font-family:'${t.body}',sans-serif;font-size:0.4em;letter-spacing:0.3em;display:inline-block;margin:0.2em 0;opacity:0.7">&</span><br>`)
    : esc(spec.title);

  if (variant === "monogram" && spec.monogram) {
    return `
<input type="checkbox" id="opener" class="opener-toggle">
<label for="opener" class="cover-page" aria-label="Tap to open invitation">
  ${particleField(t)}
  <div class="cover-eyebrow">${esc(eyebrow)}</div>
  <div class="monogram-crest" aria-hidden="true">
    <svg viewBox="0 0 200 200" width="180" height="180" style="fill:none;stroke:${t.gold};stroke-width:1.5">
      <circle cx="100" cy="100" r="90" stroke-opacity="0.45"/>
      <circle cx="100" cy="100" r="78" stroke-opacity="0.3"/>
      <text x="100" y="115" text-anchor="middle" style="font-family:'${t.script}',cursive;font-size:64px;fill:${t.gold};stroke:none">${esc(spec.monogram)}</text>
      <path d="M40 100 Q60 92 70 100" stroke-opacity="0.5"/>
      <path d="M160 100 Q140 92 130 100" stroke-opacity="0.5"/>
    </svg>
  </div>
  <h1 class="cover-names">${titleHtml}</h1>
  ${dateLine}
  <div class="tap-hint">${esc(spec.cover_seal_text ?? "Tap to open")}</div>
</label>`;
  }

  // Default: envelope + wax seal
  return `
<input type="checkbox" id="opener" class="opener-toggle">
<label for="opener" class="cover-page" aria-label="Tap to open invitation">
  ${particleField(t)}
  <div class="cover-eyebrow">${esc(eyebrow)}</div>
  <h1 class="cover-names">${titleHtml}</h1>
  ${dateLine}
  <div class="wax-seal" aria-hidden="true">
    <span class="seal-mark">${esc(spec.monogram ?? "✦")}</span>
  </div>
  <div class="tap-hint">${esc(spec.cover_seal_text ?? "Tap the seal to open")}</div>
</label>`;
}

// ───── Hero (after cover reveal) ─────

function renderHero(spec: Spec, t: Theme): string {
  const overlay = spec.hero_overlay_opacity ?? 0.55;
  const img = spec.hero_image || `https://images.unsplash.com/photo-1519741497674-611481863552?w=2000&q=80&fit=crop`;
  const dateInfo = fmtDateISO(spec.event_start);
  const today = new Date().toISOString().slice(0, 10);
  const daysOut = spec.event_start
    ? Math.max(0, Math.round((new Date(spec.event_start).getTime() - new Date(today).getTime()) / 86400000))
    : null;

  const countdown = dateInfo && daysOut !== null
    ? `<div class="countdown" aria-label="Days until event">
  <div class="cd-cell"><div class="cd-num">${daysOut}</div><div class="cd-label">Days</div></div>
  <div class="cd-cell"><div class="cd-num">${dateInfo.date.split(" ").join(" ")}</div><div class="cd-label">Date</div></div>
  <div class="cd-cell"><div class="cd-num">${dateInfo.year}</div><div class="cd-label">Year</div></div>
</div>`
    : "";

  return `
<section class="hero" style="background:linear-gradient(rgba(0,0,0,${overlay}),rgba(0,0,0,${overlay})),url('${esc(img)}') center/cover">
  ${spec.subtitle ? `<div class="hero-eyebrow">${esc(spec.subtitle)}</div>` : ""}
  __GUEST_BLOCK__
  ${spec.honorees && spec.honorees.length
    ? `<h2 class="hero-title script-title">${spec.honorees.map(esc).join(` <span class="amp">&amp;</span> `)}</h2>`
    : `<h2 class="hero-title">${esc(spec.title)}</h2>`}
  ${spec.venue ? `<div class="hero-venue">${esc(spec.venue)}</div>` : ""}
  ${countdown}
</section>`;
}

// ───── Section renderers ─────

function renderStory(s: Extract<Section, { type: "story" }>, t: Theme): string {
  return `
<section class="paper-card story" data-section="story">
  <div class="ornament-rule"></div>
  <h2 class="section-title">${esc(s.title ?? "Our Story")}</h2>
  ${s.image ? `<img src="${esc(s.image)}" alt="" class="story-image" loading="lazy">` : ""}
  <div class="section-body">${esc(s.body).replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>").replace(/^/, "<p>").replace(/$/, "</p>")}</div>
</section>`;
}

function renderSchedule(s: Extract<Section, { type: "schedule" }>, t: Theme): string {
  const items = (s.items || []).map((it) =>
    `<li class="sch-item"><div class="sch-time">${esc(it.time)}</div><div class="sch-body"><div class="sch-label">${esc(it.label)}</div>${it.detail ? `<div class="sch-detail">${esc(it.detail)}</div>` : ""}</div></li>`
  ).join("");
  return `
<section class="paper-card schedule" data-section="schedule">
  <div class="ornament-rule"></div>
  <h2 class="section-title">${esc(s.title ?? "The Day")}</h2>
  <ol class="sch-list">${items}</ol>
</section>`;
}

function renderTravel(s: Extract<Section, { type: "travel" }>, spec: Spec, t: Theme): string {
  return `
<section class="paper-card travel" data-section="travel">
  <div class="ornament-rule"></div>
  <h2 class="section-title">${esc(s.title ?? "Travel & Stay")}</h2>
  <div class="section-body"><p>${esc(s.body).replace(/\n/g, "<br>")}</p></div>
  ${s.hotel ? `<div class="hotel-block"><strong>${esc(s.hotel)}</strong></div>` : ""}
  ${s.map !== false ? staticMap(spec, t) : ""}
</section>`;
}

function renderRegistry(s: Extract<Section, { type: "registry" }>, t: Theme): string {
  const links = (s.links || []).map((l) =>
    `<a class="reg-link" href="${esc(l.url)}" target="_blank" rel="noreferrer noopener">${esc(l.label)} <span aria-hidden="true">→</span></a>`
  ).join("");
  return `
<section class="paper-card registry" data-section="registry">
  <div class="ornament-rule"></div>
  <h2 class="section-title">${esc(s.title ?? "Registry")}</h2>
  ${s.intro ? `<div class="section-body"><p>${esc(s.intro)}</p></div>` : ""}
  <div class="reg-grid">${links}</div>
</section>`;
}

function renderDressCode(s: Extract<Section, { type: "dress_code" }>, t: Theme): string {
  return `
<section class="paper-card dresscode" data-section="dress_code">
  <div class="ornament-rule"></div>
  <div class="dc-eyebrow">Dress Code</div>
  <h2 class="section-title dc-name">${esc(s.code)}</h2>
  ${s.body ? `<div class="section-body"><p>${esc(s.body)}</p></div>` : ""}
</section>`;
}

function renderFaqs(s: Extract<Section, { type: "faqs" }>, t: Theme): string {
  const items = (s.items || []).map((q, i) =>
    `<details class="faq-item"${i === 0 ? " open" : ""}><summary class="faq-q">${esc(q.q)}</summary><div class="faq-a">${esc(q.a)}</div></details>`
  ).join("");
  return `
<section class="paper-card faqs" data-section="faqs">
  <div class="ornament-rule"></div>
  <h2 class="section-title">${esc(s.title ?? "Questions")}</h2>
  <div class="faq-list">${items}</div>
</section>`;
}

function renderRsvp(s: Extract<Section, { type: "rsvp" }>, spec: Spec, t: Theme, rsvpEndpoint: string): string {
  const mealField = s.include_meal !== false
    ? `<label class="form-row"><span class="form-label">Meal preference</span><select name="meal"><option value="">No preference</option><option>Chicken</option><option>Fish</option><option>Vegetarian</option><option>Vegan</option></select></label>`
    : "";
  return `
<section class="paper-card rsvp" data-section="rsvp">
  <div class="ornament-rule"></div>
  <h2 class="section-title">${esc(s.title ?? "RSVP")}</h2>
  ${s.intro ? `<div class="section-body" style="text-align:center;margin-bottom:1.5rem"><p>${esc(s.intro)}</p></div>` : ""}
  <div class="rsvp-count" aria-live="polite">__RSVP_COUNT__</div>
  <form method="POST" action="${rsvpEndpoint}" class="rsvp-form">
    <label class="form-row"><span class="form-label">Your name</span><input type="text" name="name" required maxlength="120"></label>
    <label class="form-row"><span class="form-label">Email (optional)</span><input type="email" name="email" maxlength="200"></label>
    <fieldset class="form-row attending"><legend class="form-label">Will you make it?</legend>
      <label><input type="radio" name="attending" value="yes" required> Yes, I'll be there</label>
      <label><input type="radio" name="attending" value="maybe"> Maybe</label>
      <label><input type="radio" name="attending" value="no"> Can't make it</label>
    </fieldset>
    <label class="form-row"><span class="form-label">How many?</span><input type="number" name="guests" min="1" max="20" value="1"></label>
    ${mealField}
    __PLUS_ONE_BLOCK__
    <label class="form-row"><span class="form-label">A note (optional)</span><textarea name="message" rows="3" maxlength="2000"></textarea></label>
    <button type="submit" class="btn-primary">Send RSVP</button>
  </form>
  <a class="cal-link" href="${SUPABASE_URL_PLACEHOLDER}/functions/v1/ai-site-ics?slug=__SLUG__">📅 Add to calendar</a>
</section>`;
}

function renderPhotoAlbum(s: Extract<Section, { type: "photo_album" }>, t: Theme): string {
  return `
<section class="paper-card photo-album-section" data-section="photo_album">
  <div class="ornament-rule"></div>
  <h2 class="section-title">${esc(s.title ?? "Memories")}</h2>
  ${s.intro ? `<div class="section-body" style="text-align:center;margin-bottom:1rem"><p>${esc(s.intro)}</p></div>` : ""}
  __PHOTO_ALBUM__
</section>`;
}

function renderCommentWall(s: Extract<Section, { type: "comment_wall" }>, t: Theme): string {
  return `
<section class="paper-card comment-wall-section" data-section="comment_wall">
  <div class="ornament-rule"></div>
  <h2 class="section-title">${esc(s.title ?? "Well-Wishes")}</h2>
  ${s.intro ? `<div class="section-body" style="text-align:center;margin-bottom:1rem"><p>${esc(s.intro)}</p></div>` : ""}
  __COMMENT_WALL__
</section>`;
}

function renderQuote(s: Extract<Section, { type: "quote" }>, t: Theme): string {
  return `
<section class="quote-section" data-section="quote">
  <blockquote class="quote">${esc(s.body)}</blockquote>
  ${s.attribution ? `<div class="quote-attr">— ${esc(s.attribution)}</div>` : ""}
</section>`;
}

function renderGalleryStrip(s: Extract<Section, { type: "gallery_strip" }>, t: Theme): string {
  const imgs = (s.images || []).map((src) =>
    `<img src="${esc(src)}" alt="" loading="lazy" class="strip-img">`
  ).join("");
  return `
<section class="gallery-strip" data-section="gallery_strip">
  <div class="strip-track">${imgs}</div>
</section>`;
}

function renderSignature(s: Extract<Section, { type: "signature" }>, t: Theme): string {
  return `
<section class="paper-card signature" data-section="signature">
  <div class="ornament-rule"></div>
  <p class="sig-body">${esc(s.body)}</p>
  ${s.signoff ? `<div class="sig-name script-title">${esc(s.signoff)}</div>` : ""}
</section>`;
}

function renderSection(sec: Section, spec: Spec, t: Theme, rsvpEndpoint: string): string {
  switch (sec.type) {
    case "story": return renderStory(sec, t);
    case "schedule": return renderSchedule(sec, t);
    case "travel": return renderTravel(sec, spec, t);
    case "registry": return renderRegistry(sec, t);
    case "dress_code": return renderDressCode(sec, t);
    case "faqs": return renderFaqs(sec, t);
    case "rsvp": return renderRsvp(sec, spec, t, rsvpEndpoint);
    case "photo_album": return renderPhotoAlbum(sec, t);
    case "comment_wall": return renderCommentWall(sec, t);
    case "quote": return renderQuote(sec, t);
    case "gallery_strip": return renderGalleryStrip(sec, t);
    case "signature": return renderSignature(sec, t);
    default: return "";
  }
}

// ───────────────────────────────────────────────────────────────────
// MAIN COMPOSE
// ───────────────────────────────────────────────────────────────────

const SUPABASE_URL_PLACEHOLDER = "__SUPABASE_URL__";

export interface ComposeOptions {
  spec: Spec;
  supabaseUrl: string; // for RSVP form action + ics link
  designBibleVersion: string;
}

export function compose(opts: ComposeOptions): string {
  const { spec, supabaseUrl, designBibleVersion } = opts;
  const t = THEMES[spec.theme] ?? THEMES["moody-burgundy"];
  const rsvpEndpoint = `${supabaseUrl}/functions/v1/ai-site-rsvp-submit?slug=__SLUG__`;
  const today = new Date().toISOString().slice(0, 10);

  // Calendar meta tags for the .ics export
  const calMeta = spec.event_start ? `
<meta name="event-start" content="${esc(spec.event_start)}">
${spec.event_end ? `<meta name="event-end" content="${esc(spec.event_end)}">` : ""}
${spec.venue ? `<meta name="event-location" content="${esc((spec.venue_address || spec.venue) ?? "")}">` : ""}
<meta name="event-summary" content="${esc(spec.title)}">` : "";

  const sectionsHtml = (spec.sections || [])
    .map((s) => renderSection(s, spec, t, rsvpEndpoint))
    .join("\n");

  const html = `<!-- TITLE: ${esc(spec.title)} -->
<!-- DESIGN_BIBLE: ${designBibleVersion} | generated: ${today} | composed -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(spec.title)}</title>
${spec.meta_description ? `<meta name="description" content="${esc(spec.meta_description)}">` : ""}
${calMeta}
${googleFontsLink(t)}
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{scrollbar-width:thin;scrollbar-color:${t.gold}66 transparent}
  html::-webkit-scrollbar{width:6px}
  html::-webkit-scrollbar-track{background:transparent}
  html::-webkit-scrollbar-thumb{background:${t.gold}66;border-radius:3px}
  html::-webkit-scrollbar-thumb:hover{background:${t.gold}}
  :root{
    --bg:${t.bg};--surface:${t.surface};--surface2:${t.surface2};
    --text:${t.text};--accent:${t.accent};--gold:${t.gold};
    --display:'${t.display}',serif;--body:'${t.body}',sans-serif;--script:'${t.script}',cursive;
    --type-display:clamp(2.5rem,7vw,4.5rem);
    --type-h1:clamp(1.75rem,4vw,2.75rem);
    --type-h2:clamp(1.25rem,2.5vw,1.6rem);
    --type-body:clamp(0.95rem,1.1vw,1.05rem);
    --type-label:0.7rem;
  }
  body{background:var(--bg);color:var(--text);font-family:var(--body);line-height:1.6;min-height:100vh;overflow-x:hidden}
  /* === COVER PAGE — checkbox-driven reveal === */
  .opener-toggle{display:none}
  .cover-page{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);color:var(--surface);cursor:pointer;z-index:1000;padding:2rem;text-align:center;transition:opacity 0.6s ease,transform 0.6s ease}
  .opener-toggle:checked ~ .cover-page{opacity:0;transform:scale(1.05);pointer-events:none}
  .cover-eyebrow{font-family:var(--body);font-size:var(--type-label);letter-spacing:0.32em;text-transform:uppercase;color:var(--gold);opacity:0.8;margin-bottom:2rem}
  .cover-names{font-family:var(--script);font-size:clamp(3rem,9vw,6rem);color:var(--surface);line-height:1.05;text-shadow:0 2px 24px rgba(0,0,0,0.4)}
  .cover-date{margin-top:1.5rem}
  .wax-seal{margin-top:2rem;width:80px;height:80px;border-radius:50%;background:radial-gradient(circle at 30% 30%,${t.accent},#2a0a0a 80%);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.5),inset 0 -2px 6px rgba(0,0,0,0.4);animation:sealPulse 2.4s ease-in-out infinite}
  .wax-seal .seal-mark{font-family:var(--script);font-size:2rem;color:var(--gold)}
  .tap-hint{margin-top:1rem;font-family:var(--body);font-size:var(--type-label);letter-spacing:0.25em;text-transform:uppercase;color:var(--gold);opacity:0.6;animation:tapBounce 2s ease-in-out infinite}
  .monogram-crest{margin:1rem 0 2rem}
  @keyframes sealPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
  @keyframes tapBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
  /* === BODY === */
  .invitation-body{max-width:920px;margin:0 auto;padding:3rem 1.5rem 4rem}
  section{margin:2.5rem 0;opacity:1;transform:none}
  @supports (animation-timeline: view()){
    section{animation:section-enter linear both;animation-timeline:view();animation-range:entry 0% cover 35%}
  }
  @keyframes section-enter{from{opacity:0.4;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  .paper-card{background:var(--surface);${paperTextureCss(t)}border-radius:16px;padding:clamp(2rem,4vw,3rem);position:relative;box-shadow:0 18px 50px rgba(0,0,0,0.18),0 4px 12px rgba(0,0,0,0.08)}
  .paper-card::before{content:"";position:absolute;inset:8px;border:1px solid ${t.accent}22;border-radius:12px;pointer-events:none}
  .ornament-rule{width:60px;height:1px;background:var(--accent);opacity:0.5;margin:0 auto 1.5rem}
  .section-title{font-family:var(--display);font-size:clamp(1.6rem,3.5vw,2.4rem);font-weight:500;text-align:center;color:var(--text);margin-bottom:1.5rem}
  .section-body{font-family:var(--body);font-size:var(--type-body);line-height:1.7;color:var(--text);opacity:0.85}
  .section-body p+p{margin-top:1rem}
  /* === HERO === */
  .hero{min-height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4rem 1.5rem;color:#fff;text-align:center;border-radius:0;background-attachment:fixed;background-size:cover;background-position:center}
  @media (max-width:768px){.hero{background-attachment:scroll}}
  .hero-eyebrow{font-family:var(--body);font-size:var(--type-label);letter-spacing:0.3em;text-transform:uppercase;opacity:0.85;margin-bottom:1.5rem}
  .hero-title{font-family:var(--display);font-size:var(--type-display);font-weight:500;line-height:1.1;margin-bottom:1rem;text-shadow:0 2px 20px rgba(0,0,0,0.5)}
  .hero-title .amp{font-family:var(--script);font-style:italic;color:var(--gold);font-size:0.7em}
  .hero-title.script-title{font-family:var(--script);font-weight:400}
  .hero-venue{font-family:var(--body);font-size:1.05rem;letter-spacing:0.18em;text-transform:uppercase;opacity:0.85;margin-bottom:2.5rem}
  /* === COUNTDOWN === */
  .countdown{display:flex;gap:1.5rem;justify-content:center;flex-wrap:wrap;margin-top:2rem}
  .cd-cell{padding:0.75rem 1.25rem;background:rgba(0,0,0,0.35);backdrop-filter:blur(8px);border:1px solid ${t.gold}55;border-radius:10px;min-width:90px;text-align:center}
  .cd-num{font-family:var(--display);font-size:1.4rem;font-weight:500;color:var(--gold)}
  .cd-label{font-family:var(--body);font-size:0.65rem;letter-spacing:0.25em;text-transform:uppercase;opacity:0.7;margin-top:0.2rem}
  /* === STORY === */
  .story-image{width:100%;max-width:480px;display:block;margin:0 auto 1.5rem;border-radius:8px}
  /* === SCHEDULE === */
  .sch-list{list-style:none;padding:0;display:flex;flex-direction:column;gap:1rem}
  .sch-item{display:flex;gap:1.25rem;padding-bottom:1rem;border-bottom:1px solid ${t.accent}22}
  .sch-item:last-child{border-bottom:none}
  .sch-time{font-family:var(--display);font-size:1.05rem;font-weight:600;color:var(--accent);min-width:88px;font-variant-numeric:tabular-nums}
  .sch-label{font-family:var(--display);font-size:1.1rem;color:var(--text)}
  .sch-detail{font-family:var(--body);font-size:0.85rem;opacity:0.65;margin-top:0.2rem}
  /* === REGISTRY === */
  .reg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.75rem;margin-top:1rem}
  .reg-link{display:flex;align-items:center;justify-content:space-between;padding:0.85rem 1.1rem;border:1px solid ${t.accent}55;border-radius:999px;text-decoration:none;color:var(--text);font-family:var(--body);font-size:0.9rem;transition:all 0.2s}
  .reg-link:hover{background:${t.accent}11;border-color:var(--accent)}
  /* === DRESS CODE === */
  .dc-eyebrow{font-family:var(--body);font-size:var(--type-label);letter-spacing:0.32em;text-transform:uppercase;color:var(--accent);text-align:center;margin-bottom:0.5rem;opacity:0.85}
  .dc-name{font-family:var(--script);font-size:clamp(2rem,5vw,3.2rem);color:var(--accent);font-weight:400;margin-bottom:1rem}
  /* === FAQS === */
  .faq-list{display:flex;flex-direction:column;gap:0.5rem;margin-top:1rem}
  .faq-item{padding:1rem 0;border-bottom:1px solid ${t.accent}22}
  .faq-q{cursor:pointer;font-family:var(--display);font-size:1.05rem;color:var(--accent);list-style:none;outline:none;padding:0.25rem 0}
  .faq-q::after{content:" +";opacity:0.4;font-weight:300}
  .faq-item[open] .faq-q::after{content:" –"}
  .faq-a{margin-top:0.5rem;font-family:var(--body);font-size:var(--type-body);line-height:1.7;opacity:0.8}
  /* === RSVP === */
  .rsvp-count{text-align:center;font-family:var(--body);font-size:0.85rem;color:var(--accent);opacity:0.75;margin-bottom:1.5rem;font-style:italic}
  .rsvp-form{display:flex;flex-direction:column;gap:1rem}
  .form-row{display:flex;flex-direction:column;gap:0.4rem}
  .form-label{font-family:var(--body);font-size:0.72rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text);opacity:0.6}
  .rsvp-form input[type=text],.rsvp-form input[type=email],.rsvp-form input[type=number],.rsvp-form select,.rsvp-form textarea{font-family:var(--body);font-size:1rem;padding:0.75rem 1rem;border:1px solid ${t.accent}33;border-radius:8px;background:rgba(255,255,255,0.6);color:var(--text);width:100%}
  .rsvp-form .attending{border:none;display:flex;flex-direction:column;gap:0.4rem}
  .rsvp-form .attending label{display:flex;align-items:center;gap:0.5rem;font-family:var(--body);font-size:0.95rem;cursor:pointer}
  .btn-primary{display:inline-block;padding:0.85rem 2rem;background:var(--accent);color:#fff;border:none;border-radius:999px;font-family:var(--body);font-size:0.85rem;letter-spacing:0.18em;text-transform:uppercase;cursor:pointer;align-self:flex-start;margin-top:0.5rem;transition:transform 0.15s,box-shadow 0.15s}
  .btn-primary:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(0,0,0,0.2)}
  .cal-link{display:inline-flex;align-items:center;gap:0.5rem;margin-top:1.5rem;padding:0.6rem 1.2rem;border:1px solid var(--accent);border-radius:999px;color:var(--accent);text-decoration:none;font-family:var(--body);font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase}
  .cal-link:hover{background:var(--accent);color:#fff}
  /* === QUOTE === */
  .quote-section{padding:3rem 2rem;text-align:center;color:var(--surface)}
  .quote{font-family:var(--script);font-size:clamp(1.6rem,3vw,2.4rem);font-style:italic;color:var(--gold);max-width:680px;margin:0 auto;line-height:1.4}
  .quote-attr{font-family:var(--body);font-size:0.78rem;letter-spacing:0.22em;text-transform:uppercase;color:var(--surface);opacity:0.65;margin-top:1.5rem}
  /* === GALLERY STRIP === */
  .gallery-strip{margin:2.5rem 0;overflow:hidden}
  .strip-track{display:flex;gap:0.75rem;overflow-x:auto;scroll-snap-type:x mandatory;padding:0 1.5rem;scrollbar-width:none}
  .strip-track::-webkit-scrollbar{display:none}
  .strip-img{flex:0 0 60vw;max-width:480px;height:60vh;max-height:520px;object-fit:cover;border-radius:12px;scroll-snap-align:start;box-shadow:0 12px 30px rgba(0,0,0,0.2)}
  /* === SIGNATURE === */
  .signature{text-align:center;padding-bottom:3rem}
  .sig-body{font-family:var(--body);font-size:1.05rem;line-height:1.7;opacity:0.85;margin-bottom:1.5rem;max-width:520px;margin-left:auto;margin-right:auto}
  .sig-name{font-family:var(--script);font-size:clamp(2rem,4vw,2.6rem);color:var(--accent);margin-top:1rem}
  .script-title{font-family:var(--script);font-weight:400}
  /* === Mobile ===*/
  @media (max-width:640px){
    .invitation-body{padding:2rem 1rem 3rem}
    .paper-card{padding:1.75rem 1.25rem}
    .reg-grid{grid-template-columns:1fr}
  }
</style>
</head>
<body>
${renderCover(spec, t)}
<main class="invitation-body">
${renderHero(spec, t)}
${sectionsHtml}
</main>
</body>
</html>`;

  return html;
}
