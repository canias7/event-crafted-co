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
        background: "#ffffff",
        // INK — body text + solid CTAs
        foreground: "#0a0a0a",
        // CREAM_DEEP — secondary surfaces (sign-in button, message
        // bubbles received, filter chips inactive, "muted" backgrounds)
        muted: "#f5f5f5",
        // INK at 60% over CREAM, rendered as solid for stability
        "muted-foreground": "#6b7280",
        // INK at ~18% over CREAM, solid
        border: "#e5e7eb",
        // Brand accent kept for "approved / available" affordances.
        accent: "#16a34a",
        "accent-foreground": "#ffffff",
      },
    },
  },
  plugins: [],
};
