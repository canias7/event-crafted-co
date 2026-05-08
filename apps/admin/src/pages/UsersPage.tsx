import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: "host" | "vendor" | "admin";
  suspended_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

export function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_users");
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

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await supabase.rpc("admin_delete_user", {
      p_user_id: pendingDelete.id,
    });
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account deleted");
    setRows((p) => p.filter((r) => r.id !== pendingDelete.id));
    setPendingDelete(null);
  };

  // What the deletion will sweep up. Computed from the role label as a
  // best-effort hint; the actual cascade is enforced by the database.
  const deleteImpact = (row: UserRow) =>
    row.role === "vendor"
      ? "their vendor profile, listings, portfolio, inquiries, reviews, and team data"
      : row.role === "admin"
        ? "their admin profile and any data they own"
        : "their profile, inquiries, mood boards, saved vendors, and event data";

  const filtered = rows.filter((r) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (r.display_name ?? "").toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      r.id.includes(filter)
    );
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 text-sm text-ink/60">
        {rows.length} total. Delete to permanently remove the account and free
        up the email.
      </p>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name, email, or id"
        className="mt-4 w-full max-w-sm rounded border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold"
      />

      {loading ? (
        <p className="mt-6 text-sm text-ink/60">Loading…</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-left text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-2">Name / Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Joined</th>
                <th className="px-4 py-2">Last sign-in</th>
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
                    <div className="text-xs text-ink/60">{r.email ?? "—"}</div>
                    <div className="font-mono text-[11px] text-ink/40">
                      {r.id.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs capitalize text-ink/70">
                    {r.role}
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
                  <td className="px-4 py-2 text-xs text-ink/60">
                    {r.last_sign_in_at
                      ? new Date(r.last_sign_in_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => toggleSuspend(r)}
                        className="text-xs text-ink/70 underline-offset-2 hover:underline"
                      >
                        {r.suspended_at ? "Unsuspend" : "Suspend"}
                      </button>
                      <button
                        onClick={() => setPendingDelete(r)}
                        className="text-xs text-red-700 underline-offset-2 hover:underline"
                      >
                        Delete account
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Delete this account?</h2>
            <p className="mt-2 text-sm text-ink/70">
              <strong>{pendingDelete.display_name ?? pendingDelete.email}</strong>{" "}
              will be permanently removed, along with {deleteImpact(pendingDelete)}.
            </p>
            <p className="mt-2 text-xs text-ink/60">
              The email{" "}
              <span className="font-mono">{pendingDelete.email}</span> will be
              free to sign up again from scratch. This can't be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="rounded border border-ink/15 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
