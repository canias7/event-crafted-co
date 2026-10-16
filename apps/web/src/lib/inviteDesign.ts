// Invitation design (owner's call, Oct 2026): the host picks the colours,
// the lettering and the decoration of their invitation, or a ready-made
// design for the occasion. Invitations are the host's own document, so
// like proposals and invoices they step outside the site's brand palette
// and fonts on purpose.
//
// Stored as one jsonb object on host_events.invite_design:
//   { palette, bg?, accent?, font, ornament, frame }
// Unknown or missing values fall back to the defaults, so new options can
// be added here without a database change.

export type PaletteKey =
  | "ivory"
  | "midnight"
  | "blush"
  | "sage"
  | "lavender"
  | "sky"
  | "terracotta"
  | "navy"
  | "emerald"
  | "burgundy"
  | "noir"
  | "custom";
export type FontKey = "classic" | "script" | "elegant" | "deco" | "modern" | "playful" | "handwritten";
export type OrnamentKey = "diamond" | "floral" | "hearts" | "stars" | "confetti" | "deco" | "none";
export type OccasionKey =
  | "wedding"
  | "evening"
  | "birthday"
  | "babyShower"
  | "bridalShower"
  | "corporate"
  | "holiday"
  | "graduation";

export interface InviteDesign {
  palette: PaletteKey;
  /** Only for the custom palette: page and accent colours, "#rrggbb". */
  bg?: string;
  accent?: string;
  font: FontKey;
  ornament: OrnamentKey;
  frame: boolean;
}

interface PaletteDef {
  bg: string;
  card: string;
  text: string;
  /** Fills: buttons, ornaments, the selected-chip ring. */
  accent: string;
  /** Accent-coloured text, readable on the page. */
  accentText: string;
}

export const PALETTES: Record<Exclude<PaletteKey, "custom">, PaletteDef> = {
  ivory: { bg: "#f4f1ea", card: "#fbf9f4", text: "#14161a", accent: "#c9a86a", accentText: "#8a6f3e" },
  midnight: { bg: "#14161a", card: "#1d2026", text: "#f4f1ea", accent: "#c9a86a", accentText: "#d8bd85" },
  blush: { bg: "#f8ece9", card: "#fdf6f4", text: "#3b2626", accent: "#d9a19a", accentText: "#9a5750" },
  sage: { bg: "#edf1e8", card: "#f8faf5", text: "#1f2d22", accent: "#9fb592", accentText: "#4c6844" },
  lavender: { bg: "#f0ecf6", card: "#f9f7fc", text: "#2a2140", accent: "#b9a6d9", accentText: "#685396" },
  sky: { bg: "#e9f2f8", card: "#f6fafd", text: "#1b3242", accent: "#93bfdb", accentText: "#3a6d8d" },
  terracotta: { bg: "#f6ebe1", card: "#fbf5ef", text: "#3a2317", accent: "#d08a62", accentText: "#9e5530" },
  navy: { bg: "#15213b", card: "#1d2b4a", text: "#f4f1ea", accent: "#c9a86a", accentText: "#ddc28b" },
  emerald: { bg: "#0f2c24", card: "#16392f", text: "#f2efe6", accent: "#c9a86a", accentText: "#d9bf88" },
  burgundy: { bg: "#3a121b", card: "#4a1a25", text: "#f6ece6", accent: "#d8b07a", accentText: "#e7c897" },
  noir: { bg: "#ffffff", card: "#f7f7f7", text: "#111111", accent: "#111111", accentText: "#111111" },
};
export const PALETTE_KEYS = [...(Object.keys(PALETTES) as PaletteKey[]), "custom" as const];

interface FontDef {
  /** Google Fonts family spec, or null for the site's own Libre Baskerville. */
  load: string[];
  title: string;
  titleWeight: number;
  /** Multiplies the title size: scripts read small, capitals read big. */
  titleScale: number;
  titleUpper?: boolean;
  /** Details, form labels and fields: always an easy-reading face. */
  body: string;
  /** The welcome message, when it gets a face of its own. */
  message?: string;
  messageSize?: string;
}

