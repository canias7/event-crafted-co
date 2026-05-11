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
        background: "#faf5ec",
        foreground: "#1a1410",
        muted: "#f5efe5",
        "muted-foreground": "#776c5f",
        border: "#dcd1c1",
        accent: "#16a34a",
        "accent-foreground": "#ffffff",
      },
    },
  },
  plugins: [],
};
