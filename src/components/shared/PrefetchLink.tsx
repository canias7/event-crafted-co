import { forwardRef, useCallback, useEffect, useRef } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { resolveRouteImporter } from "@/router/lazyRoutes";

// Drop-in replacement for react-router-dom's <Link> that warm-loads the
// destination route's chunk on hover/touch/focus AND when the link
// scrolls into view (covers mobile users who don't hover). Falls back
// to plain Link behavior for paths not in the route registry.
//
// Usage: identical to <Link>. No prop changes required.

type PrefetchLinkProps = LinkProps & {
  /** Disable prefetch for this specific link (e.g. external or rare) */
  noPrefetch?: boolean;
};

// Caches the in-flight import promise so hover + click + viewport don't
// kick off three duplicate fetches.
const prefetched = new Set<string>();

function triggerPrefetch(to: string) {
  if (prefetched.has(to)) return;
  const importer = resolveRouteImporter(to);
  if (!importer) return;
  prefetched.add(to);
  // Fire-and-forget; rejection just means the chunk will be re-fetched
  // at click time.
  importer().catch(() => {
    prefetched.delete(to);
  });
}

export const PrefetchLink = forwardRef<HTMLAnchorElement, PrefetchLinkProps>(
  function PrefetchLink({ to, noPrefetch, onMouseEnter, onTouchStart, onFocus, ...rest }, ref) {
    const localRef = useRef<HTMLAnchorElement | null>(null);
    const setRefs = useCallback(
      (node: HTMLAnchorElement | null) => {
        localRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const path = typeof to === "string" ? to : to.pathname ?? "";

    const prefetch = useCallback(() => {
      if (noPrefetch || !path) return;
      triggerPrefetch(path);
    }, [noPrefetch, path]);

    // Viewport-based prefetch — important for mobile (no hover) and for
    // long pages where below-fold links should warm before scroll-down
    // tap. requestIdleCallback throttles so we don't bog the main thread.
    useEffect(() => {
      if (noPrefetch || !path || !localRef.current) return;
      const node = localRef.current;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const run = () => triggerPrefetch(path);
            if ("requestIdleCallback" in window) {
              (window as unknown as {
                requestIdleCallback: (cb: () => void) => void;
              }).requestIdleCallback(run);
            } else {
              setTimeout(run, 200);
            }
            observer.disconnect();
            break;
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(node);
      return () => observer.disconnect();
    }, [noPrefetch, path]);

    return (
      <Link
        ref={setRefs}
        to={to}
        onMouseEnter={(e) => {
          prefetch();
          onMouseEnter?.(e);
        }}
        onTouchStart={(e) => {
          prefetch();
          onTouchStart?.(e);
        }}
        onFocus={(e) => {
          prefetch();
          onFocus?.(e);
        }}
        {...rest}
      />
    );
  },
);
