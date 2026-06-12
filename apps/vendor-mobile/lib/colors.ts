// Vendor app color palette — single source of truth, kept in lockstep
// with the web app's design tokens (apps/web/src/index.css :root).
//
// Web ships ONE light palette: pure-white surfaces, a deep-navy brand
// accent, and cool neutral grays. The old warm cream/champagne/gold
// palette was retired on web; these values are the canonical
// replacements for its remaining mobile remnants.
//
//   Web token           HSL (index.css)      → hex / rgba
//   --background        0 0% 100%              #ffffff
//   --foreground        220 14% 9%             #14161a
//   --muted-foreground  220 8% 40%             #5e636e
//   --border            220 14% 9% / 0.08      rgba(20,22,26,0.08)
//   --secondary         220 14% 96%            #f3f4f6
//   --destructive       0 72% 51%              #dc2828
//   brand navy (accent) rgba(27,54,84)         #1b3654
//
// Existing screens still inline these hex values directly; new screens
// should import from here so the palette can't drift again.

export const colors = {
  /** Page / card surfaces — web --background, --card */
  background: "#ffffff",
  /** Primary text + "ink" buttons — web --foreground / --primary */
  foreground: "#14161a",
  /** Secondary / dimmed text — web --muted-foreground */
  mutedForeground: "#5e636e",
  /** Hairline borders + dividers — web --border (foreground @ 8%) */
  border: "rgba(20,22,26,0.08)",
  /** Subtle filled surfaces (chips, inputs) — web --secondary */
  surfaceMuted: "#f3f4f6",
  /** Deep-navy brand accent — links, focus, brand mark (web body navy) */
  accent: "#1b3654",
  /** Errors / destructive actions — web --destructive */
  destructive: "#dc2828",
} as const;

export type AppColors = typeof colors;
