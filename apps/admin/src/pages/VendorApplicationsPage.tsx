import { useCallback, useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const PUBLIC_SITE = "https://eventvendora.com";

type Application = {
  id: string;
  user_id: string;
  business_name: string;
  category: string;
  bio: string | null;
  location: string | null;
  application_status: "pending" | "approved" | "rejected";
  created_at: string;
  profile_email?: string | null;
  profile_display_name?: string | null;
};

const TABS: Array<Application["application_status"]> = ["pending", "approved", "rejected"];

export function VendorApplicationsPage() {
  const [tab, setTab] = useState<Application["application_status"]>("pending");
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vendor_profiles")
      .select(
        "id, user_id, business_name, category, bio, location, application_status, created_at, profile:profiles!vendor_profiles_user_id_fkey(display_name)",
      )
      .eq("application_status", tab)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows(
      (data ?? []).map((r) => {
        const profile = (r as unknown as {
          profile?: { display_name: string | null } | { display_name: string | null }[];
        }).profile;
        const display_name = Array.isArray(profile)
          ? profile[0]?.display_name ?? null
          : profile?.display_name ?? null;
        return {
          id: r.id,
          user_id: r.user_id,
          business_name: r.business_name,
          category: r.category,
          bio: r.bio,
          location: r.location,
          application_status: r.application_status,
          created_at: r.created_at,
          profile_display_name: display_name,
        };
      }),
    );
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (
    id: string,
    status: Application["application_status"],
  ) => {
    const { error } = await supabase
      .from("vendor_profiles")
      .update({
        application_status: status,
        application_reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (status === "approved" || status === "rejected") {
      // Applications tab handles the INITIAL signup decision.
      // Subsequent re-publishes are reviewed on Vendor listings tab
      // and use the listing_* email templates.
      supabase.functions
        .invoke("send-transactional-email", {
          body: {
            kind: status === "approved" ? "vendor_approved" : "vendor_rejected",
            vendorProfileId: id,
          },
        })
        .then(({ error: emailErr }) => {
          if (emailErr) {
            toast.error(`Decision saved, but email failed: ${emailErr.message}`);
          }
        });
    }
    toast.success(`Marked ${status} — applicant emailed`);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Vendor applications</h1>
      <div className="mt-4 flex gap-1 border-b border-ink/10">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm capitalize ${
              tab === t
                ? "border-b-2 border-ink font-medium text-ink"
                : "text-ink/60 hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-ink/60">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink/60">No {tab} applications.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-ink/10 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold">{r.business_name}</p>
                  <p className="text-xs text-ink/60">
                    {r.category}
                    {r.location ? ` · ${r.location}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-ink/50">
                    Applicant: {r.profile_display_name ?? r.user_id}
                  </p>
                  {r.bio ? (
                    <p className="mt-3 text-sm text-ink/80">{r.bio}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={`${PUBLIC_SITE}/vendors/${r.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View public listing"
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-ink/10 text-ink/70 hover:border-ink/30 hover:text-ink"
                    aria-label="View listing"
                  >
                    <Eye className="h-4 w-4" />
                  </a>
                  {r.application_status !== "approved" ? (
                    <button
                      onClick={() => setStatus(r.id, "approved")}
                      className="rounded bg-ink px-3 py-1.5 text-xs text-bone"
                    >
                      Approve
                    </button>
                  ) : null}
                  {r.application_status !== "rejected" ? (
                    <button
                      onClick={() => setStatus(r.id, "rejected")}
                      className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                    >
                      Reject
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
