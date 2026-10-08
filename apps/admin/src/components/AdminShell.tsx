import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileCheck2,
  LayoutDashboard,
  Mail,
  ShieldCheck,
  Star,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const NAV: Array<{
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/applications", label: "Vendor applications", icon: FileCheck2 },
  { to: "/users", label: "Users", icon: Users },
  { to: "/listings", label: "Vendor listings", icon: Store },
  { to: "/verifications", label: "Verifications", icon: ShieldCheck },
  { to: "/reviews", label: "Reviews", icon: Star },
  { to: "/costs", label: "Costs", icon: DollarSign },
  { to: "/emails", label: "Emails", icon: Mail },
  { to: "/workspace", label: "Workspace", icon: Briefcase },
];

const STORAGE_KEY = "vendora-admin-sidebar-collapsed";

export function AdminShell() {
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="flex min-h-screen">
      <aside
        className={`flex flex-col border-r border-ink/10 bg-white transition-[width] duration-200 ${
          collapsed ? "w-14" : "w-56"
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink/10 p-4">
          {!collapsed ? (
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-ink/50">
                Vendora
              </p>
              <p className="text-sm font-semibold">Admin</p>
            </div>
          ) : null}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
            className="rounded p-1 text-ink/60 hover:bg-ink/5"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded px-3 py-2 text-sm ${
                    isActive
                      ? "bg-ink text-bone"
                      : "text-ink/70 hover:bg-ink/5"
                  } ${collapsed ? "justify-center px-2" : ""}`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-ink/10 p-3">
          {!collapsed ? (
            <>
              <p className="truncate text-xs text-ink/60">
                {profile?.display_name ?? "admin"}
              </p>
              <button
                onClick={signOut}
                className="mt-1 text-xs text-ink/60 underline-offset-2 hover:underline"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={signOut}
              title="Sign out"
              className="block w-full rounded px-2 py-1 text-center text-[10px] text-ink/50 hover:bg-ink/5"
            >
              Out
            </button>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-bone">
        <Outlet />
      </main>
    </div>
  );
}