const LB = "'Libre Baskerville', 'PT Serif', Georgia, serif";
export const FONTS: Record<FontKey, FontDef> = {
  classic: { load: [], title: LB, titleWeight: 700, titleScale: 1, body: LB },
  script: {
    load: ["Great+Vibes", "Cormorant+Garamond:ital,wght@0,500;0,600;1,500", "Lora:ital,wght@0,400;0,700;1,400"],
    title: "'Great Vibes', 'Marck Script', cursive",
    titleWeight: 400,
    titleScale: 1.35,
    body: "'Lora', Georgia, serif",
    message: "'Cormorant Garamond', Georgia, serif",
    messageSize: "1.3rem",
  },
  elegant: {
    load: ["Cormorant+Garamond:ital,wght@0,500;0,600;1,500", "Lora:ital,wght@0,400;0,700;1,400"],
    title: "'Cormorant Garamond', Georgia, serif",
    titleWeight: 600,
    titleScale: 1.05,
    titleUpper: true,
    body: "'Lora', Georgia, serif",
    message: "'Cormorant Garamond', Georgia, serif",
    messageSize: "1.3rem",
  },
  deco: {
    load: ["Playfair+Display:wght@700", "Lora:ital,wght@0,400;0,700;1,400"],
    title: "'Playfair Display', Georgia, serif",
    titleWeight: 700,
    titleScale: 1.05,
    body: "'Lora', Georgia, serif",
  },
  modern: {
    load: ["Montserrat:wght@400;600;700"],
    title: "'Montserrat', system-ui, sans-serif",
    titleWeight: 600,
    titleScale: 0.8,
    titleUpper: true,
    body: "'Montserrat', system-ui, sans-serif",
  },
  playful: {
    load: ["Comfortaa:wght@700", "Nunito:ital,wght@0,400;0,700;1,400"],
    title: "'Comfortaa', system-ui, sans-serif",
    titleWeight: 700,
    titleScale: 0.95,
    body: "'Nunito', system-ui, sans-serif",
  },
  handwritten: {
    load: ["Caveat:wght@700", "Lora:ital,wght@0,400;0,700;1,400"],
    title: "'Caveat', cursive",
    titleWeight: 700,
    titleScale: 1.3,
    body: "'Lora', Georgia, serif",
  },
};
export const FONT_KEYS = Object.keys(FONTS) as FontKey[];
export const ORNAMENT_KEYS: OrnamentKey[] = ["diamond", "floral", "hearts", "stars", "confetti", "deco", "none"];

export const OCCASIONS: Record<OccasionKey, Omit<InviteDesign, "bg" | "accent">> = {
  wedding: { palette: "ivory", font: "script", ornament: "floral", frame: true },
  evening: { palette: "midnight", font: "deco", ornament: "deco", frame: true },
  birthday: { palette: "terracotta", font: "playful", ornament: "confetti", frame: false },
  babyShower: { palette: "sky", font: "handwritten", ornament: "stars", frame: false },
  bridalShower: { palette: "blush", font: "script", ornament: "hearts", frame: false },
  corporate: { palette: "noir", font: "modern", ornament: "none", frame: false },
  holiday: { palette: "emerald", font: "elegant", ornament: "stars", frame: true },
  graduation: { palette: "navy", font: "modern", ornament: "stars", frame: false },
};
export const OCCASION_KEYS = Object.keys(OCCASIONS) as OccasionKey[];

const HEX = /^#[0-9a-f]{6}$/i;

/** Reads the stored design; `style` is the older invite_style column. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readDesign(raw: any, style?: string | null): InviteDesign {
  const d = raw && typeof raw === "object" ? raw : {};
  const palette: PaletteKey = PALETTE_KEYS.includes(d.palette) ? d.palette : style === "evening" ? "midnight" : "ivory";
  return {
    palette,
    bg: HEX.test(d.bg ?? "") ? d.bg : undefined,
    accent: HEX.test(d.accent ?? "") ? d.accent : undefined,
    font: FONT_KEYS.includes(d.font) ? d.font : "classic",
    ornament: ORNAMENT_KEYS.includes(d.ornament) ? d.ornament : "diamond",
    frame: d.frame === true,
  };
}

export function isDarkDesign(d: InviteDesign): boolean {
  return luminance(resolvePalette(d).bg) < 0.3;
}

// ---- colour maths -------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}
function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
export function luminance(hex: string): number {
  const c = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function hsl(hex: string, alpha?: number): string {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  const base = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  return alpha == null ? base : `${base} / ${alpha}`;
}

const INK = "#14161a";
const CREAM = "#f4f1ea";

/** Nudges `fg` toward `toward` until it reads on `bg` (4.5:1). */
function readable(fg: string, bg: string, toward: string): string {
  let c = fg;
  for (let i = 1; i <= 10 && contrast(c, bg) < 4.5; i++) c = mix(fg, toward, i / 10);
  return c;
}

