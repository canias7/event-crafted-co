// HILUX summary card shown on the vendor's "My Profile" home page.
// Compact view: status chip + 24h activity (replies, escalations,
// hot leads, booking-intent) + a quick-link to the agent settings.
//
// Data sources:
//   - profiles.hilux_enabled  — master status
//   - hilux_action_log         — reply / escalate / hot-lead counts (24h)
// Both read under the caller's RLS; no service-role needed.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Flame,
  Loader2,
  Pause,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { HiluxLogo } from "./AgentLogos";

interface Stats {
  replies: number;
  escalations: number;
  hotLeads: number;
  bookingIntent: number;
}

const ZERO_STATS: Stats = {
  replies: 0,
  escalations: 0,
  hotLeads: 0,
  bookingIntent: 0,
};

export function HiluxHomeSummary() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hiluxEnabled, setHiluxEnabled] = useState<boolean | null>(null);
  const [logActionsOn, setLogActionsOn] = useState(false);
  const [stats, setStats] = useState<Stats>(ZERO_STATS);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [profRes, logRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("hilux_enabled, hilux_action_log_actions")
        .eq("id", user.id)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("hilux_action_log")
        .select("action")
        .gte("created_at", since)
        .limit(1000),
    ]);
    const prof = (profRes.data ?? null) as {
      hilux_enabled?: boolean;
      hilux_action_log_actions?: boolean;
    } | null;
    setHiluxEnabled(prof?.hilux_enabled ?? false);
    setLogActionsOn(prof?.hilux_action_log_actions === true);

    const rows = ((logRes.data ?? []) as Array<{ action: string }>);
    const s: Stats = { ...ZERO_STATS };
    for (const r of rows) {
      if (r.action === "reply") s.replies++;
      else if (r.action === "escalate") s.escalations++;
      else if (r.action === "lead_score_hot") s.hotLeads++;
      else if (r.action === "booking_intent_detected") s.bookingIntent++;
    }
    setStats(s);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && hiluxEnabled === null) {
    return (
      <div className="rounded-2xl border border-black/5 bg-white/55 p-5 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-black/40" />
        <p className="text-sm text-black/55">Loading HILUX status…</p>
      </div>
    );
  }

  const totalActions =
    stats.replies + stats.escalations + stats.hotLeads + stats.bookingIntent;

  return (
    <div className="rounded-2xl border border-black/5 bg-gradient-to-br from-white/70 to-orange-50/40 p-5 backdrop-blur-sm shadow-[0_4px_24px_-12px_rgba(0,0,0,0.1)]">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl overflow-hidden ring-1 ring-black/5 shrink-0">
          <HiluxLogo className="w-full h-full block" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-editorial text-xl text-black leading-tight">
              HILUX
            </h3>
            <span
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full"
              style={
                hiluxEnabled
                  ? { background: "rgba(255, 138, 76, 0.15)", color: "#c4541e" }
                  : { background: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.55)" }
              }
            >
              {hiluxEnabled ? (
                <>
                  <Sparkles className="w-2.5 h-2.5" /> Always on
                </>
              ) : (
                <>
                  <Pause className="w-2.5 h-2.5" /> Paused
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-black/55 mt-1">
            {hiluxEnabled
              ? "Auto-replying to host inquiries in your voice."
              : "Flip on in agent settings to start auto-replying."}
          </p>
        </div>
        <Link
          to="/vendor/ai-superagents"
          className="shrink-0 inline-flex items-center gap-1 text-[12px] text-black/65 hover:text-black/95 transition-colors"
        >
          Manage
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {hiluxEnabled ? (
        logActionsOn ? (
          <div className="mt-4 grid grid-cols-4 gap-2">
            <StatTile icon={Send} value={stats.replies} label="Replies" tone="default" />
            <StatTile icon={ShieldAlert} value={stats.escalations} label="Escalations" tone="default" />
            <StatTile icon={Flame} value={stats.hotLeads} label="Hot leads" tone="hot" />
            <StatTile icon={Sparkles} value={stats.bookingIntent} label="Booking intent" tone="default" />
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-black/15 px-3 py-2.5 bg-white/40">
            <p className="text-[11px] text-black/55">
              Turn on <strong className="text-black/75">Log every HILUX action</strong> in agent settings to see last-24h activity here.
            </p>
          </div>
        )
      ) : null}

      {hiluxEnabled && logActionsOn && totalActions === 0 ? (
        <p className="text-[11px] text-black/45 mt-2">
          No activity yet in the last 24 hours.
        </p>
      ) : null}
    </div>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Send;
  value: number;
  label: string;
  tone: "default" | "hot";
}) {
  const isHot = tone === "hot" && value > 0;
  return (
    <div
      className="rounded-lg border border-black/5 bg-white/65 px-3 py-2.5"
      style={isHot ? { background: "rgba(244, 63, 94, 0.08)" } : undefined}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3 h-3 ${isHot ? "text-rose-600" : "text-black/50"}`} />
        <span className={`text-[10px] uppercase tracking-wider font-medium ${isHot ? "text-rose-700" : "text-black/55"}`}>
          {label}
        </span>
      </div>
      <p className={`text-2xl font-medium tabular-nums mt-1 ${isHot ? "text-rose-700" : "text-black/85"}`}>
        {value}
      </p>
    </div>
  );
}
