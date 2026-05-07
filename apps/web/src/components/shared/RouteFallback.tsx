import { useEffect, useState } from "react";

// Suspense fallback for lazy routes. Stays invisible for the first
// ~100ms — most chunks load fast enough that flashing a skeleton at
// all is worse than nothing. After that we paint a calm shimmer that
// matches the page chrome (header strip + content placeholder rows).

const SHIMMER_DELAY_MS = 100;

export function RouteFallback() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), SHIMMER_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className={`min-h-screen transition-opacity duration-200 ${
        show ? "opacity-100" : "opacity-0"
      }`}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="border-b border-border h-16 md:h-20 px-6 md:px-8 flex items-center">
        <div className="h-5 w-24 bg-muted/70 rounded-sm animate-pulse" />
      </div>
      <div className="container mx-auto px-6 md:px-8 py-12 md:py-16 max-w-5xl">
        <div className="h-3 w-24 bg-muted/60 rounded-sm animate-pulse mb-6" />
        <div className="h-10 md:h-14 w-3/4 bg-muted/70 rounded-sm animate-pulse mb-4" />
        <div className="h-4 w-1/2 bg-muted/60 rounded-sm animate-pulse mb-12" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i}>
              <div className="aspect-[4/5] bg-muted/60 rounded-sm animate-pulse mb-3" />
              <div className="h-4 w-2/3 bg-muted/60 rounded-sm animate-pulse mb-2" />
              <div className="h-3 w-full bg-muted/40 rounded-sm animate-pulse" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading page…</span>
    </div>
  );
}
