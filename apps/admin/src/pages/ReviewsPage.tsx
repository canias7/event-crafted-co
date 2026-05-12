import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type Review = {
  id: string;
  vendor_id: string;
  host_id: string;
  rating: number;
  body: string | null;
  is_hidden: boolean;
  created_at: string;
  vendor_name?: string | null;
};

export function ReviewsPage() {
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("reviews")
      .select(
        "id, vendor_id, host_id, rating, body, is_hidden, created_at, vendor:vendor_profiles!inner(business_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (!showHidden) q = q.eq("is_hidden", false);
    const { data, error } = await q;
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows(
      (data ?? []).map((r) => {
        const vendor = (r as unknown as {
          vendor?: { business_name: string } | { business_name: string }[];
        }).vendor;
        const business_name = Array.isArray(vendor)
          ? vendor[0]?.business_name ?? null
          : vendor?.business_name ?? null;
        return {
          id: r.id,
          vendor_id: r.vendor_id,
          host_id: r.host_id,
          rating: r.rating,
          body: r.body,
          is_hidden: r.is_hidden,
          created_at: r.created_at,
          vendor_name: business_name,
        };
      }),
    );
  }, [showHidden]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleHide = async (row: Review) => {
    const next = !row.is_hidden;
    const { error } = await supabase
      .from("reviews")
      .update({ is_hidden: next })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Hide / restore is a content-moderation action — must land in
    // the admin audit log for compliance / dispute review.
    void supabase.rpc("log_admin_action", {
      p_action: next ? "review_hide" : "review_restore",
      p_target_type: "review",
      p_target_id: row.id,
      p_summary: `${next ? "Hid" : "Restored"} review ${row.id}`,
      p_metadata: { vendor_id: row.vendor_id, rating: row.rating },
    });
    toast.success(next ? "Hidden" : "Restored");
    setRows((p) =>
      p.map((r) => (r.id === row.id ? { ...r, is_hidden: next } : r)),
    );
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reviews</h1>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Show hidden
        </label>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-ink/60">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink/60">No reviews.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`rounded-lg border bg-white p-4 ${
                r.is_hidden ? "border-red-200 opacity-70" : "border-ink/10"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{r.vendor_name ?? "—"}</span>
                    <span className="ml-2 text-xs text-ink/60">
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)}
                    </span>
                  </p>
                  {r.body ? (
                    <p className="mt-2 text-sm text-ink/80">{r.body}</p>
                  ) : (
                    <p className="mt-2 text-sm italic text-ink/40">
                      No written review.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-ink/50">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => toggleHide(r)}
                  className="shrink-0 text-xs underline-offset-2 hover:underline"
                >
                  {r.is_hidden ? "Restore" : "Hide"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
