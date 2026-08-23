// Vendora design tokens — the single source of truth for color across
// apps/web, apps/vendor-mobile, apps/host-mobile and apps/admin.
//
// Written as CommonJS (not TS) on purpose: the mobile Tailwind configs
// are plain Node modules loaded by the Tailwind CLI, so they can only
// `require()` this. App code gets types from tokens.d.ts alongside.
//
// Before this file existed the palette lived in six places — two web
// configs, three mobile configs and ~30 per-screen `const PAGE/CARD/
// INK/GOLD` blocks — each maintained by hand. That is how the product
// ended up with four golds and a `CREAM` that meant #f4efe6, #f4f1ea,
// #fbf9f4 and #fdfcfa depending on which file you opened.

/**
 * Surfaces. The system is warm: every neutral carries a little of the
 * ivory hue rather than being a pure grey.
 */
const surface = {
  /** Ivory page canvas — the ground almost everything sits on. */
  page: "#f4f1ea",
  /** Warm cream card, one step up from the page. */
  card: "#fbf9f4",
  /** Deep cream — chips, inactive filters, received message bubbles. */
  muted: "#ece7db",
  /** Warm hairline border on light surfaces. */
  border: "#e6e1d5",

  /** Near-black page ground. Used by all five auth screens. */
  pageDark: "#0d0f13",
  /** Raised dark card (the profile identity card). */
  cardDark: "#16181d",
  /** Dark bottom sheet (signup). */
  sheetDark: "#13161c",
  /** Hairline on a dark ground — white at low alpha, not a solid. */
  borderDark: "rgba(255,255,255,0.16)",
};

/**
 * Ink. `on*` names say which ground the color is legible against.
 */
const ink = {
  /** Primary text on light surfaces. Charcoal, navy-tinted, not black. */
  DEFAULT: "#14161a",
  /** Secondary / dimmed text on light surfaces. */
  dim: "#5e636e",
  /** Primary text on dark surfaces — warm off-white, not pure white. */
  onDark: "#f4efe6",
  /** Secondary text on dark surfaces. */
  dimOnDark: "#b8ab98",
};

/**
 * Gold has three jobs, and one color cannot do all of them. Which one
 * to reach for is decided by two questions:
 *
 *   1. Is it on a dark surface?  -> `gold`. Done.
 *   2. On cream — must it be read?
 *        yes -> `goldInk`   (a word, or an icon carrying information)
 *        no  -> `gold`      (a sparkle, a border, a tint, the V mark)
 *
 * The principle underneath: contrast rules only apply to things people
 * read. Ornament is exempt, which is why `gold` keeps most of its
 * territory. Ratios below are against the surface each is used on.
 */
const gold = {
  /** Champagne — the brand gold. Ornament on light; text on dark (8.49:1 on pageDark). */
  DEFAULT: "#c9a86a",
  /** Bronze — the only gold legible as text on cream (4.51:1 on card). */
  ink: "#8a6f3e",
  /** Pale gold — text on the near-black grounds (9.77:1 on cardDark). */
  onDark: "#d9bd82",
  /** Gold tint — a fill behind gold callouts. Never use as a text color. */
  tint: "#eadfc6",
  /** Label color for a champagne-filled button (8.01:1 on gold). */
  inkOnGold: "#14161a",
};

/** Status colors. Deliberately outside the gold ramp so state never reads as brand. */
const semantic = {
  destructive: "#dc2828",
  success: "#2e7d4f",
  warning: "#d97706",
};

/**
 * Flat map consumed by the mobile Tailwind configs, so `bg-background`,
 * `text-foreground`, `text-accent` etc. resolve to the same values the
 * web tokens produce.
 */
const tailwindColors = {
  background: surface.page,
  foreground: ink.DEFAULT,
  card: surface.card,
  muted: surface.muted,
  secondary: surface.muted,
  "muted-foreground": ink.dim,
  border: surface.border,
  // Accent is the readable gold: a Tailwind color token can end up on
  // text, so it has to be the variant that survives that. Ornamental
  // champagne is `gold` below.
  accent: gold.ink,
  "accent-foreground": "#ffffff",
  gold: gold.DEFAULT,
  "gold-ink": gold.ink,
  "gold-on-dark": gold.onDark,
  "gold-tint": gold.tint,
  destructive: semantic.destructive,
  success: semantic.success,
  warning: semantic.warning,
};

module.exports = { surface, ink, gold, semantic, tailwindColors };
