// NativeWind / Tailwind config for host-mobile.
//
// This app has NOT been migrated onto the Vendora cream system yet — it
// still ships the original white / near-black / green palette, while web
// and vendor-mobile moved to ivory / charcoal / champagne. See
// @vendora/core/tokens for the canonical set.
//
// The migration is deliberately not done here: ~71 screen usages read
// these Tailwind tokens, but ~100 more colors are inlined as hex in the
// screens themselves. Flipping this file alone would repaint the former
// and leave the latter, which looks worse than either end state. The
// swap wants to happen together with a sweep of the inlined values.
//
// To migrate: delete `legacy` below and use `tailwindColors` instead.
const { tailwindColors } = require("../../packages/core/src/tokens.js");

// eslint-disable-next-line no-unused-vars -- kept as the migration target
const canonical = tailwindColors;

const legacy = {
  background: "#ffffff",
  foreground: "#0a0a0a",
  muted: "#f5f5f5",
  "muted-foreground": "#6b7280",
  border: "#e5e7eb",
  accent: "#16a34a",
  "accent-foreground": "#ffffff",
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: legacy,
    },
  },
  plugins: [],
};
