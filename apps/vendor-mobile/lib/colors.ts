// Vendor app color palette.
//
// This file used to carry its own hand-copied hex values and claimed to
// be "kept in lockstep with the web app's design tokens". It wasn't —
// it described a white/navy palette that had been retired two redesigns
// earlier, while instructing new screens to import from it. Anything
// that followed that instruction would have come out white-and-navy in
// a cream app.
//
// It is now a thin re-export of the real source of truth. Add tokens
// there, not here.
import { gold, ink, semantic, surface } from "@vendora/core/tokens";

export const colors = {
  /** Ivory page canvas. */
  background: surface.page,
  /** Warm cream card, one step up from the page. */
  card: surface.card,
  /** Primary text + "ink" buttons. */
  foreground: ink.DEFAULT,
  /** Secondary / dimmed text. */
  mutedForeground: ink.dim,
  /** Warm hairline borders + dividers. */
  border: surface.border,
  /** Subtle filled surfaces (chips, inputs). */
  surfaceMuted: surface.muted,
  /**
   * Champagne — the brand gold. Ornament on light surfaces (the V mark,
   * sparkles, hairlines, tints) and text on dark ones. NOT legible as
   * text on cream: use `goldInk` there.
   */
  gold: gold.DEFAULT,
  /** Bronze — the gold that stays readable as text/icons on cream. */
  goldInk: gold.ink,
  /** Pale gold — text on the near-black auth and profile-card grounds. */
  goldOnDark: gold.onDark,
  /** Errors / destructive actions. */
  destructive: semantic.destructive,
} as const;

export type AppColors = typeof colors;
