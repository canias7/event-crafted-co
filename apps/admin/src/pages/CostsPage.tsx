import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Range = "24h" | "7d" | "30d";

interface SummaryRow {
  action_type: string;
  call_count: number;
  credits_consumed: number;
  revenue_usd: number;
  cogs_usd: number;
  margin_usd: number;
  margin_pct: number;
}

interface RecentRow {
  txn_id: number;
  created_at: string;
  user_id: string;
  user_email: string | null;
  user_tier: string | null;
  action_type: string;
  credits: number;
  usd_per_credit: number;
  revenue_usd: number;
  cogs_usd: number;
  margin_usd: number;
  margin_pct: number;
  ref_id: string | null;
}

const RANGE_HOURS: Record<Range, number> = { "24h": 24, "7d": 168, "30d": 720 };

function sinceIso(range: Range): string {
  return new Date(Date.now() - RANGE_HOURS[range] * 3600_000).toISOString();
}

function usd(n: number | null | undefined, digits = 4): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function pctClass(pct: number): string {
  if (pct >= 75) return "text-green-700";
  if (pct >= 50) return "text-amber-700";
  return "text-red-700";
}

export function CostsPage() {
  const [range, setRange] = useState<Range>("7d");
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const since = sinceIso(range);
    Promise.all([
      supabase.rpc("admin_cost_summary", { p_since: since }),
      supabase.rpc("admin_cost_recent", { p_since: since, p_limit: 100 }),
    ])
      .then(([s, r]) => {
        if (!alive) return;
        if (s.error) setError(`summary: ${s.error.message}`);
        else if (r.error) setError(`recent: ${r.error.message}`);
        else {
          setSummary((s.data as SummaryRow[]) ?? []);
          setRecent((r.data as RecentRow[]) ?? []);
        }
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [range]);

  const totals = useMemo(() => {
    const rev = summary.reduce((s, r) => s + Number(r.revenue_usd), 0);
    const cogs = summary.reduce((s, r) => s + Number(r.cogs_usd), 0);
    const calls = summary.reduce((s, r) => s + Number(r.call_count), 0);
    return {
      revenue: rev,
      cogs,
      margin: rev - cogs,
      marginPct: rev > 0 ? (1 - cogs / rev) * 100 : 0,
      calls,
    };
  }, [summary]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Costs</h1>
          <p className="mt-1 text-sm text-ink/60">
            Live per-call P&amp;L — what each vendor was charged in credits vs. what we paid upstream.
          </p>
        </div>
        <div className="inline-flex rounded border border-ink/10 bg-white p-0.5 text-sm">
          {(Object.keys(RANGE_HOURS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-3 py-1.5 ${
                range === r
                  ? "bg-ink text-white"
                  : "text-ink/60 hover:bg-ink/5"
              }`}
            >
              Last {r}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TopCard label="Revenue (credits charged)" value={usd(totals.revenue, 2)} hint={`${totals.calls} call${totals.calls === 1 ? "" : "s"}`} />
        <TopCard label="COGS (paid upstream)" value={usd(totals.cogs, 4)} />
        <TopCard
          label="Net margin"
          value={usd(totals.margin, 2)}
          hint={`${totals.marginPct.toFixed(1)}% blended`}
          accent={pctClass(totals.marginPct)}
        />
        <TopCard label="Telemetry rows" value={String(recent.length)} hint="recent calls below" />
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-ink/60">
        By action type
      </h2>
      <div className="mt-3 overflow-hidden rounded border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-ink/10 bg-ink/[0.02] text-left text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2 text-right">Calls</th>
              <th className="px-3 py-2 text-right">Credits</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">COGS</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2 text-right">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {loading && summary.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ink/40">
                  Loading…
                </td>
              </tr>
            ) : summary.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ink/40">
                  No traffic in this window.
                </td>
              </tr>
            ) : (
              summary.map((row) => (
                <tr key={row.action_type} className="border-b border-ink/5 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{row.action_type}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.call_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.credits_consumed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(Number(row.revenue_usd), 4)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(Number(row.cogs_usd), 4)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(Number(row.margin_usd), 4)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${pctClass(Number(row.margin_pct))}`}>
                    {Number(row.margin_pct).toFixed(1)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-ink/60">
        Recent calls
      </h2>
      <div className="mt-3 overflow-hidden rounded border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-ink/10 bg-ink/[0.02] text-left text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2 text-right">Cr</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">COGS</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && !loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-ink/40">
                  No recent calls in this window.
                </td>
              </tr>
            ) : (
              recent.map((row) => (
                <tr key={row.txn_id} className="border-b border-ink/5 last:border-0">
                  <td className="px-3 py-2 text-xs text-ink/60">
                    {new Date(row.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.user_email ?? row.user_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-xs text-ink/60">{row.user_tier ?? "free"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.action_type}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.credits}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(Number(row.revenue_usd), 4)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(Number(row.cogs_usd), 4)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(Number(row.margin_usd), 4)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${pctClass(Number(row.margin_pct))}`}>
                    {Number(row.margin_pct).toFixed(0)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded border border-ink/10 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink/50">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${accent ?? ""}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/40">{hint}</p> : null}
    </div>
  );
}
