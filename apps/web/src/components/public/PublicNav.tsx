import { useLocation } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { motion } from "framer-motion";
import { Menu, X, LogOut, LayoutDashboard, ChevronDown, Settings } from "lucide-react";
import { useState } from "react";
import { VendoraLogo } from "@/components/shared/VendoraLogo";
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
import { categoryConfig } from "@/pages/VendorCategoryPage";
import { useCategoryNames } from "@/lib/categoryNames";

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

const CREAM = "#f4f1ea";

// `tone="overlay"` sits the nav on a dark photo hero (the home and
// vendors pages): in flow instead of fixed, no glass, cream links with a
// gold underline on the current page, gold Sign up.
// `tone="dark"` is the same look as a sticky solid ink bar, for the dark
// pages (Explore, How it works).
export function PublicNav({
  tone = "light",
}: { tone?: "light" | "overlay" | "dark" } = {}) {
  const dark = tone === "dark";
  // Cream-on-dark styling, shared by the overlay and dark tones.
  const overlay = tone !== "light";
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileVendorsOpen, setMobileVendorsOpen] = useState(false);
  const { session, profile, ownListing, hasVendorAccess, signOut } = useAuth();
  const { t } = useTranslation();
  const { t: ts } = useTranslation("shell");
  const categoryNames = useCategoryNames();
  const secondaryLinks = buildSecondaryLinks(t);

  // Sort categories alphabetically by display name (in the visitor's
  // language). comingSoon items sort to the bottom so the live ones are
  // scanned first.
  const sortedCategories = Object.entries(categoryConfig)
    .map(([slug, cfg]) => ({ slug, ...cfg, display: categoryNames.group(slug, cfg.display) }))
    .sort((a, b) => {
      if (!!a.comingSoon !== !!b.comingSoon) return a.comingSoon ? 1 : -1;
      return a.display.localeCompare(b.display);
    });

  // Multi-role: send the user to whichever portal they're more likely to
  // want. Vendor access → /vendor/me (the vendor landing surface; the
  // separate Home page was removed). Otherwise → /customer/explore.
  const dashLabel = dashboardLabel(t);
  const dashPath = hasVendorAccess ? "/vendor/me" : "/customer/explore";

  const linkClass = (active: boolean) =>
    overlay
      ? `relative transition-colors duration-200 ${
          active
            ? "text-white after:absolute after:-bottom-2 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-gold"
            : "text-[#f4f1ea]/85 hover:text-white"
        }`
      : `transition-colors duration-200 ${
          active ? "text-foreground" : "text-muted-foreground hover:text-accent"
        }`;

  return (
    <nav
      className={
        dark
          ? "sticky top-0 z-50 border-b border-white/10 bg-[#14161a]/95 backdrop-blur-md"
          : overlay
            ? "relative z-20"
            : "fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
      }
      style={
        overlay
          ? undefined
          : {
              background: "rgba(255,255,255,0.6)",
              borderBottom: "0.5px solid rgba(0,0,0,0.12)",
            }
      }
      aria-label={ts("nav.aria_label")}
    >
      {/* One height and one logo in every tone, so the logo sits in the
          same spot on every page: the full lockup, 20px down on phones and
          28px from tablet up, at the page container's edge. The sign-in
          pages' AuthTopBar matches it. */}
      <div className="container mx-auto flex h-20 items-center justify-between px-5 md:h-24 md:px-8">
        <Link to="/" aria-label={ts("nav.logo_label")}>
          <VendoraLogo size="md" color={overlay ? CREAM : "#000"} withTagline />
        </Link>

        {/* Desktop nav, from 1024px: below that the full logo plus the
            links and buttons don't fit (in Spanish they need about 860px),
            so tablets get the menu button like phones. */}
        <div className="hidden lg:flex items-center gap-8">
          {/* Vendors → dropdown of all categories */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`inline-flex items-center gap-1 text-sm font-medium outline-none ${linkClass(
                  location.pathname.startsWith("/vendors"),
                )}`}
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
                  {ts("nav.all_vendors")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/vendors/locations" className="cursor-pointer">
                  {ts("nav.browse_by_location")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {ts("nav.categories")}
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
                      {ts("nav.soon")}
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
                  : "text-muted-foreground hover:text-accent"
              }`}
              aria-current={location.pathname === item.path ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}

          {/* Explore — public, read-only global feed of approved
              vendor activity. */}
          <Link
            to="/explore"
            className={`text-sm font-medium ${linkClass(location.pathname === "/explore")}`}
            aria-current={location.pathname === "/explore" ? "page" : undefined}
          >
            {ts("nav.explore")}
          </Link>
          <Link
            to="/how-it-works"
            className={`text-sm font-medium ${linkClass(
              location.pathname === "/how-it-works",
            )}`}
            aria-current={location.pathname === "/how-it-works" ? "page" : undefined}
          >
            {ts("nav.how_it_works")}
          </Link>
        </div>

        <div className="hidden lg:flex items-center gap-1">
          {session && profile ? (
            <>
              <NotificationBell variant={overlay ? "dark" : "light"} />
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
                  ts("nav.account");
                return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`ml-2 flex items-center gap-2 text-sm font-medium transition-colors ${
                      overlay
                        ? "text-[#f4f1ea]/85 hover:text-white"
                        : "text-muted-foreground hover:text-accent"
                    }`}
                  >
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
          ) : overlay ? (
            <div className="flex items-center gap-3 text-[13px]">
              <Link
                to="/login"
                className="inline-flex h-9 items-center whitespace-nowrap rounded-full px-4 font-bold transition-colors hover:bg-white/10"
                style={{ color: CREAM, border: "1px solid rgba(244,241,234,0.35)" }}
              >
                {t("nav.login")}
              </Link>
              <Link
                to="/signup"
                className="inline-flex h-9 items-center whitespace-nowrap rounded-full bg-gold px-4 font-bold text-foreground transition-colors hover:bg-gold-hover"
              >
                {t("nav.signup")}
              </Link>
            </div>
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
        </div>

        {/* Mobile toggle */}
        <button
          className={`lg:hidden p-2 ${overlay ? "text-[#f4f1ea]" : "text-foreground"}`}
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
          className={
            overlay
              ? "lg:hidden mx-5 mb-4 rounded-3xl bg-background px-4 pb-4 shadow-lifted md:mx-8"
              : "lg:hidden bg-background border-b border-border px-4 pb-4"
          }
        >
          {/* Vendors expandable section */}
          <button
            type="button"
            onClick={() => setMobileVendorsOpen((x) => !x)}
            className="flex items-center justify-between w-full py-3 text-sm font-medium text-muted-foreground hover:text-accent"
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
                {ts("nav.all_vendors")}
              </Link>
              <Link
                to="/vendors/locations"
                onClick={() => setMobileOpen(false)}
                className="block py-2 text-sm text-muted-foreground"
              >
                {ts("nav.by_location")}
              </Link>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-3 mb-1">
                {ts("nav.categories")}
              </p>
              {sortedCategories.map((c) =>
                c.comingSoon ? (
                  <p
                    key={c.slug}
                    className="block py-2 text-sm text-muted-foreground/60"
                  >
                    {c.display}{" "}
                    <span className="text-[10px] uppercase tracking-wide bg-secondary rounded-full px-1.5 py-0.5 ml-1">
                      {ts("nav.soon")}
                    </span>
                  </p>
                ) : (
                  <Link
                    key={c.slug}
                    to={`/vendors/category/${c.slug}`}
                    onClick={() => setMobileOpen(false)}
                    className="block py-2 text-sm text-muted-foreground hover:text-accent"
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
              className="block py-3 text-sm font-medium text-muted-foreground hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
          <Link
            to="/explore"
            onClick={() => setMobileOpen(false)}
            className="block py-3 text-sm font-medium text-muted-foreground hover:text-accent"
          >
            {ts("nav.explore")}
          </Link>
          <Link
            to="/how-it-works"
            onClick={() => setMobileOpen(false)}
            className="block py-3 text-sm font-medium text-muted-foreground hover:text-accent"
          >
            {ts("nav.how_it_works")}
          </Link>
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
                {ts("nav.sign_out")}
              </button>
            </>
          ) : (
            <div className="flex gap-3 pt-3 border-t border-border mt-2">
              <Link to="/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" className="w-full" size="sm">
                  {ts("nav.sign_in")}
                </Button>
              </Link>
              <Link to="/signup" className="flex-1" onClick={() => setMobileOpen(false)}>
                <Button className="w-full" size="sm">
                  {ts("nav.get_started")}
                </Button>
              </Link>
            </div>
          )}
        </motion.div>
      )}
    </nav>
  );
}
