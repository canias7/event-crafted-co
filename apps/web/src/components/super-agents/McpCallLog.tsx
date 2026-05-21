// MCP tool-call log. Reads mcp_call_log via RLS (vendor sees own
// rows only) and renders the 25 most-recent entries Claude made
// via the connector. Lives inside VendoraForClaudePanel.

import { useCallback, useEffect, useState } from "react";
import { Activity, Check, ChevronDown, Loader2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LogRow {
  id: string;
  client_id: string | null;
  auth_method: "oauth" | "pat";
  tool_name: string;
  args: Record<string, unknown> | null;
  ok: boolean;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

const PAGE_SIZE = 25;

export function McpCallLog() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("mcp_call_log")
      .select("id, client_id, auth_method, tool_name, args, ok, error, duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    setLoading(false);
    if (error) {
      console.error("[McpCallLog] load failed", error);
      toast.error("Couldn't load Claude activity.");
      return;
    }
    setRows(((data as LogRow[] | null) ?? []));
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div>
          <p className="text-sm font-medium text-black mb-0.5 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-black/55" />
            Claude activity
          </p>
          <p className="text-xs text-black/55">
            What Claude has called via this connector (last {PAGE_SIZE}).
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1.5 text-[11px] text-black/65 hover:text-black/95 disabled:opacity-40 transition-colors"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Refresh
        </button>
      </div>
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-black/40" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-xs text-black/55 border border-dashed border-black/15 rounded-lg bg-white/40">
          No calls yet. Once you connect this MCP to Claude and Claude uses a tool, the call will show up here.
        </div>
      ) : (
        <ul className="divide-y divide-black/10 rounded-xl bg-white/45 border border-black/5 overflow-hidden">
          {rows.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <li key={r.id} className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="flex items-start gap-3 w-full text-left"
                >
                  {r.ok ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <code className="text-xs font-mono text-black/85 leading-tight">
                        {r.tool_name}
                      </code>
                      <span className="inline-flex items-center text-[9px] uppercase tracking-wider font-medium px-1 py-0 rounded bg-black/10 text-black/55">
                        {r.auth_method}
                      </span>
                      <p className="text-[10px] text-black/45 tabular-nums">
                        {formatRelative(r.created_at)}
                      </p>
                      {r.duration_ms != null ? (
                        <p className="text-[10px] text-black/45 tabular-nums">
                          {r.duration_ms}ms
                        </p>
                      ) : null}
                    </div>
                    {!r.ok && r.error ? (
                      <p className="text-[11px] text-red-600 mt-0.5 leading-snug truncate">
                        {r.error}
                      </p>
                    ) : null}
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-black/40 shrink-0 mt-0.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen ? (
                  <div className="mt-2 ml-6 rounded-md bg-black/5 p-2 text-[11px] font-mono text-black/75 break-all whitespace-pre-wrap">
                    {Object.keys(r.args ?? {}).length === 0
                      ? "(no arguments)"
                      : JSON.stringify(r.args, null, 2)}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
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
