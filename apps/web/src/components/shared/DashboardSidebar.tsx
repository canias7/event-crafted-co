import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import {
  LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";
import { customerNavItems, getBottomNav, setLastDashboardSide, vendorNavItems } from "@/data/navItems";

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
  const { t } = useTranslation();

  // Stash the active side so cross-cutting pages (/settings, /support)
  // know which sidebar to render when the user clicks over. Without
  // this they default to vendor nav whenever the user has vendor
  // access, even from the host side.
  useEffect(() => {
    if (items === vendorNavItems) setLastDashboardSide("vendor");
    else if (items === customerNavItems) setLastDashboardSide("host");
  }, [items]);

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

    // AI Superagents is the only nav row that swaps its label for a
    // horizontal scrolling marquee announcing the live agents. Same
    // height, padding, active+hover treatment as every other row — the
    // ONLY change is what fills the label area. Collapsed sidebar falls
    // back to the standard icon-only render.
    if (item.path === "/vendor/ai-superagents" && !collapsed) {
      return (
        <Link
          key={item.path}
          to={item.path}
          className="relative block"
          aria-current={isActive ? "page" : undefined}
        >
          <div
            className={`relative flex items-center rounded-lg text-sm font-medium transition-colors duration-200 overflow-hidden px-3 py-2.5 ${
              isActive
                ? "text-foreground bg-secondary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}
          >
            {/* Fade gradients on both edges so the text doesn't ram the
                row borders. Color picks up whatever bg is behind so the
                gradient blends in both inactive and active states. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-5 z-10"
              style={{
                background:
                  "linear-gradient(90deg, var(--sidebar-bg, transparent) 0%, transparent 100%)",
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-5 z-10"
              style={{
                background:
                  "linear-gradient(-90deg, var(--sidebar-bg, transparent) 0%, transparent 100%)",
              }}
            />
            <div className="flex whitespace-nowrap gap-4 items-center animate-marquee-x hover:[animation-play-state:paused]">
              {/* Track is duplicated once so translateX(-50%) loops seamlessly. */}
              {[0, 1].map((dup) => (
                <span
                  key={dup}
                  className="flex items-center gap-4 shrink-0"
                  aria-hidden={dup === 1}
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Super Agent
                  </span>
                  <Dot />
                  <span
                    className="text-[9.5px] uppercase tracking-[0.08em] font-semibold rounded-full px-2 py-0.5 bg-foreground text-background"
                  >
                    Now Available
                  </span>
                  <Dot />
                  <span>HILUX 2.7</span>
                  <Dot />
                  <span>RAPTOR 3.5</span>
                  <Dot />
                  <span>AXION 9.1</span>
                  <Dot />
                </span>
              ))}
            </div>
          </div>
        </Link>
      );
    }

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

  function Dot() {
    return (
      <span
        aria-hidden
        className="inline-block w-1 h-1 rounded-full bg-foreground/35 shrink-0"
      />
    );
  }

  return (
    <aside
      className={`hidden lg:flex flex-col h-screen sticky top-0 overflow-y-auto transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
      style={{
        // Transparent so the page canvas (vendor-canvas wash on
        // /vendor/*, plain white on customer/settings) shows
        // through. Hairline right border tinted amber so it blends
        // into the warm gradient instead of cutting a hard grey line.
        background: "transparent",
        borderRight: "0.5px solid rgba(255,138,76,0.18)",
      }}
      aria-label={`${title} navigation`}
    >
      {collapsed ? (
        <div className="px-2 py-4 border-b border-[rgba(255,138,76,0.14)] flex flex-col items-center gap-3">
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
        <div className="p-6 border-b border-[rgba(255,138,76,0.14)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={backPath} className="font-editorial text-2xl">
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
      {/* "Become a vendor" CTA removed — vendors sign up through the
          regular Sign up button on the public nav now. The dedicated
          apply page is gone. */}
      <nav
        className={`flex-1 ${collapsed ? "p-2 pt-3" : "p-3 pt-4"}`}
        aria-label="Primary"
      >
        {items.map(renderItem)}
      </nav>
      {resolvedBottom && resolvedBottom.length > 0 && (
        <nav
          className={`border-t border-[rgba(255,138,76,0.14)] ${collapsed ? "p-2" : "p-3"}`}
          aria-label="Secondary"
        >
          {resolvedBottom.map(renderItem)}
        </nav>
      )}
      {/* Dedicated Log out row removed — the Sign out action lives on
          /settings now. signOut + handleLogout helpers stay so other
          surfaces (mobile nav) can keep using them. */}
    </aside>
  );
}
