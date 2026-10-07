import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { VendoraLogo, VendoraMark } from "@/components/shared/VendoraLogo";
import {
  ChevronDown,
  LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { customerNavItems, setLastDashboardSide, vendorNavItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { useVendorPlan, type VendorTier } from "@/hooks/useVendorPlan";
import { useLiveVendorBalance } from "@/hooks/useVendorCredits";
import { siteLocaleOr } from "@/lib/intlLocale";

// 'studio' is Premium's internal slug (kept for Stripe/webhook
// compat); 'starter' is a retired, grandfathered tier. Labels and chip
// names live in the "portal" namespace under sidebar.tier_label.<tier>
// and sidebar.tier_name.<tier>.

// Per-tier chip colours, from the brand palette: Free and Starter are
// neutral, Pro is bronze on the gold tint, Premium (studio) is champagne.
// Chips are flat, so there is no glow.
const TIER_CHIP: Record<VendorTier, { bg: string; ring: string; text: string; shadow: string }> = {
  free:    { bg: "hsl(var(--muted))",   ring: "hsl(var(--border))", text: "hsl(var(--foreground))", shadow: "none" },
  starter: { bg: "hsl(var(--muted))",   ring: "hsl(var(--border))", text: "hsl(var(--foreground))", shadow: "none" },
  pro:     { bg: "hsl(var(--pending))", ring: "hsl(var(--gold))",   text: "hsl(var(--accent))",     shadow: "none" },
  studio:  { bg: "hsl(var(--gold))",    ring: "hsl(var(--gold))",   text: "hsl(var(--foreground))", shadow: "none" },
};

// Pages pass an English title ("Vendor Portal", "Customer", …); show it in
// the visitor's language. A title not listed here is shown as given.
const TITLE_KEYS = new Map<string, string>([
  ["Vendor Portal", "vendor_portal"],
  ["Customer", "customer"],
  ["Events", "events"],
  ["Account", "account"],
  ["Explore", "explore"],
  ["Profile", "profile"],
  ["My Profile", "my_profile"],
  ["Edit profile", "edit_profile"],
]);

interface NavItem {
  labelKey: string;
  /** Optional — items without a path are section headers (toggle only). */
  path?: string;
  /** Optional — when omitted, the row renders as text only (no icon). */
  icon?: LucideIcon;
  /** Optional nested sub-items shown indented below the parent row. */
  children?: NavItem[];
  /** Match active-state on the full path incl. query (pathname+search). */
  exact?: boolean;
}

interface DashboardSidebarProps {
  items: NavItem[];
  title: string;
  backPath?: string;
}

const COLLAPSE_KEY = "vendora.dashboard-sidebar.collapsed";

export function DashboardSidebar({
  items,
  title,
  backPath = "/",
}: DashboardSidebarProps) {
  const location = useLocation();
  const { t } = useTranslation();
  const { t: tp } = useTranslation("portal");
  const titleKey = TITLE_KEYS.get(title);
  const titleText = titleKey ? tp(`sidebar.titles.${titleKey}`) : title;
  // Vendor-side sidebars swap the page-title sub-label for a live
  // plan badge ("Starter plan", "Pro plan", …) that flips the moment
  // the Stripe webhook updates vendor_profiles.subscription_tier.
  const { user } = useAuth();
  const isVendorSide = items === vendorNavItems;
  // Subscription tier lives on profiles (per-user) post migration
  // 20260524000000 — pass user.id, not ownListing.id.
  const { tier } = useVendorPlan(isVendorSide ? user?.id ?? null : null);
  const subLabel = isVendorSide ? tp(`sidebar.tier_label.${tier}`) : titleText;
  // Live credit balance shown as a small chip on the right of the
  // Usage nav row. Subscribes to vendor_credit_balances UPDATEs so
  // it ticks down as the vendor spends credits and ticks up on
  // top-ups, without a refresh.
  const { balance: liveBalance, initialized: balanceReady } =
    useLiveVendorBalance(isVendorSide ? user?.id ?? null : null);
  // Spanish and Russian format the count in the site's locale; English
  // keeps the browser default it always used.
  const balanceText = liveBalance.toLocaleString(siteLocaleOr(undefined));

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

  function isPathActive(path: string, exact?: boolean): boolean {
    // `exact` items (e.g. Overview vs Workspace, same pathname different
    // ?tab) match the full path including the query string.
    if (exact) return location.pathname + location.search === path;
    return (
      location.pathname === path ||
      location.pathname.startsWith(`${path}/`)
    );
  }

  // Tracks which section headers the user explicitly toggled open.
  // Combined with route-derived "active section" so a section is
  // shown open whenever the user is inside it OR clicked it open.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  function toggleSection(key: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderItem(item: NavItem) {
    const selfActive = item.path ? isPathActive(item.path, item.exact) : false;
    // Parent stays highlighted when ANY child route is open — keeps
    // the visual "you are inside this section" anchor.
    const anyChildActive = (item.children ?? []).some(
      (c) => c.path && isPathActive(c.path, c.exact),
    );
    const isActive = selfActive || anyChildActive;
    const label = t(item.labelKey);
    const hasChildren = !!item.children && item.children.length > 0;
    const isHeader = hasChildren && !item.path;
    // Show children when section is active (user is inside) OR the
    // user explicitly toggled the header open. Headers without a
    // path can only be revealed via the toggle since they're not
    // navigable.
    const expanded = isActive || openSections.has(item.labelKey);
    const showChildren = hasChildren && !collapsed && expanded;

    // Usage row gets a live balance chip on the right.
    const showBalance =
      isVendorSide && !collapsed && item.path === "/vendor/usage" && balanceReady;

    const row = (
      <div
        className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-200 ${
          collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
        } ${
          isActive
            ? "text-foreground bg-secondary"
            : "text-muted-foreground hover:text-accent hover:bg-secondary/50"
        }`}
      >
        {item.icon ? (
          <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
        ) : null}
        {!collapsed && <span className="truncate flex-1">{label}</span>}
        {showBalance && (
          <span
            className="text-[11px] font-medium tnum shrink-0 text-foreground"
            aria-label={tp("sidebar.credits", {
              count: liveBalance,
              balance: balanceText,
            })}
          >
            {balanceText}
          </span>
        )}
        {hasChildren && !collapsed && (
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
              expanded ? "" : "-rotate-90"
            }`}
            aria-hidden="true"
          />
        )}
      </div>
    );

    return (
      <div key={item.path ?? item.labelKey}>
        {isHeader ? (
          <button
            type="button"
            onClick={() => toggleSection(item.labelKey)}
            className="relative block w-full text-left"
            aria-expanded={expanded}
            title={collapsed ? label : undefined}
          >
            {row}
          </button>
        ) : (
          <Link
            to={item.path!}
            className="relative block"
            aria-current={selfActive ? "page" : undefined}
            aria-expanded={hasChildren ? expanded : undefined}
            title={collapsed ? label : undefined}
          >
            {row}
          </Link>
        )}
        {showChildren ? (
          <div className="mt-0.5 ml-3 pl-3 border-l border-border flex flex-col gap-0.5">
            {item.children!.map((child) => {
              const childActive = child.path ? isPathActive(child.path) : false;
              return (
                <Link
                  key={child.path ?? child.labelKey}
                  to={child.path ?? "#"}
                  className="relative block"
                  aria-current={childActive ? "page" : undefined}
                >
                  <div
                    className={`flex items-center gap-3 rounded-lg text-[13px] font-medium transition-colors duration-200 px-2.5 py-1.5 ${
                      childActive
                        ? "text-foreground bg-secondary"
                        : "text-muted-foreground hover:text-accent hover:bg-secondary/50"
                    }`}
                  >
                    {child.icon ? (
                      <child.icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    ) : null}
                    <span className="truncate flex-1">{t(child.labelKey)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
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
        borderRight: "0.5px solid rgba(0,0,0,0.08)",
      }}
      aria-label={tp("sidebar.nav_label", { title: titleText })}
    >
      {collapsed ? (
        <div className="px-2 py-4 border-b border-[rgba(0,0,0,0.08)] flex flex-col items-center gap-3">
          <Link
            to={backPath}
            title={tp("sidebar.logo_label")}
            aria-label="Vendora"
          >
            <VendoraMark size={28} variant="gold" />
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label={tp("sidebar.expand")}
            className="w-8 h-8 rounded-md text-muted-foreground hover:text-accent hover:bg-secondary/50 flex items-center justify-center transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="px-5 py-6 border-b border-[rgba(0,0,0,0.08)]">
          {/* The full logo on its own row (the small size fits the 256px
              sidebar); the plan or area label and the collapse button
              sit under it. */}
          <Link to={backPath} aria-label={tp("sidebar.logo_label")}>
            <VendoraLogo size="sm" color="currentColor" withTagline />
          </Link>
          <div className="mt-3 flex items-center justify-between gap-3">
            {isVendorSide ? (
              <p className="flex min-w-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {/* "Free plan" / "plan Gratis": the chip and the word swap
                    places by language. */}
                <Trans
                  i18nKey="sidebar.plan_badge"
                  ns="portal"
                  values={{ tier: tp(`sidebar.tier_name.${tier}`) }}
                  components={{
                    chip: (
                      <span
                        className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider"
                        style={{
                          background: TIER_CHIP[tier].bg,
                          color: TIER_CHIP[tier].text,
                          border: `1px solid ${TIER_CHIP[tier].ring}`,
                          boxShadow: TIER_CHIP[tier].shadow,
                        }}
                      />
                    ),
                    word: <span />,
                  }}
                />
              </p>
            ) : (
              <p className="min-w-0 truncate font-label text-muted-foreground">
                {subLabel}
              </p>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label={tp("sidebar.collapse")}
              className="w-7 h-7 rounded-md text-muted-foreground hover:text-accent hover:bg-secondary/50 flex items-center justify-center transition-colors shrink-0"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      {/* "Become a vendor" CTA removed — vendors sign up through the
          regular Sign up button on the public nav now. The dedicated
          apply page is gone. */}
      <nav
        className={`flex-1 ${collapsed ? "p-2 pt-3" : "p-3 pt-4"}`}
        aria-label={tp("sidebar.primary")}
      >
        {/* Gallery shows for every vendor tier, including Free. */}
        {items.map(renderItem)}
      </nav>
      {/* Dedicated Log out row removed — the Sign out action lives on
          /settings now. signOut + handleLogout helpers stay so other
          surfaces (mobile nav) can keep using them. */}
    </aside>
  );
}
