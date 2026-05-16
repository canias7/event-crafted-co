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
        background: "#fdfbf7",
        foreground: "#1a1410",
        muted: "#f7f3ec",
        "muted-foreground": "#776c5f",
        border: "#dfd6c4",
        accent: "#16a34a",
        "accent-foreground": "#ffffff",
      },
    },
  },
  plugins: [],
};
