import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { LucideIcon } from "lucide-react";

interface NavItem {
  labelKey: string;
  path: string;
  icon: LucideIcon;
}

interface MobileNavProps {
  items: NavItem[];
}

export function MobileNav({ items }: MobileNavProps) {
  const location = useLocation();
  const { t } = useTranslation();
  const visibleItems = items.slice(0, 5);

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border px-2 pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile primary"
    >
      <div className="flex items-center justify-around h-16">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path;
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
      </div>
    </nav>
  );
}
