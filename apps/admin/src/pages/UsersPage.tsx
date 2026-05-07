import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type UserRow = {
  id: string;
  display_name: string | null;
  role: "host" | "vendor" | "admin";
  suspended_at: string | null;
  created_at: string;
};

const ROLES: Array<UserRow["role"]> = ["host", "vendor", "admin"];

export function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, role, suspended_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as UserRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setRole = async (id: string, role: UserRow["role"]) => {
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Role set to ${role}`);
    setRows((p) => p.map((r) => (r.id === id ? { ...r, role } : r)));
  };

  const toggleSuspend = async (row: UserRow) => {
    const next = row.suspended_at ? null : new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({ suspended_at: next })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next ? "Suspended" : "Unsuspended");
    setRows((p) =>
      p.map((r) => (r.id === row.id ? { ...r, suspended_at: next } : r)),
    );
  };

  const filtered = rows.filter((r) =>
    !filter
      ? true
      : (r.display_name ?? "").toLowerCase().includes(filter.toLowerCase()) ||
        r.id.includes(filter),
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Users</h1>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name or id"
        className="mt-4 w-full max-w-sm rounded border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold"
      />

      {loading ? (
        <p className="mt-6 text-sm text-ink/60">Loading…</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-left text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Joined</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-ink/10">
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      {r.display_name ?? "—"}
                    </div>
                    <div className="font-mono text-[11px] text-ink/40">
                      {r.id.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={r.role}
                      onChange={(e) =>
                        setRole(r.id, e.target.value as UserRow["role"])
                      }
                      className="rounded border border-ink/15 bg-white px-2 py-1 text-xs"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {r.suspended_at ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                        Suspended
                      </span>
                    ) : (
                      <span className="text-xs text-ink/60">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-ink/60">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => toggleSuspend(r)}
                      className="text-xs underline-offset-2 hover:underline"
                    >
                      {r.suspended_at ? "Unsuspend" : "Suspend"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-ink/60"
                  >
                    No users.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
