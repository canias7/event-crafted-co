// Shared sub-nav strip for the business operations cluster:
// My Vendora (leads), Calendar (appointments), VendoraPay (payments).
// Rendered at the top of all three pages so the vendor can flip
// between them in one click — they're really three views of the
// same "running my business" surface.

import { useLocation, Link } from "react-router-dom";
import { CalendarDays, CreditCard, Users, type LucideIcon } from "lucide-react";

interface SubNavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  matchPaths: string[];
}

const ITEMS: SubNavItem[] = [
  {
    id: "leads",
    label: "My Vendora",
    path: "/vendor/leads",
    icon: Users,
    matchPaths: ["/vendor/leads"],
  },
  {
    id: "calendar",
    label: "Calendar",
    path: "/vendor/appointments",
    icon: CalendarDays,
    matchPaths: ["/vendor/appointments"],
  },
  {
    id: "vendorapay",
    label: "VendoraPay",
    path: "/vendor/payments",
    icon: CreditCard,
    matchPaths: ["/vendor/payments", "/vendor/integrations"],
  },
];

export function BusinessSubNav() {
  const { pathname } = useLocation();
  return (
    <nav className="flex gap-1 overflow-x-auto -mb-px">
      {ITEMS.map((item) => {
        const active = item.matchPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            to={item.path}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
