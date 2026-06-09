import { useEffect, useMemo, useRef, useState } from "react";
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
const REFRESH_MS = 3000;

function sinceIso(range: Range): string {
  return new Date(Date.now() - RANGE_HOURS[range] * 3600_000).toISOString();
}

function usd(n: number, digits = 4): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// Animates a number from its previous value to a new value over ~600ms.
// Returns the in-progress value to render. Eases out so the final value
// settles smoothly instead of snapping.
function useAnimatedNumber(target: number, durationMs = 600): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const targetRef = useRef(target);

  useEffect(() => {
    if (target === targetRef.current) return;
    fromRef.current = shown;
    targetRef.current = target;
    startRef.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - (startRef.current ?? now);
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const v = fromRef.current + (target - fromRef.current) * eased;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);
  return shown;
}

function pctClass(pct: number): string {
  if (pct >= 75) return "text-emerald-300";
  if (pct >= 50) return "text-amber-300";
  if (pct >= 25) return "text-orange-400";
  return "text-red-400";
}

function MarginBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color =
    pct >= 75 ? "bg-emerald-400" :
    pct >= 50 ? "bg-amber-300" :
    pct >= 25 ? "bg-orange-400" : "bg-red-400";
  return (
    <div className="h-1 w-full rounded-sm bg-emerald-900/40">
      <div
        className={`h-full rounded-sm ${color} transition-[width] duration-500`}
        style={{ width: `${clamped}%`, boxShadow: pct >= 75 ? "0 0 6px rgb(74 222 128 / 0.6)" : undefined }}
      />
    </div>
  );
}

function AnimatedDollar({ value, digits = 4 }: { value: number; digits?: number }) {
  const v = useAnimatedNumber(value);
  return <span className="tabular-nums">{usd(v, digits)}</span>;
}

function AnimatedInt({ value }: { value: number }) {
  const v = useAnimatedNumber(value);
  return <span className="tabular-nums">{Math.round(v).toLocaleString()}</span>;
}

