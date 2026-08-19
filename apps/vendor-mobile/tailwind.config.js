// NativeWind / Tailwind config for vendor-mobile.
//
// Palette mirrors the web app's design tokens (apps/web/src/index.css)
// so bg-background / text-foreground / bg-muted / text-muted-foreground /
// text-accent render the SAME colors as the web. Web tokens are HSL in
// index.css; the hex equivalents are inlined here.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Cream Vendora palette — the ivory/charcoal/champagne-gold
        // system used across every tab screen. Keep in sync with the
        // per-file constants (PAGE / CARD / SURFACE / BORDER / INK /
        // GOLD).
        // Ivory page canvas
        background: "#f4f1ea",
        // Charcoal ink — navy-tinted, NOT pure black
        foreground: "#14161a",
        // Deep-cream surface used for chips, received message bubbles,
        // inactive filters, "muted" backgrounds
        muted: "#ece7db",
        secondary: "#ece7db",
        "muted-foreground": "#5e636e",
        // Warm hairline border
        border: "#e6e1d5",
        // Champagne gold — links, focus rings, badges, the ✦ accents
        accent: "#c9a86a",
        "accent-foreground": "#14161a",
      },
    },
  },
  plugins: [],
};
