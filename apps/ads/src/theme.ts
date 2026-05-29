import { loadFont as loadBodoni } from "@remotion/google-fonts/BodoniModa";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

// --- Eventvendora brand palette (pulled from apps/web) ---
export const brand = {
  navy: "#1B3654", // brand wordmark / accent
  ink: "#1a1a1a", // primary text
  soft: "#4a4a4a", // secondary text
  crimson: "#c8403a", // CTA / accent line
  cream: "#fafafa",
  white: "#ffffff",
} as const;

// Bodoni Moda is the brand serif. Satoshi (the brand sans) isn't on Google
// Fonts, so Inter is used as a close, freely-loadable stand-in. To use real
// Satoshi, drop the .woff2 files in public/ and load them with @remotion/fonts.
// Only load the weights/subsets actually used, so renders stay fast.
const { fontFamily: bodoni } = loadBodoni("normal", {
  weights: ["600"],
  subsets: ["latin"],
});
const { fontFamily: inter } = loadInter("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});

export const fonts = {
  serif: bodoni,
  sans: inter,
} as const;
