import { useLocation } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { motion } from "framer-motion";
import { Menu, X, LogOut, LayoutDashboard, ChevronDown, Settings } from "lucide-react";
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
// "For vendors" entry was removed: vendor signup happens through the
// regular Sign up button now, not a separate apply flow.
function buildSecondaryLinks(t: (key: string) => string) {
  return [
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
  const { session, profile, ownListing, hasVendorAccess, signOut } = useAuth();
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
  // want. Vendor access → /vendor/home (the live root after the route
  // cleanup; /vendor/dashboard is gone). Otherwise → /customer/explore.
  const dashLabel = dashboardLabel(t);
  const dashPath = hasVendorAccess ? "/vendor/home" : "/customer/explore";

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
      style={{
        background: "rgba(255,253,250,0.5)",
        borderBottom: "0.5px solid rgba(255,138,76,0.12)",
      }}
      aria-label="Public"
    >
      <div className="container mx-auto flex items-center justify-between h-16 px-4 md:px-8">
        <Link to="/" className="font-editorial text-2xl text-foreground">
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
          {/* Super agents — shipped across every public page so the
              NEW pill stays visible while a visitor browses around
              (was previously only on the landing). */}
          <Link
            to="/super-agents"
            className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-200 ${
              location.pathname === "/super-agents"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-current={location.pathname === "/super-agents" ? "page" : undefined}
          >
            Super agents
            <span
              className="text-[9px] tracking-widest rounded-full px-1.5 py-px text-foreground"
              style={{ border: "0.5px solid rgba(0,0,0,0.35)" }}
            >
              NEW
            </span>
          </Link>
        </div>

        <div className="hidden md:flex items-center gap-1">
          {session && profile ? (
            <>
              <NotificationBell variant="light" />
              {(() => {
                // Vendor identity lives on `profiles` (business_name +
                // logo_url) — it survives whether the listing is
                // approved, pending, or doesn't exist yet. Fall back
                // to the listing-level fields only if the account row
                // is missing them, then to display_name.
                const navLogo = profile.logo_url ?? ownListing?.logo_url ?? null;
                const navName =
                  profile.business_name ??
                  ownListing?.business_name ??
                  profile.display_name ??
                  "Account";
                return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-2 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    {navLogo ? (
                      <img
                        src={navLogo}
                        alt={navName}
                        className="w-7 h-7 rounded-full object-cover"
                      />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-medium">
                        {navName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="hidden lg:inline">{navName}</span>
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
                );
              })()}
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
