import { useLocation } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { motion } from "framer-motion";
import { Menu, X, LogOut, LayoutDashboard, ChevronDown, Settings, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { categoryConfig } from "@/pages/VendorCategoryPage";

// Top-level public-nav links. The "Vendors" entry is rendered as a
// dropdown menu (not just a single link) — see VendorsDropdown below.
function buildSecondaryLinks(t: (key: string) => string) {
  return [
    { label: t("nav.real_events"), path: "/real-events" },
    { label: t("nav.for_vendors"), path: "/vendor-apply" },
  ];
}

function dashboardLabel(t?: (key: string) => string) {
  // Translation is best-effort — if no t passed (legacy), fall back.
  return t ? t("nav.dashboard") : "My dashboard";
}

export function PublicNav() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileVendorsOpen, setMobileVendorsOpen] = useState(false);
  const { session, profile, hasVendorAccess, signOut } = useAuth();
  const { t } = useTranslation();
  const secondaryLinks = buildSecondaryLinks(t);

  // Sort categories alphabetically by display name. comingSoon items
  // sort to the bottom so the live ones are scanned first.
  const sortedCategories = useMemo(() => {
    return Object.entries(categoryConfig)
      .map(([slug, cfg]) => ({ slug, ...cfg }))
      .sort((a, b) => {
        if (!!a.comingSoon !== !!b.comingSoon) return a.comingSoon ? 1 : -1;
        return a.display.localeCompare(b.display);
      });
  }, []);

  // Multi-role: send the user to whichever portal they're more likely to
  // want. If they have vendor access, default to the vendor dashboard
  // (their inbox lives there); otherwise the host dashboard. Either side
  // exposes a switcher to flip between them.
  const dashLabel = dashboardLabel(t);
  const dashPath = hasVendorAccess ? "/vendor/dashboard" : "/customer/dashboard";

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-sm"
      aria-label="Public"
    >
      <div className="container mx-auto flex items-center justify-between h-16 px-4 md:px-8">
        <Link to="/" className="font-display text-xl tracking-tight text-foreground">
          Vendora
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {/* Vendors → dropdown of all categories */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`inline-flex items-center gap-1 text-sm font-medium transition-colors duration-200 outline-none ${
                  location.pathname.startsWith("/vendors")
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-current={
                  location.pathname.startsWith("/vendors") ? "page" : undefined
                }
              >
                {t("nav.vendors")}
                <ChevronDown className="w-3 h-3" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-72 max-h-[80vh] overflow-y-auto"
            >
              <DropdownMenuItem asChild>
                <Link to="/vendors" className="cursor-pointer font-medium">
                  All vendors
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/vendors/locations" className="cursor-pointer">
                  Browse by location
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Categories
              </DropdownMenuLabel>
              {sortedCategories.map((c) =>
                c.comingSoon ? (
                  <DropdownMenuItem
                    key={c.slug}
                    disabled
                    className="opacity-60 cursor-not-allowed"
                  >
                    <span className="flex-1">{c.display}</span>
                    <span className="text-[10px] uppercase tracking-wide bg-secondary text-muted-foreground rounded-full px-1.5 py-0.5">
                      Soon
                    </span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={c.slug} asChild>
                    <Link
                      to={`/vendors/category/${c.slug}`}
                      className="cursor-pointer"
                    >
                      {c.display}
                    </Link>
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {secondaryLinks.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`text-sm font-medium transition-colors duration-200 ${
                location.pathname === item.path
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-current={location.pathname === item.path ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-1">
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
            className="hidden lg:inline-flex items-center gap-2 px-3 h-8 rounded-full bg-muted hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground text-xs transition-colors mr-2"
            aria-label="Open search"
          >
            <Search className="w-3.5 h-3.5" />
            Search
            <kbd className="hidden xl:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted-foreground/10 text-[10px] font-mono">
              ⌘K
            </kbd>
          </button>
          {session && profile ? (
            <>
              <NotificationBell variant="light" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-2 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <span className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-medium">
                      {(profile.display_name ?? "U").charAt(0).toUpperCase()}
                    </span>
                    <span className="hidden lg:inline">
                      {profile.display_name ?? "Account"}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to={dashPath} className="cursor-pointer">
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    {dashLabel}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer">
                    <Settings className="w-4 h-4 mr-2" />
                    {t("nav.settings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" />
                  {t("nav.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-foreground hover:bg-muted"
                >
                  {t("nav.login")}
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm" variant="secondary" className="h-9">
                  {t("nav.signup")}
                </Button>
              </Link>
            </>
          )}
          <LanguageSwitcher tone="light" />
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? t("nav.close_menu") : t("nav.open_menu")}
          aria-expanded={mobileOpen}
          aria-controls="public-mobile-menu"
        >
          {mobileOpen ? (
            <X className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Menu className="w-5 h-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <motion.div
          id="public-mobile-menu"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-background border-b border-border px-4 pb-4"
        >
          {/* Vendors expandable section */}
          <button
            type="button"
            onClick={() => setMobileVendorsOpen((x) => !x)}
            className="flex items-center justify-between w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={mobileVendorsOpen}
          >
            <span>{t("nav.vendors")}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${
                mobileVendorsOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {mobileVendorsOpen && (
            <div className="pl-4 pb-2 max-h-72 overflow-y-auto">
              <Link
                to="/vendors"
                onClick={() => setMobileOpen(false)}
                className="block py-2 text-sm font-medium text-foreground"
              >
                All vendors
              </Link>
              <Link
                to="/vendors/locations"
                onClick={() => setMobileOpen(false)}
                className="block py-2 text-sm text-muted-foreground"
              >
                By location
              </Link>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mt-3 mb-1">
                Categories
              </p>
              {sortedCategories.map((c) =>
                c.comingSoon ? (
                  <p
                    key={c.slug}
                    className="block py-2 text-sm text-muted-foreground/60"
                  >
                    {c.display}{" "}
                    <span className="text-[10px] uppercase tracking-wide bg-secondary rounded-full px-1.5 py-0.5 ml-1">
                      Soon
                    </span>
                  </p>
                ) : (
                  <Link
                    key={c.slug}
                    to={`/vendors/category/${c.slug}`}
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {c.display}
                  </Link>
                ),
              )}
            </div>
          )}
          {secondaryLinks.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className="block py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          {session && profile ? (
            <>
              <Link
                to={dashPath}
                onClick={() => setMobileOpen(false)}
                className="block py-3 text-sm font-medium text-foreground border-t border-border mt-2 pt-3"
              >
                {dashLabel}
              </Link>
              <button
                onClick={() => {
                  setMobileOpen(false);
                  signOut();
                }}
                className="block w-full text-left py-3 text-sm font-medium text-muted-foreground"
              >
                Sign out
              </button>
            </>
          ) : (
            <div className="flex gap-3 pt-3 border-t border-border mt-2">
              <Link to="/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" className="w-full" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link to="/signup" className="flex-1" onClick={() => setMobileOpen(false)}>
                <Button className="w-full" size="sm">
                  Get started
                </Button>
              </Link>
            </div>
          )}
        </motion.div>
      )}
    </nav>
  );
}
