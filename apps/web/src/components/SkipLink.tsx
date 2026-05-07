/**
 * Visible-on-focus "skip to main content" link, mounted globally.
 * Keyboard users tab here first to jump past the nav. Off-screen until
 * the focus lands on it; then slides into view at the top-left.
 *
 * Pages should render a `<main id="main-content">` (or apply that id
 * to whatever is the primary landmark) for the link to work. Most
 * portal layouts already wrap content in <main>; the id is a no-op
 * cost when the target doesn't exist.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-full focus:bg-foreground focus:text-background focus:font-medium focus:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
    >
      Skip to main content
    </a>
  );
}
