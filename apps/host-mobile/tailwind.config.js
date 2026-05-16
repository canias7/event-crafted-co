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
        background: "#ffffff",
        foreground: "#0a0a0a",
        muted: "#f5f5f5",
        "muted-foreground": "#6b7280",
        border: "#e5e7eb",
        accent: "#16a34a",
        "accent-foreground": "#ffffff",
      },
    },
  },
  plugins: [],
};
