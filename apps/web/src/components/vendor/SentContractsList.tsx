// Vendor-side list of contracts sent for e-signature, with live status.
// Sits above the contract-template gallery in Files → Contracts.
import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime";

interface SentContract {
  id: string;
  title: string;
  recipient_name: string | null;
  signer_name: string | null;
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

export function SentContractsList({
  accountVendorIds,
}: {
  accountVendorIds: string[];
}) {
  const [rows, setRows] = useState<SentContract[]>([]);
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
      .from("vendor_contracts")
      .select(
        "id, title, recipient_name, signer_name, status, signed_at, sign_token, created_at",
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

  if (loading) {
    return <div className="h-20 rounded-2xl bg-foreground/5 animate-pulse mb-4" />;
  }
  if (rows.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3 pb-2 border-b border-foreground/[0.06]">
        Sent for signature
      </h2>
      <div className="space-y-2">
        {rows.map((c) => {
          const signed = c.status === "signed";
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{
                background: "rgba(255,255,255,0.6)",
                border: "0.5px solid rgba(0,0,0,0.08)",
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {signed
                    ? `Signed by ${c.signer_name ?? "client"} · ${fmtDate(c.signed_at)}`
                    : `${c.recipient_name ? `To ${c.recipient_name} · ` : ""}Sent ${fmtDate(c.created_at)}`}
                </p>
              </div>
              <span
                className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  signed
                    ? "bg-emerald-600 text-white"
                    : c.status === "sent"
                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {signed ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {signed ? "Signed" : c.status === "sent" ? "Awaiting" : c.status}
              </span>
              {!signed && c.status === "sent" ? (
                <button
                  type="button"
                  onClick={() => copyLink(c.sign_token)}
                  title="Copy sign link"
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
