import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import {
  LogOut,
  LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { getBottomNav } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";

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

const COLLAPSE_KEY = "vendora.dashboard-sidebar.collapsed";

export function DashboardSidebar({
  items,
  bottomItems,
  title,
  backPath = "/",
}: DashboardSidebarProps) {
  const resolvedBottom = bottomItems ?? getBottomNav(items);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { signOut } = useAuth();

  async function handleLogout() {
    await signOut();
    navigate("/", { replace: true });
  }

  // Collapse state persists across pages so flipping the toggle on
  // one route stays flipped when the vendor navigates to another.
  // Reads localStorage synchronously on first render so the layout
  // doesn't visibly snap from expanded → collapsed.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  function renderItem(item: NavItem) {
    // Highlight the parent hub when sub-pages are open. The "starts with"
    // check covers e.g. /customer/event/details under /customer/event.
    const isActive =
      location.pathname === item.path ||
      location.pathname.startsWith(`${item.path}/`);
    const label = t(item.labelKey);
    return (
      <Link
        key={item.path}
        to={item.path}
        className="relative block"
        aria-current={isActive ? "page" : undefined}
        title={collapsed ? label : undefined}
      >
        <div
          className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-200 ${
            collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
          } ${
            isActive
              ? "text-foreground bg-secondary"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          }`}
        >
          <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">{label}</span>}
        </div>
      </Link>
    );
  }

  return (
    <aside
      className={`hidden lg:flex flex-col border-r border-border bg-card h-screen sticky top-0 overflow-y-auto transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
      aria-label={`${title} navigation`}
    >
      {collapsed ? (
        <div className="px-2 py-4 border-b border-border flex flex-col items-center gap-3">
          <Link
            to={backPath}
            className="font-display text-lg leading-none"
            title="Vendora"
          >
            V
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center justify-center transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="p-6 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={backPath} className="font-display text-lg">
              Vendora
            </Link>
            <p className="font-label text-muted-foreground mt-1 truncate">
              {title}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
            className="w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center justify-center transition-colors shrink-0"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <nav
        className={`flex-1 ${collapsed ? "p-2 pt-3" : "p-3 pt-4"}`}
        aria-label="Primary"
      >
        {items.map(renderItem)}
      </nav>
      {resolvedBottom && resolvedBottom.length > 0 && (
        <nav
          className={`border-t border-border ${collapsed ? "p-2" : "p-3"}`}
          aria-label="Secondary"
        >
          {resolvedBottom.map(renderItem)}
        </nav>
      )}
      {/* Logout pinned to the very bottom — destructive-tinted hover
          so it reads as the exit door, not just another link. Signs
          out via useAuth, then bounces to the landing page. */}
      <div
        className={`border-t border-border ${collapsed ? "p-2" : "p-3"}`}
      >
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? t("nav.logout") : undefined}
          className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ${
            collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" aria-hidden />
          {!collapsed && <span className="truncate">{t("nav.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
