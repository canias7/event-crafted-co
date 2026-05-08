import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type Listing = {
  id: string;
  business_name: string;
  category: string;
  location: string | null;
  application_status: "pending" | "approved" | "rejected";
  verified_at: string | null;
  created_at: string;
};

export function ListingsPage() {
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vendor_profiles")
      .select(
        "id, business_name, category, location, application_status, verified_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as Listing[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleVerify = async (row: Listing) => {
    const next = row.verified_at ? null : new Date().toISOString();
    const { error } = await supabase
      .from("vendor_profiles")
      .update({ verified_at: next })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next ? "Verified" : "Unverified");
    setRows((p) =>
      p.map((r) => (r.id === row.id ? { ...r, verified_at: next } : r)),
    );
  };

  const remove = async (row: Listing) => {
    if (!confirm(`Delete ${row.business_name}? This cannot be undone.`)) return;
    const { error } = await supabase
      .from("vendor_profiles")
      .delete()
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Listing deleted");
    setRows((p) => p.filter((r) => r.id !== row.id));
  };

  const setStatus = async (
    row: Listing,
    status: Listing["application_status"],
  ) => {
    const { error } = await supabase
      .from("vendor_profiles")
      .update({
        application_status: status,
        application_reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (status === "approved" || status === "rejected") {
      supabase.functions
        .invoke("send-transactional-email", {
          body: {
            kind: status === "approved" ? "vendor_approved" : "vendor_rejected",
            vendorProfileId: row.id,
          },
        })
        .then(({ error: emailErr }) => {
          if (emailErr) {
            toast.error(`Decision saved, but email failed: ${emailErr.message}`);
          }
        });
    }
    toast.success(`Marked ${status} — email sent`);
    setRows((p) =>
      p.map((r) => (r.id === row.id ? { ...r, application_status: status } : r)),
    );
  };

  const filtered = rows.filter((r) =>
    !filter
      ? true
      : r.business_name.toLowerCase().includes(filter.toLowerCase()) ||
        r.category.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Vendor listings</h1>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by business name or category"
        className="mt-4 w-full max-w-sm rounded border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold"
      />

      {loading ? (
        <p className="mt-6 text-sm text-ink/60">Loading…</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-left text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-2">Business</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Verified</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-ink/10">
                  <td className="px-4 py-2 font-medium">{r.business_name}</td>
                  <td className="px-4 py-2 text-xs text-ink/70">{r.category}</td>
                  <td className="px-4 py-2 text-xs text-ink/60">
                    {r.location ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs capitalize">
                    {r.application_status}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.verified_at ? "✓" : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.application_status === "pending" ? (
                      <>
                        <button
                          onClick={() => setStatus(r, "approved")}
                          className="text-xs text-green-700 underline-offset-2 hover:underline"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setStatus(r, "rejected")}
                          className="ml-3 text-xs text-red-700 underline-offset-2 hover:underline"
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
                    <button
                      onClick={() => toggleVerify(r)}
                      className="ml-3 text-xs underline-offset-2 hover:underline"
                    >
                      {r.verified_at ? "Unverify" : "Verify"}
                    </button>
                    <button
                      onClick={() => remove(r)}
                      className="ml-3 text-xs text-red-700 underline-offset-2 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-ink/60"
                  >
                    No listings.
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