export function CostsPage() {
  const [range, setRange] = useState<Range>("24h");
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const knownIdsRef = useRef<Set<number>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());

  // Reset known-ids when range changes so fresh-flash doesn't fire
  // on rows that were already on screen under a different window.
  useEffect(() => {
    knownIdsRef.current = new Set();
  }, [range]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (paused) return;
      const since = sinceIso(range);
      try {
        const [s, r] = await Promise.all([
          supabase.rpc("admin_cost_summary", { p_since: since }),
          supabase.rpc("admin_cost_recent", { p_since: since, p_limit: 100 }),
        ]);
        if (!alive) return;
        if (s.error) { setError(`summary: ${s.error.message}`); return; }
        if (r.error) { setError(`recent: ${r.error.message}`); return; }
        setError(null);
        const nextSummary = (s.data as SummaryRow[]) ?? [];
        const nextRecent = (r.data as RecentRow[]) ?? [];

        // Flash any txn_ids we hadn't seen on the previous tick.
        const fresh = new Set<number>();
        if (knownIdsRef.current.size > 0) {
          for (const row of nextRecent) {
            if (!knownIdsRef.current.has(row.txn_id)) fresh.add(row.txn_id);
          }
        }
        knownIdsRef.current = new Set(nextRecent.map((r) => r.txn_id));
        setSummary(nextSummary);
        setRecent(nextRecent);
        setLastSync(Date.now());
        if (fresh.size > 0) {
          setFreshIds(fresh);
          setTimeout(() => alive && setFreshIds(new Set()), 1800);
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    };

    void tick();
    timer = setInterval(tick, REFRESH_MS);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [range, paused]);

  const totals = useMemo(() => {
    const rev = summary.reduce((s, r) => s + Number(r.revenue_usd), 0);
    const cogs = summary.reduce((s, r) => s + Number(r.cogs_usd), 0);
    const calls = summary.reduce((s, r) => s + Number(r.call_count), 0);
    return {
      revenue: rev, cogs, margin: rev - cogs,
      marginPct: rev > 0 ? (1 - cogs / rev) * 100 : 0,
      calls,
    };
  }, [summary]);

  return (
    <div
      className="min-h-full font-mono"
      style={{
        background: "#070c08",
        color: "#86efac",
        // Subtle scanline + grid
        backgroundImage:
          "linear-gradient(transparent 49.5%, rgba(74,222,128,0.04) 50%, transparent 50.5%), radial-gradient(rgba(74,222,128,0.06) 1px, transparent 1px)",
        backgroundSize: "100% 4px, 24px 24px",
      }}
    >
      <div className="p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-emerald-200">
              ▌ COSTS / LIVE
            </h1>
            <p className="mt-1 text-xs text-emerald-500/70">
              what each vendor was charged vs. what we paid upstream — refresh {REFRESH_MS / 1000}s
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LiveDot paused={paused} lastSync={lastSync} />
            <button
              onClick={() => setPaused((p) => !p)}
              className={`rounded border border-emerald-600/40 px-3 py-1.5 text-xs uppercase tracking-wider ${
                paused ? "bg-amber-400/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              }`}
            >
              {paused ? "▸ resume" : "❚❚ pause"}
            </button>
            <div className="inline-flex rounded border border-emerald-700/50 bg-emerald-950/40 p-0.5 text-xs">
              {(Object.keys(RANGE_HOURS) as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded px-3 py-1.5 uppercase tracking-wider ${
                    range === r
                      ? "bg-emerald-500 text-emerald-950"
                      : "text-emerald-300 hover:bg-emerald-800/40"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            ! {error}
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="REVENUE / charged" big><AnimatedDollar value={totals.revenue} digits={2} /></MetricCard>
          <MetricCard label="COGS / upstream"><AnimatedDollar value={totals.cogs} digits={4} /></MetricCard>
          <MetricCard label="NET MARGIN" accent={pctClass(totals.marginPct)} big>
            <AnimatedDollar value={totals.margin} digits={2} />
            <span className="ml-2 text-sm opacity-80">{totals.marginPct.toFixed(1)}%</span>
          </MetricCard>
          <MetricCard label="CALLS"><AnimatedInt value={totals.calls} /></MetricCard>
        </div>

        <h2 className="mt-10 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500/70">
          ░ by action_type
        </h2>
        <div className="mt-3 overflow-hidden rounded border border-emerald-700/30 bg-emerald-950/20">
          <table className="w-full text-xs">
            <thead className="border-b border-emerald-700/30 bg-emerald-900/20 text-left uppercase tracking-wider text-emerald-500/70">
              <tr>
                <th className="px-3 py-2">action</th>
                <th className="px-3 py-2 text-right">calls</th>
                <th className="px-3 py-2 text-right">credits</th>
                <th className="px-3 py-2 text-right">revenue</th>
                <th className="px-3 py-2 text-right">cogs</th>
                <th className="px-3 py-2 text-right">margin</th>
                <th className="px-3 py-2 w-40">bar</th>
                <th className="px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-emerald-700/60">
                    {lastSync ? "no traffic in this window" : "loading…"}
                  </td>
                </tr>
              ) : (
                summary.map((row) => (
                  <tr key={row.action_type} className="border-b border-emerald-900/30 last:border-0">
                    <td className="px-3 py-2 text-emerald-200">{row.action_type}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.call_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.credits_consumed}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-200">{usd(Number(row.revenue_usd), 4)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-300/80">{usd(Number(row.cogs_usd), 4)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{usd(Number(row.margin_usd), 4)}</td>
                    <td className="px-3 py-2"><MarginBar pct={Number(row.margin_pct)} /></td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${pctClass(Number(row.margin_pct))}`}>
                      {Number(row.margin_pct).toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500/70">
          ░ recent calls
          {recent.length > 0 ? <span className="ml-2 text-emerald-700/60">({recent.length})</span> : null}
        </h2>
        <div className="mt-3 overflow-hidden rounded border border-emerald-700/30 bg-emerald-950/20">
          <table className="w-full text-xs">
            <thead className="border-b border-emerald-700/30 bg-emerald-900/20 text-left uppercase tracking-wider text-emerald-500/70">
              <tr>
                <th className="px-3 py-2">when</th>
                <th className="px-3 py-2">vendor</th>
                <th className="px-3 py-2">tier</th>
                <th className="px-3 py-2">action</th>
                <th className="px-3 py-2 text-right">cr</th>
                <th className="px-3 py-2 text-right">$/cr</th>
                <th className="px-3 py-2 text-right">revenue</th>
                <th className="px-3 py-2 text-right">cogs</th>
                <th className="px-3 py-2 text-right">margin</th>
                <th className="px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-emerald-700/60">
                    {lastSync ? "no recent calls in this window" : "loading…"}
                  </td>
                </tr>
              ) : (
                recent.map((row) => {
                  const flash = freshIds.has(row.txn_id);
                  return (
                    <tr
                      key={row.txn_id}
                      className={`border-b border-emerald-900/30 last:border-0 transition-colors duration-700 ${
                        flash ? "bg-emerald-400/15" : ""
                      }`}
                      style={flash ? { animation: "matrixflash 1.6s ease-out" } : undefined}
                    >
                      <td className="px-3 py-1.5 text-emerald-500/80">
                        {new Date(row.created_at).toLocaleTimeString(undefined, {
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-1.5 text-emerald-200">{row.user_email ?? row.user_id.slice(0, 8)}</td>
                      <td className="px-3 py-1.5 text-emerald-500/70">{row.user_tier ?? "free"}</td>
                      <td className="px-3 py-1.5">{row.action_type}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.credits}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-500/70">{usd(Number(row.usd_per_credit), 4)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-200">{usd(Number(row.revenue_usd), 4)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-amber-300/80">{usd(Number(row.cogs_usd), 4)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{usd(Number(row.margin_usd), 4)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${pctClass(Number(row.margin_pct))}`}>
                        {Number(row.margin_pct).toFixed(0)}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <style>{`
        @keyframes matrixflash {
          0%   { background-color: rgba(74,222,128,0.45); box-shadow: inset 0 0 12px rgba(74,222,128,0.6); }
          100% { background-color: rgba(74,222,128,0); box-shadow: inset 0 0 0 rgba(0,0,0,0); }
        }
        @keyframes livepulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 4px rgb(74,222,128); }
          50%       { opacity: 0.4; box-shadow: 0 0 12px rgb(74,222,128); }
        }
      `}</style>
    </div>
  );
}

function MetricCard({
  label, children, hint, accent, big,
}: { label: string; children: React.ReactNode; hint?: string; accent?: string; big?: boolean }) {
  return (
    <div className="rounded border border-emerald-700/30 bg-emerald-950/30 p-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-500/70">{label}</p>
      <p className={`mt-2 ${big ? "text-3xl" : "text-2xl"} font-semibold ${accent ?? "text-emerald-200"}`}
         style={{ textShadow: "0 0 8px rgba(74,222,128,0.25)" }}>
        {children}
      </p>
      {hint ? <p className="mt-1 text-[10px] text-emerald-700/70">{hint}</p> : null}
    </div>
  );
}

function LiveDot({ paused, lastSync }: { paused: boolean; lastSync: number | null }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secondsAgo = lastSync ? Math.max(0, Math.floor((Date.now() - lastSync) / 1000)) : null;
  // Reference tick so the secondsAgo label re-renders each second.
  void tick;
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-emerald-500/80">
      <span
        className={`inline-block h-2 w-2 rounded-full ${paused ? "bg-amber-400" : "bg-emerald-400"}`}
        style={!paused ? { animation: "livepulse 1.6s ease-in-out infinite" } : undefined}
      />
      {paused ? "paused" : secondsAgo == null ? "syncing…" : `live · ${secondsAgo}s ago`}
    </div>
  );
}
