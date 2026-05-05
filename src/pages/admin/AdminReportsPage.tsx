import { useEffect, useState } from "react";
import {
  Loader2,
  Flag,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminNavItems as navItems } from "@/data/navItems";
import { formatDate } from "@/lib/format";

// Admin trust & safety queue. Triages content_reports — anyone can
// flag content from a ReportButton anywhere on the platform; this is
// where the team works through them.

interface Report {
  id: string;
  reporter_id: string;
  content_type: string;
  content_id: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  resolution_action: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

const STATUS_TONE: Record<Report["status"], string> = {
  open: "bg-destructive/15 text-destructive border-destructive/30",
  reviewing: "bg-accent/15 text-accent border-accent/30",
  resolved: "bg-secondary text-secondary-foreground border-border",
  dismissed: "bg-secondary text-muted-foreground border-border",
};

const REASON_LABEL: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate",
  misleading: "Misleading",
  impersonation: "Impersonation",
  copyright: "Copyright",
  safety: "Safety",
  other: "Other",
};

const TYPE_PATH: Record<string, (id: string) => string | null> = {
  vendor_profile: (id) => `/vendors/${id}`,
  review: () => null,
  direct_message: () => null,
  microsite: () => null,
  vendor_blog_post: () => null,
  editorial_article: () => null,
  mood_board: (id) => `/mood-boards/${id}`,
  inquiry_message: () => null,
  real_event: (id) => `/real-events/${id}`,
};

export default function AdminReportsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Report[] | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    setRows(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("content_reports")
      .select(
        "id, reporter_id, content_type, content_id, reason, details, status, resolution_action, resolution_notes, resolved_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter === "open") {
      q = q.in("status", ["open", "reviewing"]);
    }
    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
      setRows([]);
      return;
    }
    setRows((data as Report[]) ?? []);
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  async function resolve(
    id: string,
    status: "resolved" | "dismissed",
    notes?: string,
    action?: string,
  ) {
    setActingId(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("content_reports")
      .update({
        status,
        resolution_action: action ?? null,
        resolution_notes: notes ?? null,
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id ?? null,
      })
      .eq("id", id);
    setActingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "resolved" ? "Resolved" : "Dismissed");
    load();
  }

  const openCount =
    rows?.filter((r) => r.status === "open" || r.status === "reviewing")
      .length ?? 0;

  return (
    <div className="min-h-screen flex bg-background">
      <DashboardSidebar items={navItems} title="Admin" backPath="/" />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-x-hidden">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-label text-accent mb-2 inline-flex items-center gap-1.5">
                <Flag className="w-3 h-3" />
                Trust &amp; safety
              </p>
              <h1 className="font-display text-3xl md:text-4xl">Reports</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {openCount === 0
                  ? "All caught up."
                  : `${openCount} awaiting review`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <Select
                value={filter}
                onValueChange={(v) => setFilter(v as "open" | "all")}
              >
                <SelectTrigger className="w-32 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open only</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {rows === null ? (
            <div className="space-y-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Flag className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No reports here.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  acting={actingId === r.id}
                  onResolve={resolve}
                />
              ))}
            </ul>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

function ReportRow({
  report,
  acting,
  onResolve,
}: {
  report: Report;
  acting: boolean;
  onResolve: (
    id: string,
    status: "resolved" | "dismissed",
    notes?: string,
    action?: string,
  ) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const link = TYPE_PATH[report.content_type]?.(report.content_id) ?? null;

  return (
    <li className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={STATUS_TONE[report.status]}>
            {report.status}
          </Badge>
          <Badge variant="outline">{REASON_LABEL[report.reason]}</Badge>
          <span className="text-xs text-muted-foreground capitalize">
            {report.content_type.replace(/_/g, " ")}
          </span>
        </div>
        <span className="text-xs text-muted-foreground tnum">
          {formatDate(report.created_at)}
        </span>
      </div>

      {report.details && (
        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
          "{report.details}"
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            View content
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {(report.status === "open" || report.status === "reviewing") && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setExpanded((x) => !x)}
            >
              {expanded ? "Collapse" : "Add notes"}
            </Button>
          </>
        )}
        {report.status === "open" || report.status === "reviewing" ? (
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => onResolve(report.id, "dismissed", notes)}
              disabled={acting}
            >
              {acting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5 mr-1.5" />
              )}
              Dismiss
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              onClick={() =>
                onResolve(report.id, "resolved", notes, "content_actioned")
              }
              disabled={acting}
            >
              {acting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              Resolve
            </Button>
          </div>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">
            {report.resolution_notes ?? "—"}
          </span>
        )}
      </div>

      {expanded && (report.status === "open" || report.status === "reviewing") && (
        <div className="mt-3 pt-3 border-t border-border space-y-1.5">
          <Label htmlFor={`notes-${report.id}`} className="text-xs">
            Resolution notes (optional)
          </Label>
          <Textarea
            id={`notes-${report.id}`}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What action was taken?"
          />
        </div>
      )}
    </li>
  );
}
