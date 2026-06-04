// Vendor-side list of contracts sent for e-signature, with live status.
// Lives in the right column of Files → Contracts, styled to match the
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

interface SentContract {
  id: string;
  vendor_id: string;
  title: string;
  body: string;
  recipient_name: string | null;
  signer_name: string | null;
  signature_image: string | null;
  status: string;
  signed_at: string | null;
  sign_token: string;
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
    signed: { label: "Signed", cls: "bg-emerald-100 text-emerald-700", icon: "check" },
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

export function SentContractsList({
  accountVendorIds,
  listings = [],
}: {
  accountVendorIds: string[];
  listings?: ListingOpt[];
}) {
  const [rows, setRows] = useState<SentContract[]>([]);
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
      .from("vendor_contracts")
      .select(
        "id, vendor_id, title, body, recipient_name, signer_name, signature_image, status, signed_at, sign_token, created_at",
      )
      .in("vendor_id", accountVendorIds)
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data ?? []) as SentContract[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refetch when a contract flips to signed (the host signs).
  useRealtime(
    accountVendorIds.length > 0 ? { table: "vendor_contracts" } : null,
    () => void load(),
  );

  function copyLink(token: string) {
    void navigator.clipboard
      .writeText(`${ORIGIN}/sign/${token}`)
      .then(() => toast.success("Sign link copied"))
      .catch(() => toast.error("Couldn't copy the link"));
  }

  function brandFor(vendorId: string): string | null {
    return listings.find((l) => l.id === vendorId)?.business_name ?? null;
  }

  function downloadPdf(c: SentContract) {
    downloadDocumentPdf({
      title: c.title,
      body: c.body,
      vendor_business_name: brandFor(c.vendor_id),
      kindLabel: "Contract",
      completion:
        c.status === "signed"
          ? {
              label: "Electronically signed",
              name: c.signer_name,
              at: c.signed_at,
              signature_image: c.signature_image,
            }
          : null,
    });
  }

  const cancel = useCallback(
    async (c: SentContract) => {
      // Voiding is terminal: the public /sign page and the sign_contract
      // RPC both refuse any status other than 'sent', so a cancelled
      // contract can never be signed. Always confirm.
      if (!confirm(`Void "${c.title}"? The recipient won't be able to sign it.`)) return;
      setCancellingId(c.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_contracts")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", c.id)
        .eq("status", "sent");
      setCancellingId(null);
      if (error) {
        toast.error("Couldn't void the contract", { description: error.message });
        return;
      }
      toast.success("Contract voided");
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
          Sent for signature
        </span>
      </div>
      {loading ? (
        <div className="h-16 m-4 rounded-xl bg-foreground/5 animate-pulse" />
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-xs text-muted-foreground">
          No contracts sent yet. Compose one on the left and send it from the box below.
        </p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto scrollbar-hide">
          {rows.map((c, idx) => {
            const signed = c.status === "signed";
            const open = c.status === "sent";
            return (
              <div key={c.id} className={`p-4 ${idx > 0 ? "border-t border-foreground/5" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{c.title}</span>
                      <StatusPill status={c.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {signed
                        ? `Signed by ${c.signer_name ?? "client"} · ${fmtDate(c.signed_at)}`
                        : `${c.recipient_name ? `To ${c.recipient_name} · ` : ""}Sent ${fmtDate(c.created_at)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => window.open(`${ORIGIN}/sign/${c.sign_token}`, "_blank")}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-foreground/10 rounded-full px-2.5 py-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPdf(c)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-foreground/10 rounded-full px-2.5 py-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PDF
                  </button>
                  {open ? (
                    <button
                      type="button"
                      onClick={() => copyLink(c.sign_token)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-foreground/10 rounded-full px-2.5 py-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Link
                    </button>
                  ) : null}
                  {open ? (
                    <button
                      type="button"
                      onClick={() => void cancel(c)}
                      disabled={cancellingId === c.id}
                      className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive rounded-full px-2.5 py-1"
                    >
                      {cancellingId === c.id ? (
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
