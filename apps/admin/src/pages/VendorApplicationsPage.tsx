// Vendor APPLICATION review queue.
//
// Different from the Vendor LISTINGS tab: this page reviews the
// vendor account itself, not their marketplace listing. A new
// vendor signup lands in profiles with role='vendor' and
// application_status='pending'. Admin Approves → status flips to
// 'approved' and the vendor can sign in to the vendor app.
//
// The listing (vendor_profiles row) doesn't exist yet at this
// point — it gets created the first time the approved vendor
// taps Create listing in the profile tab. Listing approval lives
// on the separate Vendor listings page.

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type ApplicationStatus = "pending" | "approved" | "rejected";

type Application = {
  id: string;
  display_name: string | null;
  application_status: ApplicationStatus;
  email: string | null;
  business_name: string | null;
  category: string | null;
};

const TABS: ApplicationStatus[] = ["pending", "approved", "rejected"];

export function VendorApplicationsPage() {
  const [tab, setTab] = useState<ApplicationStatus>("pending");
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Pull everyone whose role is 'vendor' (intent set at signup) and
    // whose application is at the requested status. business_name +
    // category are pulled from auth metadata via the security-definer
    // RPC below so we can show the admin what they were planning to
    // list.
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .rpc<any, any>("admin_list_vendor_applications", { p_status: tab });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows(((data ?? []) as Application[]) ?? []);
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: ApplicationStatus) => {
    const target = rows.find((r) => r.id === id);
    const { error } = await supabase
      .from("profiles")
      .update({ application_status: status })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void supabase.rpc("log_admin_action", {
      p_action: `vendor_application_${status}`,
      p_target_type: "user",
      p_target_id: id,
      p_summary: `Vendor application ${status} for ${target?.business_name ?? target?.email ?? id}`,
      p_metadata: {
        previous: target?.application_status,
        email: target?.email,
        business_name: target?.business_name,
        category: target?.category,
      },
    });
    if (status === "approved" || status === "rejected") {
      // Reuse the existing vendor_approved / vendor_rejected
      // transactional templates. They expect a vendorProfileId
      // historically; here we pass the user_id so the function
      // can look up the email directly.
      supabase.functions
        .invoke("send-transactional-email", {
          body: {
            kind: status === "approved" ? "vendor_approved" : "vendor_rejected",
            userId: id,
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

  const removeAccount = async (id: string, name: string | null) => {
    const target = rows.find((r) => r.id === id);
    if (
      !window.confirm(
        `Delete ${name ?? "this vendor"}'s account? This permanently removes the auth user, profile, and any listing data. This cannot be undone.`,
      )
    ) {
      return;
    }
    // We can't delete from auth.users via the standard client — go
    // through the admin RPC that wraps it.
    const { error } = await supabase.rpc("admin_delete_user", {
      p_user_id: id,
    });
    if (error) {
      toast.error(`Couldn't delete: ${error.message}`);
      return;
    }
    void supabase.rpc("log_admin_action", {
      p_action: "vendor_account_delete",
      p_target_type: "user",
      p_target_id: id,
      p_summary: `Deleted vendor account ${name ?? target?.email ?? id}`,
      p_metadata: {
        email: target?.email,
        business_name: target?.business_name,
        was_status: target?.application_status,
      },
    });
    toast.success(`Deleted ${name ?? "vendor"}`);
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
                  <p className="font-semibold">
                    {r.business_name ?? r.display_name ?? "(no name)"}
                  </p>
                  <p className="text-xs text-ink/60">
                    {r.category ?? "—"}
                    {r.email ? ` · ${r.email}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.application_status === "pending" ? (
                    <>
                      <button
                        onClick={() => setStatus(r.id, "approved")}
                        className="rounded bg-ink px-3 py-1.5 text-xs text-bone"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setStatus(r.id, "rejected")}
                        className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  {r.application_status === "approved" ? (
                    <button
                      onClick={() => removeAccount(r.id, r.business_name)}
                      title="Delete this vendor account"
                      className="inline-flex items-center gap-1.5 rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  ) : null}
                  {r.application_status === "rejected" ? (
                    <>
                      <button
                        onClick={() => setStatus(r.id, "approved")}
                        className="rounded bg-ink px-3 py-1.5 text-xs text-bone"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => removeAccount(r.id, r.business_name)}
                        title="Delete this vendor account"
                        className="inline-flex items-center gap-1.5 rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </>
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
