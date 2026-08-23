// NativeWind / Tailwind config for vendor-mobile.
//
// Colors come from @vendora/core/tokens — the same module the web and
// host configs read — so `bg-background` / `text-foreground` /
// `text-muted-foreground` / `text-accent` render identical values on
// every surface. Don't add hex literals here; add a token instead.
// Colors come from the shared token module — the same file the web and
// host configs read — so `bg-background` / `text-foreground` /
// `text-muted-foreground` / `text-accent` render identical values on
// every surface. Don't add hex literals here; add a token instead.
//
// Required by relative path rather than "@vendora/core/tokens": this
// file is loaded by the Tailwind CLI before the workspace is
// necessarily linked, so a path that can't miss is worth more here than
// a tidy specifier. App source should use the package specifier.
const { tailwindColors } = require("../../packages/core/src/tokens.js");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: tailwindColors,
    },
  },
  plugins: [],
};
