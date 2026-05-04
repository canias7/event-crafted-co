import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Loader2,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { adminNavItems as navItems } from "@/data/navItems";

const BUCKET = "vendor-verifications";

interface VerificationRow {
  id: string;
  vendor_id: string;
  kind: "identity" | "insurance" | "business_license";
  status: "pending" | "approved" | "rejected";
  document_path: string;
  notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  vendor: { business_name: string | null; category: string | null } | null;
}

const kindLabel: Record<VerificationRow["kind"], string> = {
  identity: "Identity",
  insurance: "Insurance",
  business_license: "Business license",
};

const statusMeta: Record<
  VerificationRow["status"],
  { label: string; tone: string; Icon: typeof ShieldCheck }
> = {
  pending: {
    label: "Pending",
    tone: "bg-secondary text-muted-foreground border-border",
    Icon: Clock,
  },
  approved: {
    label: "Approved",
    tone: "bg-accent/15 text-accent border-accent/30",
    Icon: ShieldCheck,
  },
  rejected: {
    label: "Rejected",
    tone: "bg-destructive/10 text-destructive border-destructive/30",
    Icon: ShieldAlert,
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const verifTable = () => (supabase as any).from("vendor_verifications");

export default function AdminVerificationsPage() {
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    let q = verifTable()
      .select(
        "id, vendor_id, kind, status, document_path, notes, submitted_at, reviewed_at, vendor:vendor_profiles!vendor_verifications_vendor_id_fkey(business_name, category)",
      )
      .order("submitted_at", { ascending: false });
    if (filter === "pending") {
      q = q.eq("status", "pending");
    }
    const { data } = await q;
    const list = (data as VerificationRow[]) ?? [];
    setRows(list);
    setLoading(false);

    // Sign URLs for the visible rows so reviewers can preview docs.
    const urls: Record<string, string> = {};
    await Promise.all(
      list.map(async (r) => {
        const { data: sig } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(r.document_path, 60 * 30); // 30 min
        if (sig?.signedUrl) urls[r.id] = sig.signedUrl;
      }),
    );
    setSignedUrls(urls);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function decide(
    r: VerificationRow,
    status: "approved" | "rejected",
    note?: string,
  ) {
    if (status === "rejected" && !note?.trim()) {
      toast.error("Add a short reviewer note when rejecting");
      return;
    }
    setBusyId(r.id);
    const { data: ud } = await supabase.auth.getUser();
    const reviewerId = ud.user?.id ?? null;
    const { error } = await verifTable()
      .update({
        status,
        notes: status === "rejected" ? note ?? null : null,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked ${kindLabel[r.kind].toLowerCase()} ${status}`);
    if (filter === "pending") {
      setRows((p) => p.filter((x) => x.id !== r.id));
    } else {
      load();
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Admin" backPath="/" />
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-display text-xl">Verifications</h1>
              <p className="text-sm text-muted-foreground">
                Review vendor-submitted ID, insurance, and business license docs
              </p>
            </div>
            <div className="inline-flex rounded-full border border-border bg-background overflow-hidden text-xs">
              {(["pending", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 transition-colors capitalize ${
                    filter === f
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-32 rounded-sm" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <ShieldCheck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
              <p className="font-display text-xl mb-2">Inbox zero</p>
              <p className="text-sm text-muted-foreground">
                No {filter === "pending" ? "pending " : ""}verifications.
              </p>
            </div>
          ) : (
            rows.map((r) => (
              <Row
                key={r.id}
                row={r}
                signedUrl={signedUrls[r.id]}
                busy={busyId === r.id}
                onApprove={() => decide(r, "approved")}
                onReject={(note) => decide(r, "rejected", note)}
              />
            ))
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

function Row({
  row,
  signedUrl,
  busy,
  onApprove,
  onReject,
}: {
  row: VerificationRow;
  signedUrl: string | undefined;
  busy: boolean;
  onApprove: () => void;
  onReject: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const sm = statusMeta[row.status];
  const SIcon = sm.Icon;

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <SIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="font-label text-muted-foreground">
              {kindLabel[row.kind]}
            </p>
            <span
              className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${sm.tone}`}
            >
              {sm.label}
            </span>
          </div>
          <h3 className="font-display text-lg">
            {row.vendor?.business_name ?? "Unknown vendor"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {row.vendor?.category ?? ""} · submitted{" "}
            <span className="tnum">
              {new Date(row.submitted_at).toLocaleString()}
            </span>
          </p>
        </div>
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Open document
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">No preview</span>
        )}
      </div>

      {row.notes && (
        <p className="text-xs bg-secondary/40 rounded-sm p-2.5 text-muted-foreground mb-3 leading-relaxed">
          Previous note: {row.notes}
        </p>
      )}

      {row.status === "pending" && (
        <>
          {rejectMode && (
            <div className="mb-3">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Reason for rejection (visible to vendor)"
                className="text-sm"
              />
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {!rejectMode ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                  onClick={onApprove}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setRejectMode(true)}
                  disabled={busy}
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Reject
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => onReject(note)}
                  disabled={busy || !note.trim()}
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Confirm reject
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => {
                    setRejectMode(false);
                    setNote("");
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
