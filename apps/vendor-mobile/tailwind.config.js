// NativeWind / Tailwind config for vendor-mobile.
//
// Palette is the "cream + ink" set originally inlined in
// app/(auth)/welcome.tsx (CREAM / CREAM_DEEP / INK / INK_DIM /
// INK_BORDER). Lifting it into Tailwind tokens so every screen
// that uses bg-background / text-foreground / bg-muted / etc.
// picks up the warm aesthetic without per-screen overrides.
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
        // CREAM — main canvas
        background: "#fdfbf7",
        // INK — body text + solid CTAs
        foreground: "#1a1410",
        // CREAM_DEEP — secondary surfaces (sign-in button, message
        // bubbles received, filter chips inactive, "muted" backgrounds)
        muted: "#f7f3ec",
        // INK at 60% over CREAM, rendered as solid for stability
        "muted-foreground": "#776c5f",
        // INK at ~18% over CREAM, solid
        border: "#dfd6c4",
        // Brand accent kept for "approved / available" affordances.
        accent: "#16a34a",
        "accent-foreground": "#ffffff",
      },
    },
  },
  plugins: [],
};
