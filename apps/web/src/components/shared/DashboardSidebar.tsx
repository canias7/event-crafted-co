import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { VendoraLogo, VendoraMark } from "@/components/shared/VendoraLogo";
import {
  LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { customerNavItems, setLastDashboardSide, vendorNavItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { useVendorPlan, type VendorTier } from "@/hooks/useVendorPlan";
import { useLiveVendorBalance } from "@/hooks/useVendorCredits";

const TIER_LABEL: Record<VendorTier, string> = {
  free: "Free plan",
  starter: "Starter plan",
  pro: "Pro plan",
  studio: "Studio plan",
};

// Per-tier accent colors for the chip + glow. Red for the top tier
// (Studio) so it pops; orange for Pro (matches the brand-thread);
// amber for Starter; soft slate for Free.
const TIER_CHIP: Record<VendorTier, { bg: string; ring: string; text: string; shadow: string }> = {
  free:    { bg: "rgba(100,116,139,0.12)", ring: "rgba(100,116,139,0.35)", text: "rgb(71,85,105)",    shadow: "0 0 8px rgba(100,116,139,0.25)" },
  starter: { bg: "rgba(245,158,11,0.15)",  ring: "rgba(245,158,11,0.45)",  text: "rgb(180,83,9)",     shadow: "0 0 8px rgba(245,158,11,0.45)" },
  pro:     { bg: "rgba(255,138,76,0.18)",  ring: "rgba(255,138,76,0.5)",   text: "rgb(196,84,30)",    shadow: "0 0 10px rgba(255,138,76,0.55)" },
  studio:  { bg: "rgba(220,38,38,0.15)",   ring: "rgba(220,38,38,0.5)",    text: "rgb(185,28,28)",    shadow: "0 0 12px rgba(220,38,38,0.55)" },
};
const TIER_NAME: Record<VendorTier, string> = {
  free: "Free", starter: "Starter", pro: "Pro", studio: "Studio",
};

interface NavItem {
  labelKey: string;
  path: string;
  icon: LucideIcon;
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
  // Vendor-side sidebars swap the page-title sub-label for a live
  // plan badge ("Starter plan", "Pro plan", …) that flips the moment
  // the Stripe webhook updates vendor_profiles.subscription_tier.
  const { user } = useAuth();
  const isVendorSide = items === vendorNavItems;
  // Subscription tier lives on profiles (per-user) post migration
  // 20260524000000 — pass user.id, not ownListing.id.
  const { tier } = useVendorPlan(isVendorSide ? user?.id ?? null : null);
  const subLabel = isVendorSide ? TIER_LABEL[tier] : title;
  // Live credit balance shown as a small chip on the right of the
  // Usage nav row. Subscribes to vendor_credit_balances UPDATEs so
  // it ticks down as the vendor uses HILUX/Axion and ticks up on
  // top-ups, without a refresh.
  const { balance: liveBalance, initialized: balanceReady } =
    useLiveVendorBalance(isVendorSide ? user?.id ?? null : null);

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

    // Usage row gets a live balance chip on the right so the vendor
    // can see their credits without opening the page.
    const showBalance =
      isVendorSide && !collapsed && item.path === "/vendor/usage" && balanceReady;

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
          {!collapsed && <span className="truncate flex-1">{label}</span>}
          {showBalance && (
            <span
              className="text-[11px] font-medium tnum shrink-0 text-foreground/70"
              aria-label={`${liveBalance.toLocaleString()} credits`}
            >
              {liveBalance.toLocaleString()}
            </span>
          )}
        </div>
      </Link>
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
            title="Vendora — Events, simplified"
            aria-label="Vendora"
          >
            <VendoraMark size={28} color="currentColor" />
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
            <Link to={backPath} aria-label="Vendora — Events, simplified">
              <VendoraLogo size="md" color="currentColor" />
            </Link>
            {isVendorSide ? (
              <p className="mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <span
                  className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider"
                  style={{
                    background: TIER_CHIP[tier].bg,
                    color: TIER_CHIP[tier].text,
                    border: `1px solid ${TIER_CHIP[tier].ring}`,
                    boxShadow: TIER_CHIP[tier].shadow,
                  }}
                >
                  {TIER_NAME[tier]}
                </span>
                <span>plan</span>
              </p>
            ) : (
              <p className="font-label text-muted-foreground mt-2 truncate">
                {subLabel}
              </p>
            )}
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
        {items
          // Gallery is a Starter+ feature; hide the nav entry from
          // Free vendors so the upsell happens on /vendor/subscription
          // instead of an empty gallery surface they can't use.
          .filter(
            (item) =>
              !(item.path === "/vendor/gallery" && isVendorSide && tier === "free"),
          )
          .map(renderItem)}
      </nav>
      {/* Dedicated Log out row removed — the Sign out action lives on
          /settings now. signOut + handleLogout helpers stay so other
          surfaces (mobile nav) can keep using them. */}
    </aside>
  );
}
