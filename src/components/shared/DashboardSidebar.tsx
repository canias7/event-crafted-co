import { useLocation } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { LucideIcon, Search } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

interface DashboardSidebarProps {
  items: NavItem[];
  title: string;
  backPath?: string;
}

export function DashboardSidebar({ items, title, backPath = "/" }: DashboardSidebarProps) {
  const location = useLocation();

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card min-h-screen sticky top-0">
      <div className="p-6 border-b border-border flex items-start justify-between gap-3">
        <div>
          <Link to={backPath} className="font-display text-lg">
            Vendora
          </Link>
          <p className="font-label text-muted-foreground mt-1">{title}</p>
        </div>
        <NotificationBell variant="light" />
      </div>
      <div className="px-3 pt-3">
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
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground bg-secondary/40 hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border">
            ⌘K
          </kbd>
        </button>
      </div>
      <nav className="flex-1 p-3">
        {items.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className="relative block"
            >
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  isActive
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
