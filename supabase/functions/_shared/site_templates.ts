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

// Ornate vintage frame drawn as a border-image: a bold double rule with
// curvy filigree scrollwork in each corner, a light bevel highlight, and
// a soft dark offset copy behind it for dimension. Returns the CSS
// properties to drop inside a rule. Rendered on a transparent border but
// drawn thicker and outset, so it floats around the card edge without
// resizing the box or disturbing the paper-stack pseudos.
function vintageFrame(t: Theme): string {
  const g = t.gold;
  // viewBox 320×320, sliced at 132 → big ornate corners + straight
  // double-rule edges that stretch cleanly between them.
  // Top-left corner flourish, defined once and mirrored to all 4 corners:
  // a bold bracket sweeping into a double scroll-curl, with leaves and
  // dots — an ornate engraved-stationery corner that reads at full size.
  const corner =
    `<path d='M18 96 C18 52 52 18 96 18'/>` +                         // outer sweep
    `<path d='M30 92 C30 58 58 30 92 30'/>` +                         // inner sweep (double rule)
    // long scroll curling down the left edge, ending in a spiral
    `<path d='M24 120 C30 78 50 60 78 60 C58 66 48 84 50 116 C50 132 38 138 30 130 C24 124 28 114 38 116'/>` +
    // mirrored scroll along the top edge
    `<path d='M120 24 C78 30 60 50 60 78 C66 58 84 48 116 50 C132 50 138 38 130 30 C124 24 114 28 116 38'/>` +
    // central diagonal flourish with leaves
    `<path d='M64 64 C82 70 96 84 102 102'/>` +
    `<path d='M96 88 q14 -4 24 4 q-4 -14 -24 -4 Z' fill='${g}' stroke='none'/>` + // leaf
    `<path d='M88 96 q-4 14 4 24 q-14 -4 -4 -24 Z' fill='${g}' stroke='none'/>` + // leaf
    `<circle cx='62' cy='62' r='4.5' fill='${g}' stroke='none'/>` +
    `<circle cx='106' cy='106' r='3' fill='${g}' stroke='none'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320' fill='none'>` +
    // dark offset copy (depth / drop)
    `<g stroke='rgba(0,0,0,0.32)' stroke-linecap='round' transform='translate(2,2.2)'>` +
    `<rect x='12' y='12' width='296' height='296' rx='15' stroke-width='3'/>` +
    `<rect x='22' y='22' width='276' height='276' rx='9' stroke-width='1.4'/></g>` +
    // light bevel highlight (sits up-left of the gold = catches light)
    `<g stroke='rgba(255,250,235,0.55)' stroke-linecap='round' transform='translate(-1,-1.2)'>` +
    `<rect x='12' y='12' width='296' height='296' rx='15' stroke-width='2'/></g>` +
    // gold double rule
    `<g stroke='${g}' stroke-linecap='round'>` +
    `<rect x='12' y='12' width='296' height='296' rx='15' stroke-width='3'/>` +
    `<rect x='22' y='22' width='276' height='276' rx='9' stroke-width='1.4' opacity='0.8'/></g>` +
    // corner filigree, mirrored to all four corners
    `<g id='fl' stroke='${g}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'>${corner}</g>` +
    `<use href='#fl' transform='translate(320,0) scale(-1,1)'/>` +
    `<use href='#fl' transform='translate(320,320) scale(-1,-1)'/>` +
    `<use href='#fl' transform='translate(0,320) scale(1,-1)'/>` +
    `</svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return `
    border:3px solid transparent;
    border-image-source:url("${uri}");
    border-image-slice:132;
    border-image-width:42px;
    border-image-outset:11px;
    border-image-repeat:stretch;`;
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
  const eyebrow = spec.cover_eyebrow ?? "You're invited to";
  const dateInfo = fmtDateISO(spec.event_start);
  const dateLine = dateInfo
    ? `<div class="cover-date">${dateInfo.date}, ${dateInfo.year}</div>`
    : "";

  const titleHtml = spec.honorees && spec.honorees.length
    ? spec.honorees.map(esc).join(`<span class="amp" aria-hidden="true">&amp;</span>`)
    : esc(spec.title);

  // Interactive envelope: tap the seal, the seal breaks loose and
  // falls away, the flap rotates open on its top hinge, the letter
  // inside rises out, and the cover dissolves to reveal the
  // invitation body. All transitions are CSS-only via the hidden
  // checkbox + transition-delay coordination — no JS.
  return `
<input type="checkbox" id="opener" class="opener-toggle">
<label for="opener" class="cover-page" aria-label="Tap the seal to open the invitation">
  ${particleField(t)}
  <div class="env-stage">
    <div class="envelope">
      <div class="env-back" aria-hidden="true"></div>
      <div class="env-letter">
        <div class="cover-eyebrow">${esc(eyebrow)}</div>
        <h1 class="cover-names">${titleHtml}</h1>
        ${dateLine}
      </div>
      <div class="env-flap" aria-hidden="true">
        <div class="env-flap-inside"></div>
      </div>
      ${renderWaxSeal(spec.monogram ?? "", t)}
    </div>
  </div>
  <div class="tap-hint">${esc(spec.cover_seal_text ?? "Tap the seal to open")}</div>
</label>`;
}

// Realistic SVG wax seal. Organic blob path with bumpy edges (not
// a perfect circle), feTurbulence + feDisplacementMap for surface
// scratches, multi-stop radial gradients for waxy 3D depth, drop
// shadow, and an embossed monogram. Looks like wax, not CSS.
function renderWaxSeal(monogram: string, t: Theme): string {
  const accent = t.accent;
  // Wax seals are always burgundy/red/wine in reality (regardless of theme).
  // Hard-coding the wax colors so the seal looks like real wax even on
  // navy / pastel themes. The gold glyph picks up the theme.
  const waxBase = "#8B1A1A";    // wine red
  const waxMid = "#5E0C0C";     // deep wine
  const waxDark = "#2A0303";    // near-black wine
  return `
<div class="wax-seal-wrap" aria-hidden="true">
<svg viewBox="-110 -110 220 220" width="100%" height="100%" class="wax-seal-svg" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Heavy displacement: visible irregular edges + surface bumps. -->
    <filter id="ws-bump" x="-30%" y="-30%" width="160%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" seed="11" result="ws-noise"/>
      <feDisplacementMap in="SourceGraphic" in2="ws-noise" scale="22" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <!-- Specular lighting: makes the disc look DOMED, like wax pooled into
         a bulge. This is the trick — gives the seal real 3D depth instead
         of looking like a flat sticker. -->
    <filter id="ws-spec" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur"/>
      <feSpecularLighting in="blur" surfaceScale="14" specularConstant="1.2" specularExponent="32" lighting-color="#fff5e0" result="spec">
        <feDistantLight azimuth="125" elevation="45"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specClipped"/>
      <feComposite in="SourceGraphic" in2="specClipped" operator="arithmetic" k1="0" k2="1" k3="0.9" k4="0"/>
    </filter>
    <!-- Surface scratches / wax fibers. -->
    <filter id="ws-grain" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="3" seed="3"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.7 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <!-- Cast shadow. -->
    <filter id="ws-cast" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="8"/>
      <feOffset dx="2" dy="10"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.7"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <!-- 3D wax body: very dark rim, deep wine mid, base wax, light highlight. -->
    <radialGradient id="ws-body" cx="36%" cy="28%" r="78%">
      <stop offset="0%"  stop-color="#FFE0E0" stop-opacity="0.55"/>
      <stop offset="8%"  stop-color="#D85050"/>
      <stop offset="35%" stop-color="${waxBase}"/>
      <stop offset="72%" stop-color="${waxMid}"/>
      <stop offset="92%" stop-color="${waxDark}"/>
      <stop offset="100%" stop-color="#150101"/>
    </radialGradient>
    <!-- Inner pressed depression: darker in the center because the stamp
         pushed the wax down. -->
    <radialGradient id="ws-pressed" cx="50%" cy="55%" r="38%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.45"/>
      <stop offset="80%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Outer drip pool (blurred, behind everything). Irregular blob -->
  <path d="M -82 -8 Q -94 -45 -52 -82 Q -10 -98 18 -86 Q 60 -92 82 -56 Q 96 -18 88 12 Q 100 48 64 82 Q 24 96 -8 86 Q -54 96 -80 56 Q -98 16 -82 -8 Z"
        fill="${waxBase}" opacity="0.35" filter="url(#ws-cast)" transform="scale(1.05)"/>

  <!-- Drip droplets around the edge -->
  <g fill="${waxMid}" opacity="0.55">
    <ellipse cx="-90" cy="-30" rx="6" ry="4" transform="rotate(-30 -90 -30)"/>
    <ellipse cx="85" cy="-18" rx="5" ry="4" transform="rotate(20 85 -18)"/>
    <ellipse cx="-80" cy="55" rx="7" ry="5" transform="rotate(45 -80 55)"/>
    <ellipse cx="78" cy="62" rx="5" ry="4" transform="rotate(-25 78 62)"/>
    <ellipse cx="-15" cy="-92" rx="4" ry="3"/>
    <ellipse cx="22" cy="88" rx="5" ry="3"/>
  </g>

  <!-- Main wax disc: bumpy blob path, then layered effects -->
  <g filter="url(#ws-bump)">
    <!-- Base disc with 3D radial gradient -->
    <circle cx="0" cy="0" r="80" fill="url(#ws-body)" filter="url(#ws-spec)"/>
    <!-- Pressed depression in the center (darker) -->
    <circle cx="0" cy="0" r="80" fill="url(#ws-pressed)"/>
    <!-- Surface scratches / grain -->
    <circle cx="0" cy="0" r="80" fill="#fff" filter="url(#ws-grain)" opacity="0.4" style="mix-blend-mode:overlay"/>
  </g>

  <!-- Inner pressed ring (stamp impression edge) -->
  <g filter="url(#ws-bump)" opacity="0.6">
    <circle cx="0" cy="0" r="56" fill="none" stroke="${waxDark}" stroke-width="3"/>
    <circle cx="0" cy="0" r="56" fill="none" stroke="#fff" stroke-width="0.5" stroke-opacity="0.2"/>
  </g>

  <!-- Embossed monogram. Two layered drop-shadows give the pressed-in
       feel: dark above (the depression catches shadow), light below
       (the lip catches reflected light). Gold glyph picks up theme. -->
  ${monogram
    ? `<text x="0" y="${monogram.length > 1 ? "14" : "20"}" text-anchor="middle"
            font-family="${t.script}, 'Pinyon Script', cursive"
            font-size="${monogram.length > 1 ? "52" : "78"}"
            font-weight="500"
            fill="${t.gold}"
            opacity="0.95"
            style="filter: drop-shadow(0 -2px 0 rgba(0,0,0,0.7)) drop-shadow(0 1.5px 0 rgba(255,230,180,0.35))">${esc(monogram)}</text>`
    : `<g fill="${t.gold}" opacity="0.95" style="filter:drop-shadow(0 -2px 0 rgba(0,0,0,0.7))">
         <circle cx="0" cy="-2" r="7"/>
         <ellipse cx="-22" cy="-2" rx="4" ry="3"/>
         <ellipse cx="22" cy="-2" rx="4" ry="3"/>
         <ellipse cx="0" cy="20" rx="3" ry="2"/>
       </g>`}

  <!-- Tiny imperfections: highlights and shadow spots scattered across
       the surface to add irregularity -->
  <g style="mix-blend-mode:overlay">
    <ellipse cx="-22" cy="-38" rx="4" ry="2" fill="#fff" opacity="0.35" transform="rotate(-20 -22 -38)"/>
    <ellipse cx="32" cy="-18" rx="2" ry="1.5" fill="#fff" opacity="0.25"/>
    <ellipse cx="-12" cy="45" rx="3" ry="1.5" fill="#fff" opacity="0.2" transform="rotate(30 -12 45)"/>
    <circle cx="38" cy="42" r="1.5" fill="#000" opacity="0.3"/>
    <circle cx="-40" cy="20" r="1" fill="#000" opacity="0.25"/>
  </g>
</svg>
</div>`;
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
  /* === COVER PAGE — interactive envelope === */
  .opener-toggle{display:none}
  .cover-page{
    position:fixed;inset:0;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:
      radial-gradient(ellipse at 50% 35%, color-mix(in srgb, var(--bg) 70%, #ffffff 8%) 0%, var(--bg) 55%, color-mix(in srgb, var(--bg) 80%, #000 20%) 100%),
      var(--bg);
    color:var(--surface);
    cursor:pointer;
    z-index:1000;
    padding:2rem;
    text-align:center;
    perspective:1400px;
    /* Fades after the opening sequence completes (~1.8s in). */
    transition:opacity 0.6s ease 1.8s, transform 0.6s ease 1.8s;
  }
  .cover-page::after{
    content:"";
    position:absolute;inset:0;
    background-image:url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='5'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E");
    opacity:0.4;
    mix-blend-mode:overlay;
    pointer-events:none;
    z-index:0;
  }
  .cover-page > *{position:relative;z-index:1}
  .opener-toggle:checked ~ .cover-page{opacity:0;transform:scale(1.02);pointer-events:none}

  /* === Envelope structure === */
  /* Bigger, cream-colored envelope on the dark cover bg. Real
     envelopes are cream/ivory, not the same color as their
     background — high contrast is what makes them read as
     "envelope sitting on a table." */
  .env-stage{
    position:relative;
    width:min(720px,92vw);
    aspect-ratio:5/3.2;
    transform-style:preserve-3d;
    margin-bottom:2.5rem;
  }
  .envelope{
    position:relative;
    width:100%;height:100%;
    transform-style:preserve-3d;
    filter:drop-shadow(0 18px 36px rgba(0,0,0,0.55)) drop-shadow(0 50px 90px rgba(0,0,0,0.4));
  }
  /* Outer envelope back — cream cardstock with subtle texture and a
     ruled border (real envelopes have an inner liner edge). */
  .env-back{
    position:absolute;inset:0;
    background:
      linear-gradient(165deg, var(--surface) 0%, var(--surface2) 100%);
    border-radius:2px;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.7),
      inset 0 -1px 0 rgba(0,0,0,0.1),
      inset 0 0 0 1px rgba(0,0,0,0.08);
    z-index:1;
  }
  .env-back::before{
    content:"";position:absolute;inset:0;
    background-image:url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='b'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='8'/%3E%3CfeColorMatrix values='0 0 0 0 0.15 0 0 0 0 0.10 0 0 0 0 0.05 0 0 0 0.45 0'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23b)'/%3E%3C/svg%3E");
    mix-blend-mode:multiply;opacity:0.55;border-radius:inherit;
  }
  /* Subtle ruled inner border on the envelope (cardstock detail). */
  .env-back::after{
    content:"";position:absolute;inset:10px;
    border:1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius:1px;
  }
  /* The letter inside — visible after the flap opens. Initially
     sits behind the flap (z-index 2), revealed as the flap rotates. */
  /* Letter inside — slightly inset, brighter white than the envelope
     body so it reads as the LETTER vs the ENVELOPE. */
  .env-letter{
    position:absolute;
    top:7%;left:7%;right:7%;bottom:7%;
    background:#fefcf7;
    background-image:
      url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='l'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2' seed='2'/%3E%3CfeColorMatrix values='0 0 0 0 0.18 0 0 0 0 0.12 0 0 0 0 0.06 0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23l)'/%3E%3C/svg%3E");
    background-blend-mode:multiply;
    color:var(--text);
    border-radius:2px;
    z-index:2;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:1.5rem 1.5rem;
    box-shadow:
      inset 0 0 0 1px rgba(0,0,0,0.06),
      inset 0 1px 0 rgba(255,255,255,0.9),
      0 2px 6px rgba(0,0,0,0.08);
    transform:translateY(0);
    opacity:1;
    transition:transform 1s cubic-bezier(0.4,0,0.2,1) 1.2s, opacity 0.5s ease 1.5s;
  }
  /* Cover typography overrides — text sits on cream paper now,
     so it inherits the dark theme text color, not the surface. */
  .env-letter .cover-eyebrow{
    font-family:var(--body);
    font-size:0.6rem;
    letter-spacing:0.32em;
    text-transform:uppercase;
    color:var(--accent);
    opacity:0.75;
    margin-bottom:0.85rem;
  }
  .env-letter .cover-names{
    font-family:var(--script);
    font-size:clamp(1.75rem,5vw,2.85rem);
    color:var(--text);
    line-height:1.05;
    text-shadow:
      0 1px 0 rgba(255,255,255,0.55),
      0 -1px 0 rgba(0,0,0,0.06);
    margin-bottom:0.5rem;
  }
  .env-letter .cover-names .amp{
    display:inline-block;
    margin:0 0.25em;
    color:var(--gold);
    font-style:italic;
  }
  .env-letter .cover-date{
    font-family:var(--body);
    font-size:0.62rem;
    letter-spacing:0.3em;
    text-transform:uppercase;
    color:var(--accent);
    opacity:0.7;
    margin-top:0.5rem;
  }
  /* The top flap — triangular, hinged at top edge. Wrapped color
     and shadow on the OUTSIDE; the back of the flap (when rotated)
     is the lighter envelope interior. */
  /* Top flap: SAME cream color as the envelope back (real envelopes
     are one piece of paper) but slightly darker on the bottom to
     read as a folded edge. A faint horizontal fold-line at the top. */
  .env-flap{
    position:absolute;
    top:0;left:0;
    width:100%;
    height:62%;
    transform-origin:top center;
    transform-style:preserve-3d;
    transform:rotateX(0deg);
    z-index:4;
    transition:transform 1.1s cubic-bezier(0.6,0.05,0.3,1) 0.45s;
    background:
      linear-gradient(180deg, var(--surface) 0%, var(--surface2) 65%, color-mix(in srgb, var(--surface2) 80%, #000 10%) 100%);
    clip-path:polygon(0 0, 100% 0, 50% 100%);
    box-shadow:
      inset 0 -14px 24px rgba(0,0,0,0.15),
      inset 0 1px 0 rgba(255,255,255,0.8);
    backface-visibility:hidden;
  }
  /* Inside of the flap — a slightly DARKER liner pattern so when
     the flap opens, the inside reads as the printed liner of a real
     wedding envelope. */
  .env-flap-inside{
    position:absolute;inset:0;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--accent) 18%, var(--surface) 78%) 0%, color-mix(in srgb, var(--accent) 30%, var(--surface) 65%) 100%);
    background-image:
      url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpath d='M40 0 L80 40 L40 80 L0 40 Z' fill='none' stroke='rgba(0,0,0,0.06)' stroke-width='0.5'/%3E%3C/svg%3E"),
      linear-gradient(180deg, color-mix(in srgb, var(--accent) 18%, var(--surface) 78%) 0%, color-mix(in srgb, var(--accent) 30%, var(--surface) 65%) 100%);
    clip-path:polygon(0 0, 100% 0, 50% 100%);
    transform:rotateX(180deg);
    backface-visibility:hidden;
    box-shadow:inset 0 -8px 14px rgba(0,0,0,0.1);
  }
  /* Wax seal — pinned at the bottom tip of the flap so it MOVES
     with the flap. When the flap rotates, the seal opens with it.
     We also fade + rotate the seal slightly so it "breaks off." */
  .env-stage .wax-seal-wrap{
    position:absolute;
    top:62%;left:50%;
    width:120px;height:120px;
    margin:0;
    transform:translate(-50%,-50%);
    z-index:5;
    animation:sealPulse 2.6s ease-in-out infinite;
    filter:drop-shadow(0 6px 14px rgba(0,0,0,0.55)) drop-shadow(0 18px 32px rgba(0,0,0,0.4));
    transition:transform 0.6s cubic-bezier(0.5,0.2,0.5,1.6) 0.1s, opacity 0.55s ease 0.25s;
  }
  /* Wax seal (used outside the envelope, e.g. variant fallback) */
  .wax-seal-wrap{position:relative;width:140px;height:140px;display:flex;align-items:center;justify-content:center;animation:sealPulse 2.6s ease-in-out infinite;filter:drop-shadow(0 8px 18px rgba(0,0,0,0.55)) drop-shadow(0 22px 36px rgba(0,0,0,0.4))}
  .wax-seal-svg{width:100%;height:100%;display:block}
  .tap-hint{margin-top:0.5rem;font-family:var(--body);font-size:var(--type-label);letter-spacing:0.25em;text-transform:uppercase;color:var(--gold);opacity:0.65;animation:tapBounce 2s ease-in-out infinite;transition:opacity 0.3s ease}
  @keyframes sealPulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.05)}}
  @keyframes tapBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}

  /* === OPEN STATE: choreographed sequence === */
  /* t=0.1s  → seal breaks loose: scales down + rotates + falls */
  .opener-toggle:checked ~ .cover-page .env-stage .wax-seal-wrap{
    transform:translate(-50%,40%) rotate(28deg) scale(0.55);
    opacity:0;
    animation:none;
  }
  /* t=0.45s → flap rotates open over 1.1s */
  .opener-toggle:checked ~ .cover-page .env-flap{
    transform:rotateX(-178deg);
  }
  /* t=1.2s  → letter slides up out of the envelope + fades */
  .opener-toggle:checked ~ .cover-page .env-letter{
    transform:translateY(-110%) scale(1.04);
    opacity:0;
  }
  /* tap-hint fades immediately on tap */
  .opener-toggle:checked ~ .cover-page .tap-hint{opacity:0;transition:opacity 0.2s ease}
  /* === BODY === */
  .invitation-body{max-width:920px;margin:0 auto;padding:3rem 1.5rem 4rem;position:relative;z-index:0}
  section{margin:3rem 0;opacity:1;transform:none;position:relative}
  @supports (animation-timeline: view()){
    section{animation:section-enter linear both;animation-timeline:view();animation-range:entry 0% cover 35%}
  }
  @keyframes section-enter{from{opacity:0.4;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  /* === PAPER CARD — layered shadows + paper-stack pseudos. ===
     Five stacked shadows for realistic depth (contact, ambient,
     mid, deep, long). Sepia-tinted instead of pure black so it
     reads as warm paper, not flat web UI. */
  .paper-card{
    /* Paper material: SVG fractal-noise grain multiply-blended over
       the base surface color, plus the theme texture gradient. */
    background:
      url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='3'/%3E%3CfeColorMatrix values='0 0 0 0 0.16 0 0 0 0 0.10 0 0 0 0 0.05 0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23p)'/%3E%3C/svg%3E"),
      var(--surface);
    background-blend-mode:multiply,normal;
    ${paperTextureCss(t)}
    border-radius:6px;
    ${vintageFrame(t)}
    padding:clamp(2.25rem,4.5vw,3.25rem);
    position:relative;
    /* No isolation — z-index:-1 pseudos need to escape behind. */
    /* Aggressive shadow stack: pure-black ambient + deep stops so
       the card "lifts" visibly even on dark theme backgrounds where
       sepia shadows would otherwise vanish. Subtle gold halo at the
       bottom adds the luxury-paper-on-table feel. */
    box-shadow:
      0 1px 2px rgba(0,0,0,0.45),
      0 4px 10px rgba(0,0,0,0.25),
      0 14px 30px rgba(0,0,0,0.35),
      0 32px 64px rgba(0,0,0,0.32),
      0 60px 120px rgba(0,0,0,0.22),
      0 0 80px ${t.gold}1f;
  }
  /* Inner gold border — thin line ~10px in from the edge, mimics
     the ornamental ruled border of premium stationery. */
  .paper-card > *:first-child{position:relative}
  .paper-card::after,
  .paper-card::before{
    content:"";
    position:absolute;
    inset:0;
    border-radius:6px;
    z-index:-1;
  }
  /* Paper-stack: two slightly rotated sheets that peek out from
     behind the main card. Big offsets so the layers are visibly
     stacked. */
  .paper-card::before{
    background:var(--surface2);
    transform:rotate(-1.8deg) translate(-14px,9px);
    opacity:0.95;
    box-shadow:0 8px 18px rgba(0,0,0,0.30),0 24px 40px rgba(0,0,0,0.22);
  }
  .paper-card::after{
    background:color-mix(in srgb, var(--surface2) 80%, #000 15%);
    transform:rotate(1.4deg) translate(12px,6px);
    opacity:0.85;
    box-shadow:0 6px 14px rgba(0,0,0,0.25);
  }
  /* Inner ruled border, drawn via an outline-styled child layer.
     We attach it to .ornament-rule's parent without adding markup
     by using a fixed-position pseudo from a wrapper. Cheap trick:
     a fourth pseudo on the section element instead. */
  section.paper-card{box-shadow:
    0 1px 2px rgba(0,0,0,0.45),
    0 4px 10px rgba(0,0,0,0.25),
    0 14px 30px rgba(0,0,0,0.35),
    0 32px 64px rgba(0,0,0,0.32),
    0 60px 120px rgba(0,0,0,0.22),
    0 0 80px ${t.gold}1f,
    /* Inset top edge highlight (paper catching light) */
    inset 0 1px 0 rgba(255,255,255,0.5),
    /* Inset bottom edge shadow (paper has thickness) */
    inset 0 -1px 0 rgba(0,0,0,0.08)
  }
  .ornament-rule{width:60px;height:1px;background:var(--accent);opacity:0.5;margin:0 auto 1.5rem}
  /* Letterpress: titles sit slightly pressed into the paper. Subtle
     inset shadow (dark above, light below) emulates the ink-into-fiber
     look of real letterpress invitations. */
  .section-title{
    font-family:var(--display);
    font-size:clamp(1.6rem,3.5vw,2.4rem);
    font-weight:500;
    text-align:center;
    color:var(--text);
    margin-bottom:1.5rem;
    text-shadow:
      0 1px 0 rgba(255,255,255,0.55),
      0 -1px 0 rgba(0,0,0,0.08);
  }
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
  /* Story image gets a polaroid treatment — white border with bottom
     caption space, slight rotation, drop shadow, and a piece of
     "washi tape" pinned to the top center. */
  .story-image{
    display:block;
    width:auto;
    max-width:min(420px,80%);
    margin:1.5rem auto 2.25rem;
    padding:14px 14px 48px;
    background:#fefefe;
    border-radius:2px;
    transform:rotate(-1.4deg);
    box-shadow:
      0 1px 2px rgba(40,20,5,0.10),
      0 8px 16px rgba(40,20,5,0.16),
      0 22px 40px rgba(40,20,5,0.14);
    position:relative;
  }
  .story-image::before{
    content:"";
    position:absolute;
    top:-10px;left:50%;transform:translateX(-50%) rotate(-3deg);
    width:80px;height:22px;
    background:rgba(${t.particle === 'none' ? '180,160,120' : '255,255,255'},0.55);
    box-shadow:0 1px 2px rgba(0,0,0,0.15);
    border-radius:1px;
  }
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
