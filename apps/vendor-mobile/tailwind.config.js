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
        // web --background (0 0% 100%) — main canvas / cards
        background: "#ffffff",
        // web --foreground (220 14% 9%) — navy-tinted ink, NOT pure black
        foreground: "#14161a",
        // web --secondary (220 14% 96%) — the cool surface used for chips,
        // received message bubbles, inactive filters, "muted" backgrounds
        muted: "#f3f4f6",
        secondary: "#f3f4f6",
        // web --muted-foreground (220 8% 40%)
        "muted-foreground": "#5e636e",
        // web --border (foreground @ 8%) — solid approximation
        border: "#e5e7eb",
        // web --accent (215 55% 22%) — deep brand navy (#1b3654). Used for
        // links, focus rings, badges, the wordmark.
        accent: "#1b3654",
        "accent-foreground": "#ffffff",
      },
    },
  },
  plugins: [],
};
