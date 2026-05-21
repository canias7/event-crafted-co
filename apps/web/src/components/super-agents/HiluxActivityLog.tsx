// HILUX activity log viewer. Reads hilux_action_log via RLS (user
// only sees own rows). Shown inside HILUX vendor controls when the
// hilux_action_log_actions toggle is on. CSV export uses the same
// query, formatted client-side.

import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Loader2,
  ScrollText,
  Send,
  ShieldAlert,
  Bell,
  Flame,
  Archive,
  Flag,
  ClipboardList,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LogRow {
  id: string;
  thread_id: string | null;
  inquiry_id: string | null;
  message_id: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  reply: "Replied",
  escalate: "Escalated",
  follow_up: "Follow-up nudge",
  regenerate: "Regenerated reply",
  archive_cold: "Archived cold inquiry",
  booking_intent_detected: "Booking intent",
  lead_score_hot: "Hot lead",
  fields_extracted: "Extracted fields",
};

const ACTION_ICON: Record<string, typeof Send> = {
  reply: Send,
  escalate: ShieldAlert,
  follow_up: Bell,
  regenerate: RotateCcw,
  archive_cold: Archive,
  booking_intent_detected: Flag,
  lead_score_hot: Flame,
  fields_extracted: ClipboardList,
};

const PAGE_SIZE = 25;

export function HiluxActivityLog() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("hilux_action_log")
      .select("id, thread_id, inquiry_id, message_id, action, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    setLoading(false);
    if (error) {
      console.error("[HiluxActivityLog] load failed", error);
      toast.error("Couldn't load activity log.");
      return;
    }
    setRows(((data as LogRow[] | null) ?? []));
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = useCallback(async () => {
    if (!user?.id) return;
    setExporting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("hilux_action_log")
      .select("id, thread_id, inquiry_id, message_id, action, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    setExporting(false);
    if (error) {
      toast.error("Couldn't export.");
      return;
    }
    const all = (data as LogRow[] | null) ?? [];
    const header = "created_at,action,detail,thread_id,inquiry_id,message_id";
    const csv = [header]
      .concat(
        all.map((r) =>
          [
            r.created_at,
            r.action,
            csvEscape(r.detail ?? ""),
            r.thread_id ?? "",
            r.inquiry_id ?? "",
            r.message_id ?? "",
          ].join(","),
        ),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hilux-activity-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${all.length} entr${all.length === 1 ? "y" : "ies"}.`);
  }, [user?.id]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-medium text-black mb-0.5 flex items-center gap-2">
            <ScrollText className="w-3.5 h-3.5 text-black/55" />
            Activity log
          </p>
          <p className="text-xs text-black/55">
            Recent {PAGE_SIZE} actions HILUX performed on your behalf.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting || rows.length === 0}
          className="shrink-0 inline-flex items-center gap-1.5 text-[11px] text-black/65 hover:text-black/95 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {exporting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Download className="w-3 h-3" />
          )}
          Export CSV
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-black/40" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-xs text-black/55 border border-dashed border-black/15 rounded-lg bg-white/40">
          Nothing logged yet. HILUX will write a row here every time it replies or escalates.
        </div>
      ) : (
        <ul className="divide-y divide-black/10 rounded-lg bg-white/55 overflow-hidden">
          {rows.map((r) => {
            const Icon = ACTION_ICON[r.action] ?? ScrollText;
            const label = ACTION_LABEL[r.action] ?? r.action;
            return (
              <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                <Icon className="w-3.5 h-3.5 text-black/55 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-medium text-black leading-tight">
                      {label}
                    </p>
                    <p className="text-[10px] text-black/45 tabular-nums shrink-0">
                      {formatRelative(r.created_at)}
                    </p>
                  </div>
                  {r.detail ? (
                    <p className="text-[11px] text-black/60 mt-0.5 leading-snug truncate">
                      {r.detail}
                    </p>
                  ) : null}
                </div>
                {r.thread_id ? (
                  <a
                    href={`/vendor/messages?thread=${r.thread_id}`}
                    className="text-[10px] text-black/55 hover:text-black/95 underline underline-offset-2 shrink-0 mt-0.5"
                  >
                    open
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
