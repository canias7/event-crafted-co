import { useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Upload,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const BUCKET = "vendor-verifications";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

type Kind = "identity" | "insurance" | "business_license" | "background_check";

interface Verification {
  id: string;
  kind: Kind;
  status: "pending" | "approved" | "rejected";
  document_path: string;
  notes: string | null;
  expires_at: string | null;
  submitted_at: string;
}

interface KindMeta {
  kind: Kind;
  label: string;
  blurb: string;
}

const KINDS: KindMeta[] = [
  {
    kind: "identity",
    label: "Identity",
    blurb:
      "Government-issued photo ID. Confirms you are who you say you are. We blur the photo and store the file privately — only admin reviewers can open it.",
  },
  {
    kind: "insurance",
    label: "Liability insurance",
    blurb:
      "A current certificate of insurance ($1M+ general liability is standard). Required by most premium venues and a strong trust signal for hosts.",
  },
  {
    kind: "business_license",
    label: "Business license",
    blurb:
      "Your business registration, tax ID, or local trade license. Confirms you operate as a legitimate business.",
  },
  {
    kind: "background_check",
    label: "Background check",
    blurb:
      "Upload a recent background check report (Checkr, Sterling, GoodHire — anything dated within the last 12 months). Critical for vendors who work in private homes (photographers, planners, makeup artists, in-home chefs).",
  },
];

const statusMeta: Record<
  Verification["status"],
  { label: string; tone: string; Icon: typeof ShieldCheck }
> = {
  pending: {
    label: "Pending review",
    tone: "bg-secondary text-muted-foreground border-border",
    Icon: Clock,
  },
  approved: {
    label: "Verified",
    tone: "bg-accent/15 text-accent border-accent/30",
    Icon: ShieldCheck,
  },
  rejected: {
    label: "Returned",
    tone: "bg-destructive/10 text-destructive border-destructive/30",
    Icon: ShieldAlert,
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const verifTable = () => (supabase as any).from("vendor_verifications");

export function VerificationManager({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await verifTable()
      .select("id, kind, status, document_path, notes, expires_at, submitted_at")
      .eq("vendor_id", vendorId);
    setRows((data as Verification[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const byKind = new Map(rows.map((r) => [r.kind, r]));

  return (
    <div className="space-y-4">
      <div>
        <p className="font-label text-muted-foreground">Verifications</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-xl">
          Optional but recommended. Verified vendors get badges on their
          profile, rank higher in search, and unlock the hosts who filter
          by verification level. Documents are stored privately — only
          admin reviewers can open them.
        </p>
      </div>

      {loading ? (
        <div className="text-center text-sm text-muted-foreground py-6">
          Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {KINDS.map((meta) => (
            <KindRow
              key={meta.kind}
              meta={meta}
              row={byKind.get(meta.kind) ?? null}
              vendorId={vendorId}
              canEdit={canEdit}
              onChange={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KindRow({
  meta,
  row,
  vendorId,
  canEdit,
  onChange,
}: {
  meta: KindMeta;
  row: Verification | null;
  vendorId: string;
  canEdit: boolean;
  onChange: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const status = row?.status ?? null;
  const sm = status ? statusMeta[status] : null;
  const Icon = sm?.Icon ?? ShieldAlert;

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Use JPG, PNG, WEBP, or PDF");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Max 10 MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const filename = `${meta.kind}-${crypto.randomUUID()}.${ext}`;
    const path = `${vendorId}/${filename}`;

    // Best-effort cleanup of old file when re-submitting.
    if (row?.document_path) {
      await supabase.storage.from(BUCKET).remove([row.document_path]);
    }

    const up = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "3600" });
    if (up.error) {
      setUploading(false);
      toast.error(up.error.message);
      return;
    }

    // Upsert row → resets status to 'pending'.
    const upsert = await verifTable().upsert(
      {
        vendor_id: vendorId,
        kind: meta.kind,
        document_path: path,
        status: "pending",
        notes: null,
        reviewed_by: null,
        reviewed_at: null,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "vendor_id,kind" },
    );
    setUploading(false);
    if (upsert.error) {
      await supabase.storage.from(BUCKET).remove([path]);
      toast.error(upsert.error.message);
      return;
    }
    toast.success(`${meta.label} sent for review`);
    onChange();
  }

  return (
    <div className="card-soft p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-start gap-2.5">
          <Icon
            className={`w-4 h-4 mt-0.5 shrink-0 ${
              status === "approved"
                ? "text-accent"
                : status === "rejected"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          />
          <div>
            <p className="font-display text-base leading-tight">{meta.label}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-md">
              {meta.blurb}
            </p>
          </div>
        </div>
        {sm && (
          <span
            className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border shrink-0 ${sm.tone}`}
          >
            {sm.label}
          </span>
        )}
      </div>

      {status === "rejected" && row?.notes && (
        <p className="text-xs bg-destructive/5 border border-destructive/20 rounded-sm p-2.5 mb-3 text-destructive/85 leading-relaxed">
          Reviewer note: {row.notes}
        </p>
      )}

      {canEdit && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : status ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <Upload className="w-3.5 h-3.5 mr-1.5" />
            )}
            {status === "approved"
              ? "Replace document"
              : status === "rejected"
                ? "Resubmit"
                : status === "pending"
                  ? "Replace document"
                  : "Upload document"}
          </Button>
        </>
      )}
    </div>
  );
}
