import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/applications", label: "Vendor applications" },
  { to: "/users", label: "Users" },
  { to: "/listings", label: "Vendor listings" },
  { to: "/reviews", label: "Reviews" },
];

export function AdminShell() {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-ink/10 bg-white">
        <div className="border-b border-ink/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-ink/50">Vendora</p>
          <p className="text-sm font-semibold">Admin</p>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm ${
                  isActive
                    ? "bg-ink text-bone"
                    : "text-ink/70 hover:bg-ink/5"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink/10 p-3">
          <p className="truncate text-xs text-ink/60">
            {profile?.display_name ?? "admin"}
          </p>
          <button
            onClick={signOut}
            className="mt-1 text-xs text-ink/60 underline-offset-2 hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-bone">
        <Outlet />
      </main>
    </div>
  );
}
