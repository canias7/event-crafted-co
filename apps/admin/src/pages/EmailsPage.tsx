import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Email deliverability view — mirrors Resend's Emails table (To · Status ·
// Subject · Sent). Backed by admin_recent_email_events(), which rolls the
// multiple Resend events per message up to its latest status. Requires the
// Resend webhook to be wired to the resend-webhook function (populates
// public.email_events).

type EmailRow = {
  resend_email_id: string;
  recipient_email: string | null;
  subject: string | null;
  latest_status: string; // e.g. "email.delivered"
  last_event_at: string;
  event_count: number;
};

const RANGES = [
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
  { label: "Last 30 days", hours: 24 * 30 },
] as const;

// Resend event_type ("email.delivered") → short label + pill colors.
function statusMeta(raw: string): { label: string; cls: string } {
  const s = raw.replace(/^email\./, "");
  const map: Record<string, { label: string; cls: string }> = {
    delivered: { label: "Delivered", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    sent: { label: "Sent", cls: "bg-slate-50 text-slate-600 border-slate-200" },
    delivery_delayed: { label: "Delivery Delayed", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    bounced: { label: "Bounced", cls: "bg-red-50 text-red-700 border-red-200" },
    complained: { label: "Complained", cls: "bg-red-50 text-red-700 border-red-200" },
    failed: { label: "Failed", cls: "bg-red-50 text-red-700 border-red-200" },
    opened: { label: "Opened", cls: "bg-sky-50 text-sky-700 border-sky-200" },
    clicked: { label: "Clicked", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  };
  return (
    map[s] ?? {
      label: s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      cls: "bg-slate-50 text-slate-600 border-slate-200",
    }
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `about ${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function EmailsPage() {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeIdx, setRangeIdx] = useState(1); // default Last 7 days
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - RANGES[rangeIdx].hours * 3600 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_recent_email_events", {
      p_limit: 500,
      p_since: since,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as EmailRow[]);
  }, [rangeIdx]);

  useEffect(() => {
    void load();
  }, [load]);

  // Distinct statuses present, for the filter dropdown.
  const statuses = useMemo(() => {
    const set = new Set(rows.map((r) => r.latest_status.replace(/^email\./, "")));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.latest_status.replace(/^email\./, "") !== status) return false;
      if (!q) return true;
      return (
        (r.recipient_email ?? "").toLowerCase().includes(q) ||
        (r.subject ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, status]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Emails</h1>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-sm text-ink/70 hover:bg-ink/5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <p className="mt-1 text-sm text-ink/50">
        Delivery status for every email the platform sent (via Resend).
      </p>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by recipient or subject…"
            className="w-full rounded-lg border border-ink/15 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-ink/40"
          />
        </div>
        <select
          value={rangeIdx}
          onChange={(e) => setRangeIdx(Number(e.target.value))}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-ink/40"
        >
          {RANGES.map((r, i) => (
            <option key={r.label} value={i}>{r.label}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-ink/40"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{statusMeta(s).label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-ink/10 bg-white">
        <div className="grid grid-cols-[1.4fr_140px_2fr_140px] gap-3 border-b border-ink/10 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink/50">
          <div>To</div>
          <div>Status</div>
          <div>Subject</div>
          <div className="text-right">Sent</div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-ink/50">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink/50">
            {rows.length === 0
              ? "No email events yet. (Once the Resend webhook is wired to resend-webhook, sends show up here.)"
              : "No emails match your filters."}
          </div>
        ) : (
          filtered.map((r) => {
            const m = statusMeta(r.latest_status);
            return (
              <div
                key={r.resend_email_id}
                className="grid grid-cols-[1.4fr_140px_2fr_140px] items-center gap-3 border-b border-ink/5 px-4 py-3 text-sm last:border-0 hover:bg-ink/[0.02]"
              >
                <div className="truncate text-ink/80">{r.recipient_email ?? "—"}</div>
                <div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${m.cls}`}>
                    {m.label}
                  </span>
                </div>
                <div className="truncate text-ink/70" title={r.subject ?? ""}>
                  {r.subject ?? "—"}
                </div>
                <div className="text-right text-xs text-ink/50">{timeAgo(r.last_event_at)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
