import { useLocation } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";

// Horizontal tab strip that lives at the top of related "hub" pages
// (Event details / Timeline / Microsite — Guests / Seating — etc).
// Each tab points at a different route; the active one is detected
// from the current pathname so the same component lives on every
// sibling page without duplication.
//
// Pages stay as-is (independent routes, independent code-splitting),
// but visually feel like one cluster — letting us cut sidebar items
// without losing access to anything.

export interface SubNavTab {
  label: string;
  to: string;
  /** When true, only matches when pathname === `to` (exact). Default
   *  is "starts with" so detail pages under the section stay highlighted. */
  exact?: boolean;
}

export function SubNavTabs({
  tabs,
  className = "",
}: {
  tabs: SubNavTab[];
  className?: string;
}) {
  const { pathname } = useLocation();

  return (
    <div
      className={`flex items-center gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:-mx-8 md:px-8 ${className}`}
      role="tablist"
    >
      {tabs.map((t) => {
        const active = t.exact
          ? pathname === t.to
          : pathname === t.to || pathname.startsWith(`${t.to}/`);
        return (
          <Link
            key={t.to}
            to={t.to}
            role="tab"
            aria-selected={active}
            className={`whitespace-nowrap text-sm h-8 px-3 inline-flex items-center rounded-full transition-colors ${
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
