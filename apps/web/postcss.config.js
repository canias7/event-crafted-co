// Big screens show the laptop layout, just bigger (owner's call, Oct 2026):
// from 1440px wide, index.css grows the root font size with the window, and
// this plugin turns every CSS pixel length (except hairlines) into rem so
// fixed sizes like text-[11px] grow with it. Media-query breakpoints stay
// in px. Below 1440px 1rem is 16px, so nothing changes there.
const pxToRem = () => ({
  postcssPlugin: "px-to-rem",
  Declaration(decl) {
    if (!decl.value.includes("px")) return;
    decl.value = decl.value.replace(/(-?\d*\.?\d+)px\b/g, (m, n) => {
      const v = parseFloat(n);
      return Math.abs(v) <= 1 ? m : `${+(v / 16).toFixed(5)}rem`;
    });
  },
});
pxToRem.postcss = true;

export default {
  plugins: [
    (await import("tailwindcss")).default,
    pxToRem(),
    (await import("autoprefixer")).default,
  ],
};
