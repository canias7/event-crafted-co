// Vendora component standard (locked with the owner, Oct 2026) — the
// shared tokens both apps build on. Screens may keep literal numbers as
// long as they sit on these scales; shadows always spread a SHADOW
// preset so every floating surface casts the same shadow.

// The brand palette. Gold fills primary buttons (ink label); goldMuted
// is its solid disabled fill — never fade a button with opacity.
export const COLORS = {
  ink: "#14161a", ivory: "#f4f1ea", cream: "#fbf9f4", surface: "#ece7db",
  border: "#e6e1d5", bronze: "#8a6f3e", gold: "#c9a86a", goldMuted: "#e0d2b0",
  goldTint: "#f2e7cb", red: "#b23a34", placeholder: "#746a58", white: "#ffffff",
} as const;

// The only corner radii: tags, inputs/tiles, cards, sheets, pills.
export const RADIUS = { tag: 8, input: 12, card: 20, sheet: 24, pill: 999 } as const;

// Spacing scale. Anything >= 12 is a multiple of 4; gutter is the
// screen's horizontal padding.
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32, gutter: 20 } as const;

// Labelled button heights: small, medium, large (full-width/primary CTAs).
export const BUTTON_HEIGHT = { sm: 36, md: 44, lg: 52 } as const;

export const SHADOW = {
  // Floating things: menus, popovers, toasts, sticky bars, floating buttons.
  soft: { shadowColor: "#14161a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  // Modals and sheets.
  lifted: { shadowColor: "#14161a", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 },
} as const;
