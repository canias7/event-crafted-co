import { useEffect, useState } from "react";
import { FileText, Eye, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Proposal funnel: sent → viewed → accepted, with conversion %s.
// Pulls from the proposals table. View tracking added in
// 20260504130000 surfaces the "viewed" middle step.
//
// Data is small (one row per proposal) so we pull and aggregate
// client-side — no need for a server-side rollup at this volume.

interface ProposalRow {
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  first_viewed_at: string | null;
  sent_at: string | null;
}

export function ProposalFunnelCard({ vendorId }: { vendorId: string }) {
  const [rows, setRows] = useState<ProposalRow[] | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("proposals")
        .select("status, first_viewed_at, sent_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      setRows((data as ProposalRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (rows === null) {
    return (
      <div className="bg-card border border-border rounded-sm p-5 flex items-center justify-center h-32">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sent = rows.length;
  const viewed = rows.filter((r) => r.first_viewed_at != null).length;
  const accepted = rows.filter((r) => r.status === "accepted").length;
  const viewRate = sent ? Math.round((viewed / sent) * 100) : 0;
  const acceptRate = viewed ? Math.round((accepted / viewed) * 100) : 0;
  const overallRate = sent ? Math.round((accepted / sent) * 100) : 0;

  if (sent === 0) {
    return (
      <div className="bg-card border border-border rounded-sm p-5">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <FileText className="w-3.5 h-3.5" />
          <p className="font-label">Proposal funnel</p>
        </div>
        <p className="text-xs text-muted-foreground italic py-3">
          No proposals sent yet. Once you send a few, you'll see your
          view + acceptance rates here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="w-3.5 h-3.5" />
          <p className="font-label">Proposal funnel</p>
        </div>
        <p className="text-xs text-muted-foreground tnum">
          {overallRate}% sent → accepted
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FunnelStep
          label="Sent"
          value={sent}
          icon={FileText}
          tone="text-foreground"
        />
        <FunnelStep
          label="Viewed"
          value={viewed}
          icon={Eye}
          tone="text-accent"
          subtitle={`${viewRate}% open rate`}
        />
        <FunnelStep
          label="Accepted"
          value={accepted}
          icon={Check}
          tone="text-accent"
          subtitle={
            viewed > 0 ? `${acceptRate}% close rate` : undefined
          }
        />
      </div>

      <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
        Funnel covers your last {sent < 200 ? sent : "200"} proposals.
        Open rate measures hosts who opened the proposal page; close
        rate measures opened-then-accepted.
      </p>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  icon: Icon,
  tone,
  subtitle,
}: {
  label: string;
  value: number;
  icon: typeof FileText;
  tone: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <div className={`flex items-center gap-1.5 ${tone} mb-1`}>
        <Icon className="w-3 h-3" />
        <p className="text-[10px] uppercase tracking-wide font-medium">
          {label}
        </p>
      </div>
      <p className="font-display text-2xl tnum">{value}</p>
      {subtitle && (
        <p className="text-[11px] text-muted-foreground tnum mt-0.5">
          {subtitle}
        </p>
      )}
    </div>
  );
}
