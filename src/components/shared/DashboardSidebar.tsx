import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { LucideIcon, Search } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { getBottomNav } from "@/data/navItems";

interface NavItem {
  labelKey: string;
  path: string;
  icon: LucideIcon;
}

interface DashboardSidebarProps {
  items: NavItem[];
  /** Optional override; otherwise we look up the bottom group via the
   *  WeakMap registry in navItems.ts (one map entry per side). */
  bottomItems?: NavItem[];
  title: string;
  backPath?: string;
}

export function DashboardSidebar({
  items,
  bottomItems,
  title,
  backPath = "/",
}: DashboardSidebarProps) {
  const resolvedBottom = bottomItems ?? getBottomNav(items);
  const location = useLocation();
  const { t } = useTranslation();

  function renderItem(item: NavItem) {
    // Highlight the parent hub when sub-pages are open. The "starts with"
    // check covers e.g. /customer/event/details under /customer/event.
    const isActive =
      location.pathname === item.path ||
      location.pathname.startsWith(`${item.path}/`);
    return (
      <Link
        key={item.path}
        to={item.path}
        className="relative block"
        aria-current={isActive ? "page" : undefined}
      >
        <div
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
            isActive
              ? "text-foreground bg-secondary"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          }`}
        >
          <item.icon className="w-4 h-4" aria-hidden="true" />
          {t(item.labelKey)}
        </div>
      </Link>
    );
  }

  return (
    <aside
      className="hidden lg:flex flex-col w-64 border-r border-border bg-card h-screen sticky top-0 overflow-y-auto"
      aria-label={`${title} navigation`}
    >
      <div className="p-6 border-b border-border flex items-start justify-between gap-3">
        <div>
          <Link to={backPath} className="font-display text-lg">
            Vendora
          </Link>
          <p className="font-label text-muted-foreground mt-1">{title}</p>
        </div>
        <NotificationBell variant="light" />
      </div>
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            document.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true,
                ctrlKey: true,
              }),
            );
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground bg-secondary/40 hover:bg-secondary hover:text-foreground transition-colors"
          aria-label="Open command palette (Cmd+K)"
        >
          <Search className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border">
            ⌘K
          </kbd>
        </button>
      </div>
      <nav className="flex-1 p-3" aria-label="Primary">
        {items.map(renderItem)}
      </nav>
      {resolvedBottom && resolvedBottom.length > 0 && (
        <nav className="p-3 border-t border-border" aria-label="Secondary">
          {resolvedBottom.map(renderItem)}
        </nav>
      )}
    </aside>
  );
}
