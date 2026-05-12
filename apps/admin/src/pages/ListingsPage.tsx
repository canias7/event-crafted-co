import { useCallback, useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const PUBLIC_SITE = "https://eventvendora.com";

type Listing = {
  id: string;
  business_name: string;
  category: string | null;
  bio: string | null;
  location: string | null;
  base_price_cents: number | null;
  application_status: "pending" | "approved" | "rejected";
  verified_at: string | null;
  created_at: string;
};

export function ListingsPage() {
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Listing | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vendor_profiles")
      .select(
        "id, business_name, category, bio, location, base_price_cents, application_status, verified_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Listings tab is the canonical surface for publish-ready
    // submissions: vendors who completed all four required fields
    // (category, bio, location, starting price) and hit Publish.
    // Incomplete pending rows belong on the Vendor applications tab.
    // Approved rows always appear here regardless of completeness so
    // an admin can still revoke / verify / delete them.
    const isPublishReady = (r: Listing) =>
      !!r.category &&
      !!r.bio &&
      !!r.location &&
      r.base_price_cents != null &&
      r.base_price_cents > 0;
    setRows(
      ((data ?? []) as Listing[]).filter(
        (r) =>
          r.application_status === "approved" ||
          (r.application_status === "pending" && isPublishReady(r)) ||
          // Rejected rows can sit in either bucket; show them here so
          // the admin can re-approve once the listing is fixed.
          r.application_status === "rejected",
      ),
    );
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
    void supabase.rpc("log_admin_action", {
      p_action: next ? "listing_verify" : "listing_unverify",
      p_target_type: "vendor_profile",
      p_target_id: row.id,
      p_summary: `${next ? "Verified" : "Unverified"} listing ${row.business_name}`,
      p_metadata: { category: row.category },
    });
    toast.success(next ? "Verified" : "Unverified");
    setRows((p) =>
      p.map((r) => (r.id === row.id ? { ...r, verified_at: next } : r)),
    );
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const target = pendingDelete;
    const { error } = await supabase
      .from("vendor_profiles")
      .delete()
      .eq("id", target.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    void supabase.rpc("log_admin_action", {
      p_action: "listing_delete",
      p_target_type: "vendor_profile",
      p_target_id: target.id,
      p_summary: `Deleted listing ${target.business_name}`,
      p_metadata: {
        category: target.category,
        location: target.location,
        was_status: target.application_status,
      },
    });
    toast.success("Listing deleted");
    setRows((p) => p.filter((r) => r.id !== target.id));
    setPendingDelete(null);
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
    void supabase.rpc("log_admin_action", {
      p_action: `listing_${status}`,
      p_target_type: "vendor_profile",
      p_target_id: row.id,
      p_summary: `Marked ${row.business_name} ${status}`,
      p_metadata: { previous: row.application_status },
    });
    if (status === "approved" || status === "rejected") {
      // Listings tab handles RE-PUBLISH decisions (vendor edited and
      // hit Publish on an already-approved listing). Different copy
      // than the initial vendor_* templates used on Applications tab.
      supabase.functions
        .invoke("send-transactional-email", {
          body: {
            kind: status === "approved" ? "listing_approved" : "listing_rejected",
            vendorProfileId: row.id,
          },
        })
        .then(({ error: emailErr }) => {
          if (emailErr) {
            toast.error(`Decision saved, but email failed: ${emailErr.message}`);
          }
        });
    }
    toast.success(`Marked ${status} — vendor emailed`);
    setRows((p) =>
      p.map((r) => (r.id === row.id ? { ...r, application_status: status } : r)),
    );
  };

  const filtered = rows.filter((r) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      r.business_name.toLowerCase().includes(q) ||
      (r.category?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Vendor listings</h1>
      {rows.length === 500 ? (
        <p className="mt-2 text-xs text-amber-700">
          Showing first 500 listings. Filter to narrow results — older rows are
          truncated.
        </p>
      ) : null}
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
                    <a
                      href={`${PUBLIC_SITE}/vendors/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View public listing"
                      className="mr-3 inline-flex items-center text-ink/70 hover:text-ink"
                      aria-label="View listing"
                    >
                      <Eye className="h-4 w-4" />
                    </a>
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
                      onClick={() => setPendingDelete(r)}
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

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Delete this listing?</h2>
            <p className="mt-2 text-sm text-ink/70">
              <strong>{pendingDelete.business_name}</strong> will be permanently
              removed, along with its photos, packages, FAQs, inquiries, and
              reviews. The vendor account itself stays.
            </p>
            <p className="mt-2 text-xs text-ink/60">This can't be undone.</p>
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
                {deleting ? "Deleting…" : "Delete listing"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
