// Vendor-side list of proposals sent to clients, with live status.
// Lives in the right column of Files → Proposals, styled to match the
// Invoices list: per-row Preview / PDF / Copy link / Cancel actions plus
// a status pill.
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime";
import type { ListingOpt } from "@/components/vendor/ListingPicker";
import { downloadDocumentPdf } from "@/lib/documentPdf";

interface SentProposal {
  id: string;
  vendor_id: string;
  title: string;
  body: string;
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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: "check" | "clock" }> = {
    sent: { label: "Awaiting", cls: "bg-amber-100 text-amber-800", icon: "clock" },
    accepted: { label: "Accepted", cls: "bg-emerald-100 text-emerald-700", icon: "check" },
    cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-600", icon: "clock" },
  };
  const m = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-600", icon: "clock" as const };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.cls}`}
    >
      {m.icon === "check" ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {m.label}
    </span>
  );
}

export function SentProposalsList({
  accountVendorIds,
  listings = [],
}: {
  accountVendorIds: string[];
  listings?: ListingOpt[];
}) {
  const [rows, setRows] = useState<SentProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
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
        "id, vendor_id, title, body, recipient_name, accepted_name, status, accepted_at, view_token, created_at",
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

  function brandFor(vendorId: string): string | null {
    return listings.find((l) => l.id === vendorId)?.business_name ?? null;
  }

  function downloadPdf(p: SentProposal) {
    downloadDocumentPdf({
      title: p.title,
      body: p.body,
      vendor_business_name: brandFor(p.vendor_id),
      kindLabel: "Proposal",
      completion:
        p.status === "accepted"
          ? { label: "Accepted", name: p.accepted_name, at: p.accepted_at }
          : null,
    });
  }

  const cancel = useCallback(
    async (p: SentProposal) => {
      // Voiding is terminal: the public /proposal page and the
      // accept_proposal RPC both refuse any status other than 'sent', so a
      // cancelled proposal can never be accepted. Always confirm.
      if (!confirm(`Void "${p.title}"? The client won't be able to accept it.`)) return;
      setCancellingId(p.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_proposals")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", p.id)
        .eq("status", "sent");
      setCancellingId(null);
      if (error) {
        toast.error("Couldn't void the proposal", { description: error.message });
        return;
      }
      toast.success("Proposal voided");
      await load();
    },
    [load],
  );

  return (
    <div
      data-cockpit-card
      className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.85)", border: "1px solid rgba(0,0,0,0.08)" }}
    >
      <div className="px-4 pt-3 pb-2 border-b border-foreground/5">
        <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
          Sent proposals
        </span>
      </div>
      {loading ? (
        <div className="h-16 m-4 rounded-xl bg-foreground/5 animate-pulse" />
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-xs text-muted-foreground">
          No proposals sent yet. Compose one on the left and send it from the box below.
        </p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto scrollbar-hide">
          {rows.map((p, idx) => {
            const accepted = p.status === "accepted";
            const open = p.status === "sent";
            return (
              <div key={p.id} className={`p-4 ${idx > 0 ? "border-t border-foreground/5" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{p.title}</span>
                      <StatusPill status={p.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {accepted
                        ? `Accepted by ${p.accepted_name ?? "client"} · ${fmtDate(p.accepted_at)}`
                        : `${p.recipient_name ? `To ${p.recipient_name} · ` : ""}Sent ${fmtDate(p.created_at)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => window.open(`${ORIGIN}/proposal/${p.view_token}`, "_blank")}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-foreground/10 rounded-full px-2.5 py-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPdf(p)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-foreground/10 rounded-full px-2.5 py-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PDF
                  </button>
                  {open ? (
                    <button
                      type="button"
                      onClick={() => copyLink(p.view_token)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-foreground/10 rounded-full px-2.5 py-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Link
                    </button>
                  ) : null}
                  {open ? (
                    <button
                      type="button"
                      onClick={() => void cancel(p)}
                      disabled={cancellingId === p.id}
                      className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive rounded-full px-2.5 py-1"
                    >
                      {cancellingId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : null}
                      Void
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
