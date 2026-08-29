// NativeWind / Tailwind config for host-mobile. Mirrors
// vendor-mobile/tailwind.config.js intentionally so the two apps
// share an identical visual language. See that file for palette
// rationale.
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
        // Cream Vendora palette — kept identical to
        // vendor-mobile/tailwind.config.js. These were still the old
        // white/grey values while vendor moved to cream, which is why
        // the two apps did not look related.
        // Ivory page canvas
        background: "#f4f1ea",
        // Charcoal ink — navy-tinted, NOT pure black
        foreground: "#14161a",
        // Deep-cream surface for chips, inactive filters, "muted" backgrounds
        muted: "#ece7db",
        secondary: "#ece7db",
        "muted-foreground": "#14161a",
        // Warm hairline border
        border: "#e6e1d5",
        // Champagne gold — links, focus rings, badges, the accents
        accent: "#c9a86a",
        "accent-foreground": "#14161a",
      },
    },
  },
  plugins: [],
};
