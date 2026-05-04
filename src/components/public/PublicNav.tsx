import { useLocation } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { motion } from "framer-motion";
import { Menu, X, LogOut, LayoutDashboard, ChevronDown, Settings, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";

function buildLinks(t: (key: string) => string) {
  return [
    { label: t("nav.vendors"), path: "/vendors" },
    { label: t("nav.real_events"), path: "/real-events" },
    { label: t("nav.inspiration"), path: "/inspiration" },
    { label: t("nav.how_it_works"), path: "/how-it-works" },
    { label: t("nav.for_vendors"), path: "/vendor-apply" },
  ];
}

function dashboardPath(role?: string) {
  if (role === "vendor") return "/vendor/dashboard";
  if (role === "admin") return "/admin/dashboard";
  return "/customer/dashboard";
}

function dashboardLabel(role?: string, t?: (key: string) => string) {
  // Translation is best-effort — if no t passed (legacy), fall back.
  const label = t ? t("nav.dashboard") : "My dashboard";
  if (role === "vendor") return label;
  if (role === "admin") return label;
  return label;
}

export function PublicNav() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { session, profile, signOut } = useAuth();
  const { t } = useTranslation();
  const baseLinks = buildLinks(t);

  const dashLabel = dashboardLabel(profile?.role, t);
  const dashPath = dashboardPath(profile?.role);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-foreground/80 via-foreground/40 to-transparent backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between h-16 px-4 md:px-8">
        <Link to="/" className="font-display text-xl tracking-tight text-background">
          Vendora
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {baseLinks.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`text-sm font-medium transition-colors duration-200 ${
                location.pathname === item.path
                  ? "text-background"
                  : "text-background/70 hover:text-background"
              }`}
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
            className="hidden lg:inline-flex items-center gap-2 px-3 h-8 rounded-full bg-background/10 hover:bg-background/20 text-background/85 hover:text-background text-xs transition-colors mr-2"
            aria-label="Open search"
          >
            <Search className="w-3.5 h-3.5" />
            Search
            <kbd className="hidden xl:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-background/15 text-[10px] font-mono">
              ⌘K
            </kbd>
          </button>
          {session && profile ? (
            <>
              <NotificationBell variant="dark" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-2 flex items-center gap-2 text-sm font-medium text-background/85 hover:text-background transition-colors">
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
                  className="h-9 text-background hover:bg-background/10 hover:text-background"
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
          <LanguageSwitcher tone="dark" />
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-background"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? t("nav.close_menu") : t("nav.open_menu")}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-background border-b border-border px-4 pb-4"
        >
          {baseLinks.map((item) => (
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
