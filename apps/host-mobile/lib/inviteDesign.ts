// Invitation design choices (owner's call, Oct 2026): the app's copy of the
// website's apps/web/src/lib/inviteDesign.ts lists. The guest page is on the
// website, so the app only needs the keys and the swatch colours; keep them
// in step with the website. Stored on host_events.invite_design:
//   { palette, bg?, accent?, font, ornament, frame }

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
  bg?: string;
  accent?: string;
  font: FontKey;
  ornament: OrnamentKey;
  frame: boolean;
}

// Swatches: the invitation's page colour and its accent. These are the
// host's invitation colours, not app chrome, so they're fixed hexes.
export const PALETTES: Record<Exclude<PaletteKey, "custom">, { bg: string; accent: string }> = {
  ivory: { bg: "#f4f1ea", accent: "#c9a86a" },
  midnight: { bg: "#14161a", accent: "#c9a86a" },
  blush: { bg: "#f8ece9", accent: "#d9a19a" },
  sage: { bg: "#edf1e8", accent: "#9fb592" },
  lavender: { bg: "#f0ecf6", accent: "#b9a6d9" },
  sky: { bg: "#e9f2f8", accent: "#93bfdb" },
  terracotta: { bg: "#f6ebe1", accent: "#d08a62" },
  navy: { bg: "#15213b", accent: "#c9a86a" },
  emerald: { bg: "#0f2c24", accent: "#c9a86a" },
  burgundy: { bg: "#3a121b", accent: "#d8b07a" },
  noir: { bg: "#ffffff", accent: "#111111" },
};
export const PALETTE_KEYS = Object.keys(PALETTES) as Exclude<PaletteKey, "custom">[];
export const FONT_KEYS: FontKey[] = ["classic", "script", "elegant", "deco", "modern", "playful", "handwritten"];
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readDesign(raw: any, style?: string | null): InviteDesign {
  const d = raw && typeof raw === "object" ? raw : {};
  const keys: string[] = [...PALETTE_KEYS, "custom"];
  return {
    palette: keys.includes(d.palette) ? d.palette : style === "evening" ? "midnight" : "ivory",
    bg: HEX.test(d.bg ?? "") ? d.bg : undefined,
    accent: HEX.test(d.accent ?? "") ? d.accent : undefined,
    font: FONT_KEYS.includes(d.font) ? d.font : "classic",
    ornament: ORNAMENT_KEYS.includes(d.ornament) ? d.ornament : "diamond",
    frame: d.frame === true,
  };
}

export function swatch(d: InviteDesign): { bg: string; accent: string } {
  if (d.palette === "custom") return { bg: d.bg ?? "#f4f1ea", accent: d.accent ?? "#c9a86a" };
  return PALETTES[d.palette];
}

/** Dark page colour: older app screens read invite_style "evening". */
export function isDarkDesign(d: InviteDesign): boolean {
  const n = parseInt(swatch(d).bg.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] < 0.3;
}
