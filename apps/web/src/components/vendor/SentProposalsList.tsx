// Vendor-side list of proposals sent to clients, with live status.
// Sits above the proposal-template gallery in Files → Proposals.
import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime";

interface SentProposal {
  id: string;
  title: string;
  recipient_name: string | null;
  accepted_name: string | null;
  status: string;
  accepted_at: string | null;
  view_token: string;
  created_at: string;
}

const ORIGIN =
  typeof window !== "undefined" ? window.location.origin : "https://eventvendora.com";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SentProposalsList({
  accountVendorIds,
}: {
  accountVendorIds: string[];
}) {
  const [rows, setRows] = useState<SentProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const idsKey = accountVendorIds.join(",");

  const load = useCallback(async () => {
    if (accountVendorIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_proposals")
      .select(
        "id, title, recipient_name, accepted_name, status, accepted_at, view_token, created_at",
      )
      .in("vendor_id", accountVendorIds)
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data ?? []) as SentProposal[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refetch when a proposal flips to accepted (the client accepts).
  useRealtime(
    accountVendorIds.length > 0 ? { table: "vendor_proposals" } : null,
    () => void load(),
  );

  function copyLink(token: string) {
    void navigator.clipboard
      .writeText(`${ORIGIN}/proposal/${token}`)
      .then(() => toast.success("Proposal link copied"))
      .catch(() => toast.error("Couldn't copy the link"));
  }

  if (loading) {
    return <div className="h-20 rounded-2xl bg-foreground/5 animate-pulse mb-4" />;
  }
  if (rows.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
        Sent proposals
      </h2>
      <div className="space-y-2">
        {rows.map((p) => {
          const accepted = p.status === "accepted";
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{
                background: "rgba(255,255,255,0.6)",
                border: "0.5px solid rgba(0,0,0,0.08)",
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {accepted
                    ? `Accepted by ${p.accepted_name ?? "client"} · ${fmtDate(p.accepted_at)}`
                    : `${p.recipient_name ? `To ${p.recipient_name} · ` : ""}Sent ${fmtDate(p.created_at)}`}
                </p>
              </div>
              <span
                className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  accepted
                    ? "bg-emerald-600 text-white"
                    : p.status === "sent"
                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {accepted ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {accepted ? "Accepted" : p.status === "sent" ? "Awaiting" : p.status}
              </span>
              {!accepted && p.status === "sent" ? (
                <button
                  type="button"
                  onClick={() => copyLink(p.view_token)}
                  title="Copy proposal link"
                  className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-foreground/10 rounded-full px-2.5 py-1"
                >
                  <Copy className="w-3 h-3" />
                  Link
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
