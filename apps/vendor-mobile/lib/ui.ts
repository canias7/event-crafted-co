// Vendora component standard (locked with the owner, Oct 2026): the
// shared tokens for colours, corners, spacing, button heights and
// shadows. Screens may keep literal numbers as long as they sit on these
// scales; any shadow that remains spreads one of the SHADOW presets so
// every floating surface casts the same shadow.

import { C } from "@/lib/theme";

/** Brand palette (see "Brand system" in the repo's CLAUDE.md). Page
 *  chrome follows the active light / dark theme (`C` in lib/theme.ts):
 *  `ink` is the text colour, `ivory` the page, `cream` the card, `white`
 *  the field fill. `onGold` is the fixed ink label on gold fills. */
export const COLORS = {
  ink: C.text, ivory: C.page, cream: C.card, surface: C.surface,
  border: C.border, bronze: C.accentText, gold: C.gold, goldMuted: C.goldMuted,
  goldTint: C.pending, red: C.error, placeholder: C.placeholder, white: C.field,
  onGold: C.onGold,
} as const;

/** Corner radii: tags, inputs/tiles, cards, sheets/modals, pills. */
export const RADIUS = { tag: 8, input: 12, card: 20, sheet: 24, pill: 999 } as const;

/** Spacing scale; values of 12 and up are multiples of 4. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32, gutter: 20 } as const;

/** Labelled button heights: small, medium, large (full-width CTAs). */
export const BUTTON_HEIGHT = { sm: 36, md: 44, lg: 52 } as const;

export const SHADOW = {
  // Floating things: menus, popovers, toasts, sticky bars, floating buttons.
  soft: { shadowColor: "#14161a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  // Modals and sheets.
  lifted: { shadowColor: "#14161a", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 },
} as const;
