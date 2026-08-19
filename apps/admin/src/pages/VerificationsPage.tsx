// Verified-badge request queue.
//
// Pro/Premium vendors apply from the mobile app (More → Verification):
// legal identity + business info + proof documents. Documents live in
// the PRIVATE vendor-verifications bucket — this page mints short-lived
// signed URLs to view them. Decisions go through the
// admin_decide_verification RPC, which stamps verified_at (and
// optionally insured_at) on the vendor's listings and notifies them.

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type RequestStatus = "under_review" | "approved" | "needs_info" | "rejected";

type VerificationRequest = {
  id: string;
  user_id: string;
  status: RequestStatus;
  legal_first_name: string;
  legal_last_name: string;
  dob: string | null;
  id_front_path: string;
  id_back_path: string | null;
  business_name: string;
  business_category: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  website: string | null;
  documents: { name: string; path: string }[];
  admin_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

const TABS: RequestStatus[] = ["under_review", "approved", "needs_info", "rejected"];
const TAB_LABELS: Record<RequestStatus, string> = {
  under_review: "Under review",
  approved: "Approved",
  needs_info: "Needs info",
  rejected: "Rejected",
};

export function VerificationsPage() {
  const [tab, setTab] = useState<RequestStatus>("under_review");
  const [rows, setRows] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<VerificationRequest | null>(null);
  const [note, setNote] = useState("");
  const [insured, setInsured] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("vendor_verification_requests" as any)
      .select("*")
      .eq("status", tab)
      .order("submitted_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as unknown as VerificationRequest[]);
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDoc(path: string) {
    const { data, error } = await supabase.storage
      .from("vendor-verifications")
      .createSignedUrl(path, 600);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Couldn't open the document.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function decide(req: VerificationRequest, status: RequestStatus) {
    if (acting) return;
    if (status === "needs_info" && !note.trim()) {
      toast.error("Tell the vendor what's missing (note is required for Needs info).");
      return;
    }
    setActing(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("admin_decide_verification", {
      p_request_id: req.id,
      p_status: status,
      p_note: note.trim() || null,
      p_insured: insured,
    });
    setActing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      status === "approved"
        ? `${req.business_name} is now verified${insured ? " + insured" : ""}.`
        : status === "needs_info"
          ? "Sent back for more info."
          : "Request rejected.",
    );
    setOpen(null);
    setNote("");
    setInsured(false);
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Verifications</h1>
        <p className="text-sm text-ink/60">
          Verified-badge requests from Pro & Premium vendors. Approving stamps
          the badge on every listing the vendor owns.
        </p>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              tab === t ? "bg-ink text-white" : "bg-ink/5 text-ink/70 hover:bg-ink/10"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink/50">Nothing here.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const isOpen = open?.id === r.id;
            return (
              <div key={r.id} className="rounded-xl border border-ink/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.business_name}{" "}
                      <span className="text-sm font-normal text-ink/50">
                        · {r.legal_first_name} {r.legal_last_name}
                      </span>
                    </p>
                    <p className="text-xs text-ink/50">
                      Submitted {new Date(r.submitted_at).toLocaleString()}
                      {r.business_category ? ` · ${r.business_category}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setOpen(isOpen ? null : r);
                      setNote(r.admin_note ?? "");
                      setInsured(false);
                    }}
                    className="shrink-0 rounded-full bg-ink/5 px-3 py-1.5 text-sm hover:bg-ink/10"
                  >
                    {isOpen ? "Close" : "Review"}
                  </button>
                </div>

                {isOpen ? (
                  <div className="mt-4 space-y-4 border-t border-ink/10 pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                          Identity
                        </p>
                        <p className="mt-1 text-sm">
                          {r.legal_first_name} {r.legal_last_name}
                          {r.dob ? ` · DOB ${r.dob}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <DocButton label="ID front" onClick={() => openDoc(r.id_front_path)} />
                          {r.id_back_path ? (
                            <DocButton label="ID back" onClick={() => openDoc(r.id_back_path!)} />
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                          Business
                        </p>
                        <p className="mt-1 text-sm">
                          {[r.business_email, r.business_phone, r.business_address, r.website]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(r.documents ?? []).map((d) => (
                            <DocButton key={d.path} label={d.name} onClick={() => openDoc(d.path)} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {r.status === "under_review" || r.status === "needs_info" ? (
                      <>
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                            Note to vendor (required for “Needs info”)
                          </label>
                          <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            placeholder="e.g., The insurance certificate is expired — please upload a current one."
                            className="mt-1 w-full rounded-lg border border-ink/15 p-2 text-sm"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={insured}
                            onChange={(e) => setInsured(e.target.checked)}
                          />
                          Insurance certificate on file (shows “Insured” on their public profile)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={acting}
                            onClick={() => decide(r, "approved")}
                            className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            disabled={acting}
                            onClick={() => decide(r, "needs_info")}
                            className="rounded-full bg-amber-500 px-4 py-1.5 text-sm text-white hover:bg-amber-600 disabled:opacity-50"
                          >
                            Needs more info
                          </button>
                          <button
                            disabled={acting}
                            onClick={() => decide(r, "rejected")}
                            className="rounded-full bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-ink/60">
                        {TAB_LABELS[r.status]}
                        {r.reviewed_at ? ` · ${new Date(r.reviewed_at).toLocaleString()}` : ""}
                        {r.admin_note ? ` · Note: ${r.admin_note}` : ""}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DocButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1 text-xs hover:bg-ink/5"
    >
      <ExternalLink className="h-3 w-3" />
      {label}
    </button>
  );
}