/** The six colours a design draws with. */
export function resolvePalette(d: InviteDesign): PaletteDef {
  if (d.palette !== "custom") return PALETTES[d.palette];
  const bg = d.bg ?? "#f4f1ea";
  const accent = d.accent ?? "#c9a86a";
  const dark = luminance(bg) < 0.3;
  const text = dark ? CREAM : INK;
  return {
    bg,
    card: dark ? mix(bg, "#ffffff", 0.06) : mix(bg, "#ffffff", 0.55),
    text,
    accent,
    accentText: readable(accent, bg, text),
  };
}

/** Text colour for a button filled with the accent. */
export function onAccent(d: InviteDesign): string {
  const { accent } = resolvePalette(d);
  return contrast(accent, INK) >= 4.5 ? INK : "#ffffff";
}

/** CSS variables that re-colour the site's components inside the invitation. */
export function designVars(d: InviteDesign): Record<string, string> {
  const p = resolvePalette(d);
  const dark = luminance(p.bg) < 0.3;
  const placeholder = readable(mix(p.text, p.bg, 0.45), p.card, p.text);
  return {
    "--background": hsl(p.bg),
    "--foreground": hsl(p.text),
    "--card": hsl(p.card),
    "--card-foreground": hsl(p.text),
    "--popover": hsl(p.card),
    "--popover-foreground": hsl(p.text),
    "--primary": hsl(p.text),
    "--primary-foreground": hsl(p.bg),
    "--muted": hsl(mix(p.bg, p.text, 0.08)),
    "--muted-foreground": hsl(p.text),
    "--accent": hsl(p.accentText),
    "--gold": hsl(p.accent),
    "--gold-hover": hsl(mix(p.accent, dark ? "#ffffff" : "#000000", 0.08)),
    "--gold-muted": hsl(mix(p.accent, p.bg, 0.5)),
    "--border": hsl(p.text, dark ? 0.16 : 0.14),
    "--input": hsl(p.card),
    "--ring": hsl(p.accentText, 0.6),
    "--placeholder": hsl(placeholder),
    color: p.text,
    background: p.bg,
  };
}

/** Google Fonts stylesheet for the given lettering (null for the site font). */
export function fontsHref(keys: FontKey[]): string | null {
  const fams = [...new Set(keys.flatMap((k) => FONTS[k].load))];
  if (!fams.length) return null;
  return `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${f}`).join("&")}&display=swap`;
}

/** Adds the stylesheet once per page. */
export function loadInviteFonts(keys: FontKey[]): void {
  const href = fontsHref(keys);
  if (!href || typeof document === "undefined") return;
  if (document.querySelector(`link[data-invite-fonts="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.inviteFonts = href;
  document.head.appendChild(link);
}

/** Inline style for the invitation's title. */
export function titleStyle(d: InviteDesign, baseRem: number, responsive = false): React.CSSProperties {
  const f = FONTS[d.font];
  const size = baseRem * f.titleScale;
  return {
    fontFamily: f.title,
    fontWeight: f.titleWeight,
    fontStyle: "normal",
    // On the page the title grows with the screen, between 85% and 120%.
    fontSize: responsive ? `clamp(${(size * 0.85).toFixed(2)}rem, 7vw, ${(size * 1.2).toFixed(2)}rem)` : `${size}rem`,
    lineHeight: f.titleScale > 1.1 ? 1.1 : 1.15,
    letterSpacing: f.titleUpper ? "0.08em" : undefined,
    textTransform: f.titleUpper ? "uppercase" : undefined,
  };
}

/** Inline style for the invitation's body text. */
export function bodyStyle(d: InviteDesign): React.CSSProperties {
  return { fontFamily: FONTS[d.font].body };
}

/** The welcome message: the lettering's own face where it has one. */
export function messageStyle(d: InviteDesign): React.CSSProperties {
  const f = FONTS[d.font];
  return f.message ? { fontFamily: f.message, fontWeight: 500, fontSize: f.messageSize } : { fontFamily: f.body };
}

/** Headings inside the invitation (the date, "Thank you"): the title face,
 *  except where it's a script that reads poorly small. */
export function headingStyle(d: InviteDesign): React.CSSProperties {
  const f = FONTS[d.font];
  if (f.titleScale > 1.2) return { fontFamily: f.body, fontWeight: 700 };
  return { fontFamily: f.title, fontWeight: f.titleWeight };
}
