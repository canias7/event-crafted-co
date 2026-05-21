// Per-thread HILUX activity card. Shown on the inquiry detail page
// above the message timeline. Pulls hilux_action_log entries scoped
// to this inquiry, renders a compact horizontal timeline summary,
// and expands to a detailed list on click.

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ChevronDown,
  ClipboardList,
  Flag,
  Flame,
  RotateCcw,
  ScrollText,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface LogRow {
  id: string;
  action: string;
  detail: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  reply: "Replied",
  escalate: "Escalated",
  follow_up: "Follow-up sent",
  regenerate: "Regenerated reply",
  archive_cold: "Archived as cold",
  booking_intent_detected: "Booking intent detected",
  lead_score_hot: "Flagged hot lead",
  fields_extracted: "Extracted inquiry fields",
};

const ACTION_ICON: Record<string, typeof Send> = {
  reply: Send,
  escalate: ShieldAlert,
  follow_up: Sparkles,
  regenerate: RotateCcw,
  archive_cold: Archive,
  booking_intent_detected: Flag,
  lead_score_hot: Flame,
  fields_extracted: ClipboardList,
};

export function HiluxThreadActivity({ inquiryId }: { inquiryId: string }) {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!inquiryId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("hilux_action_log")
      .select("id, action, detail, created_at")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: true })
      .limit(50);
    setRows((data as LogRow[] | null) ?? []);
  }, [inquiryId]);

  useEffect(() => {
    load();
  }, [load]);

  if (rows === null || rows.length === 0) return null;

  const replyCount = rows.filter((r) => r.action === "reply").length;
  const escalCount = rows.filter((r) => r.action === "escalate").length;
  const hotFlagged = rows.some((r) => r.action === "lead_score_hot");
  const intentDetected = rows.some((r) => r.action === "booking_intent_detected");

  return (
    <div className="mb-3 rounded-xl border border-orange-200/60 bg-orange-50/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-100/50 transition-colors"
        aria-expanded={expanded}
      >
        <ScrollText className="w-3.5 h-3.5 text-orange-600 shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-orange-900">
          HILUX
        </span>
        <span className="text-xs text-orange-900/80 truncate">
          {summaryLine(rows.length, replyCount, escalCount, hotFlagged, intentDetected)}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-orange-700 shrink-0 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded ? (
        <ul className="divide-y divide-orange-200/40 border-t border-orange-200/40 bg-white/40">
          {rows.map((r) => {
            const Icon = ACTION_ICON[r.action] ?? ScrollText;
            const label = ACTION_LABEL[r.action] ?? r.action;
            return (
              <li key={r.id} className="flex items-start gap-2 px-3 py-2">
                <Icon className="w-3 h-3 text-orange-700 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-xs font-medium text-black/85 leading-tight">
                      {label}
                    </p>
                    <p className="text-[10px] text-black/45 tabular-nums shrink-0">
                      {new Date(r.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {r.detail ? (
                    <p className="text-[11px] text-black/60 mt-0.5 leading-snug">
                      {r.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function summaryLine(
  total: number,
  replies: number,
  escalations: number,
  hot: boolean,
  intent: boolean,
): string {
  const parts: string[] = [];
  if (replies > 0) parts.push(`${replies} ${replies === 1 ? "reply" : "replies"}`);
  if (escalations > 0)
    parts.push(`${escalations} escalation${escalations === 1 ? "" : "s"}`);
  if (hot) parts.push("hot lead flagged");
  if (intent) parts.push("booking intent");
  if (parts.length === 0) return `${total} action${total === 1 ? "" : "s"} in this thread`;
  return parts.join(" · ");
}
