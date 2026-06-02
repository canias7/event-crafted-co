// App-wide ambient backdrop — two large, very soft navy washes that
// drift slowly behind all content. Mounted once at the app root; it's
// `position: fixed; z-index: -1`, so it paints above the body's base
// wash but behind every page's content. Pure decoration (aria-hidden,
// pointer-events: none) and holds still under prefers-reduced-motion.
// Pairs with the transparent `.vendor-canvas` / `.public-canvas`
// wrappers so the glow shows through on every page.
export function AmbientBackground() {
  return (
    <div aria-hidden className="ambient-bg">
      <span className="ambient-orb ambient-orb--1" />
      <span className="ambient-orb ambient-orb--2" />
      <span className="ambient-orb ambient-orb--3" />
    </div>
  );
}
