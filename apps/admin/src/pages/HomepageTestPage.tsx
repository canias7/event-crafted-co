import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

// Results of the homepage A/B/C test: the section under the website's
// hero comes in three versions, each new visitor gets one at random and
// keeps it. Only visitors who accepted analytics cookies are counted.
// Data: home_experiment_summary() / home_experiment_clicks() (admin only).

type Variant = "a" | "b" | "c";
type Range = "all" | "30d" | "7d";

interface SummaryRow {
  variant: Variant;
  visitors: number;
  viewers: number;
  clickers: number;
  clicks: number;
  signups: number;
}

interface ClickRow {
  variant: Variant;
  event: "click" | "select";
  detail: string;
  total: number;
  visitors: number;
}

const VARIANTS: { id: Variant; name: string; about: string }[] = [
  { id: "a", name: "A · Category showcase", about: "Five photo tiles: venues, food, entertainment, decor, photography." },
  { id: "b", name: "B · What are you planning?", about: "Pick an event type; see its photo and vendor categories." },
  { id: "c", name: "C · How it works", about: "Plan. Connect. Celebrate. Three steps on photos." },
];

const RANGE_DAYS: Record<Exclude<Range, "all">, number> = { "30d": 30, "7d": 7 };

const SITE = "https://eventvendora.com";

function since(range: Range): string | null {
  return range === "all" ? null : new Date(Date.now() - RANGE_DAYS[range] * 86_400_000).toISOString();
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}

// Half-width of the 95% Wilson interval, in percentage points: how far
// the true rate could be from the one shown, given the sample size.
function margin(part: number, whole: number): string {
  if (whole === 0) return "";
  const z = 1.96;
  const p = part / whole;
  const denom = 1 + (z * z) / whole;
  const half = (z * Math.sqrt((p * (1 - p)) / whole + (z * z) / (4 * whole * whole))) / denom;
  return `±${(half * 100).toFixed(1)}`;
}

// "tile:venues" → "Tile: venues", "category:Florists" → "Category: Florists".
function describe(row: ClickRow): string {
  if (row.event === "select") return `Picked event type: ${row.detail}`;
  if (row.detail === "cta") return "Main button";
  const [kind, ...rest] = row.detail.split(":");
  const value = rest.join(":");
  const label: Record<string, string> = { tile: "Tile", category: "Category chip", explore: "Explore link" };
  return value ? `${label[kind] ?? kind}: ${value}` : row.detail;
}

export function HomepageTestPage() {
  const [range, setRange] = useState<Range>("all");
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSummary(null);
    (async () => {
      const args = { p_experiment: "home_section_v1", p_since: since(range) };
      const [s, c] = await Promise.all([
        supabase.rpc("home_experiment_summary", args),
        supabase.rpc("home_experiment_clicks", args),
      ]);
      if (!alive) return;
      if (s.error || c.error) {
        setError((s.error ?? c.error)?.message ?? "Couldn't load the results.");
        setSummary([]);
        return;
      }
      setError(null);
      setSummary(((s.data as SummaryRow[]) ?? []).map((r) => ({
        ...r,
        visitors: Number(r.visitors),
        viewers: Number(r.viewers),
        clickers: Number(r.clickers),
        clicks: Number(r.clicks),
        signups: Number(r.signups),
      })));
      setClicks(((c.data as ClickRow[]) ?? []).map((r) => ({ ...r, total: Number(r.total), visitors: Number(r.visitors) })));
    })();
    return () => {
      alive = false;
    };
  }, [range]);

  const rows = useMemo(
    () =>
      VARIANTS.map((v) => ({
        ...v,
        data: summary?.find((r) => r.variant === v.id) ?? {
          variant: v.id,
          visitors: 0,
          viewers: 0,
          clickers: 0,
          clicks: 0,
          signups: 0,
        },
      })),
    [summary],
  );

  const leader = useMemo(() => {
    const rated = rows.filter((r) => r.data.viewers > 0);
    if (rated.length < 2) return null;
    return rated.reduce((best, r) =>
      r.data.clickers / r.data.viewers > best.data.clickers / best.data.viewers ? r : best,
    ).id;
  }, [rows]);

  const totalViewers = rows.reduce((sum, r) => sum + r.data.viewers, 0);

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Homepage test</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            The section under the homepage hero has three versions. Each new visitor gets one at
            random (about a third each) and keeps it on every return visit. Counts include only
            visitors who accepted analytics cookies.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-ink/10 bg-white p-1 text-sm">
          {(["all", "30d", "7d"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1.5 ${range === r ? "bg-ink text-white" : "text-ink/70 hover:bg-ink/5"}`}
            >
              {r === "all" ? "All time" : r === "30d" ? "30 days" : "7 days"}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {rows.map((r) => (
          <div
            key={r.id}
            className={`rounded-lg border bg-white p-4 ${leader === r.id ? "border-emerald-500" : "border-ink/10"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{r.name}</p>
              {leader === r.id ? (
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Leading
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-ink/50">{r.about}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Saw it" value={summary ? r.data.viewers : undefined} />
              <Metric label="Clicked something" value={summary ? r.data.clickers : undefined} />
              <Metric
                label="Click rate"
                text={summary ? pct(r.data.clickers, r.data.viewers) : undefined}
                note={summary ? margin(r.data.clickers, r.data.viewers) : undefined}
              />
              <Metric
                label="Sign-ups"
                value={summary ? r.data.signups : undefined}
                note={summary && r.data.viewers ? pct(r.data.signups, r.data.viewers) : undefined}
              />
            </dl>
            <a
              href={`${SITE}/?home=${r.id}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-xs text-ink/60 underline hover:text-ink"
            >
              Preview version {r.id.toUpperCase()}
            </a>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-ink/50">
        {totalViewers < 300
          ? "Early days: with fewer than about 100 visitors per version, differences are mostly noise. "
          : ""}
        Click rate = visitors who clicked anything in the section ÷ visitors who saw it; ± is the 95%
        margin. A version is clearly ahead when its range doesn't overlap the others'. Sign-ups count
        visitors who created an account after seeing their version. Preview links don't change
        anyone's version and aren't counted.
      </p>

      <h2 className="mt-10 text-lg font-semibold">What people clicked</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {VARIANTS.map((v) => {
          const list = clicks.filter((c) => c.variant === v.id);
          return (
            <div key={v.id} className="rounded-lg border border-ink/10 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-ink/50">{v.name}</p>
              {list.length === 0 ? (
                <p className="mt-3 text-sm text-ink/50">{summary ? "No clicks yet." : "Loading…"}</p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink/50">
                      <th className="pb-1 font-normal">Item</th>
                      <th className="pb-1 text-right font-normal">Clicks</th>
                      <th className="pb-1 text-right font-normal">People</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={`${c.event}:${c.detail}`} className="border-t border-ink/5">
                        <td className="py-1.5 pr-2">{describe(c)}</td>
                        <td className="py-1.5 text-right font-mono">{c.total}</td>
                        <td className="py-1.5 text-right font-mono">{c.visitors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  text,
  note,
}: {
  label: string;
  value?: number;
  text?: string;
  note?: string;
}) {
  const shown = text ?? (value === undefined ? undefined : value.toLocaleString());
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink/50">{label}</dt>
      <dd className="mt-1 font-mono text-2xl">
        {shown ?? "—"}
        {note ? <span className="ml-1.5 text-xs text-ink/50">{note}</span> : null}
      </dd>
    </div>
  );
}
