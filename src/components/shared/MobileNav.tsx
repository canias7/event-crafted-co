import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { LogOut, type LucideIcon, MoreHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getBottomNav } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";

interface NavItem {
  labelKey: string;
  path: string;
  icon: LucideIcon;
}

interface MobileNavProps {
  items: NavItem[];
}

// Mobile bottom nav. Surfaces the four most-used items plus a "More"
// button that opens a drawer with the rest of the nav, the bottom
// utility items (Support / Settings), and a logout. Keeps everything
// reachable from a phone — without the drawer, mobile users can't
// get to anything past the first 4 sidebar entries.
export function MobileNav({ items }: MobileNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Inbox is reachable from the floating chat-bubble at top-right of
  // the dashboard (MobilePortalBell), so it's pulled out of the
  // primary 4-tile bottom row to make room for higher-traffic
  // destinations. It still appears in the More drawer for users who
  // navigate there from a non-dashboard page.
  const isInbox = (path: string) =>
    path === "/vendor/inbox" ||
    path === "/customer/inquiries" ||
    path === "/admin/inquiries";
  const primaryItems = items.filter((it) => !isInbox(it.path)).slice(0, 4);
  const overflowItems = items.filter(
    (it) => !primaryItems.some((p) => p.path === it.path),
  );
  const bottomItems = getBottomNav(items) ?? [];

  async function handleLogout() {
    setDrawerOpen(false);
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border px-2 pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile primary"
    >
      <div className="flex items-center justify-around h-16">
        {primaryItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            location.pathname.startsWith(`${item.path}/`);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 px-2 py-1 text-xs transition-colors ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              <span className="font-medium">{t(item.labelKey)}</span>
            </Link>
          );
        })}

        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex flex-col items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label="More navigation"
            >
              <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
              <span className="font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl max-h-[85vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
          >
            <SheetHeader className="text-left mb-2">
              <SheetTitle className="font-display text-lg">More</SheetTitle>
            </SheetHeader>
            {overflowItems.length > 0 && (
              <div className="grid grid-cols-2 gap-2 py-2">
                {overflowItems.map((item) => {
                  const isActive =
                    location.pathname === item.path ||
                    location.pathname.startsWith(`${item.path}/`);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setDrawerOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <item.icon className="w-4 h-4" aria-hidden="true" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            )}
            {bottomItems.length > 0 && (
              <div className="pt-3 mt-3 border-t border-border space-y-1">
                {bottomItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    <item.icon className="w-4 h-4" aria-hidden="true" />
                    <span className="truncate">{t(item.labelKey)}</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="pt-3 mt-3 border-t border-border">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" aria-hidden />
                <span>{t("nav.logout")}</span>
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
