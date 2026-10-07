import { useEffect, useMemo, useState } from "react";
import {
  SITE,
  VARIANTS,
  describeVerdict,
  formatChance,
  loadHomeTest,
  loadHomeTestClicks,
  pct,
  verdict,
  type Range,
  type Variant,
  type VariantStats,
} from "@/lib/homeTest";

// Homepage A/B test: version A vs B vs C of the section under the
// website's hero, side by side, and which one gets the most people to
// register. Numbers and the verdict come from lib/homeTest.

type ClickRow = Awaited<ReturnType<typeof loadHomeTestClicks>>[number];

const RANGES: { id: Range; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "30d", label: "30 days" },
  { id: "7d", label: "7 days" },
];

// One line of the comparison: a label, a short "what it means", and the
// number (plus a small note) for each version.
interface Row {
  label: string;
  hint: string;
  value: (s: VariantStats) => number;
  note?: (s: VariantStats) => string;
  show?: (s: VariantStats) => string;
  sub?: boolean;
  main?: boolean;
}

const ROWS: Row[] = [
  { label: "Total visitors", hint: "got this version", value: (s) => s.visitors },
  {
    label: "Section views",
    hint: "scrolled down to it",
    value: (s) => s.sectionViewers,
    note: (s) => pct(s.sectionViewers, s.visitors),
  },
  {
    label: "Interactions",
    hint: "category, event-type and link clicks",
    value: (s) => s.interactions,
    note: (s) =>
      s.variant === "c"
        ? "nothing to click but the main button"
        : `${s.interactors.toLocaleString()} ${s.interactors === 1 ? "person" : "people"}`,
  },
  {
    label: "CTA clicks",
    hint: "the main button",
    value: (s) => s.ctaClicks,
    note: (s) => `${s.ctaClickers.toLocaleString()} ${s.ctaClickers === 1 ? "person" : "people"}`,
  },
  {
    label: "Registrations started",
    hint: "opened the sign-up form",
    value: (s) => s.registrationStarters,
    note: (s) => pct(s.registrationStarters, s.visitors),
  },
  { label: "Registrations completed", hint: "new accounts", value: (s) => s.registrations },
  { label: "Vendors", hint: "vendor accounts", value: (s) => s.vendorRegistrations, sub: true },
  { label: "Hosts / users", hint: "host accounts", value: (s) => s.hostRegistrations, sub: true },
  {
    label: "Registration conversion rate",
    hint: "completed registrations ÷ visitors",
    value: (s) => (s.visitors > 0 ? s.registrations / s.visitors : -1),
    show: (s) => pct(s.registrations, s.visitors),
    main: true,
  },
];

export function HomepageTestPage() {
  const [range, setRange] = useState<Range>("all");
  const [stats, setStats] = useState<VariantStats[] | null>(null);
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setStats(null);
    Promise.all([loadHomeTest(range), loadHomeTestClicks(range)])
      .then(([s, c]) => {
        if (!alive) return;
        setError(null);
        setStats(s);
        setClicks(c);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message || "Couldn't load the results.");
        setStats([]);
      });
    return () => {
      alive = false;
    };
  }, [range]);

  const result = useMemo(() => (stats?.length ? verdict(stats) : null), [stats]);
  const words = result ? describeVerdict(result) : null;
  const leader = result && result.status !== "no-data" && result.status !== "waiting" ? result.leader : null;
  const decided = result?.status === "winner";

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Homepage A/B test</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            Which version of the section under the homepage hero gets the most people to register.
            Each new visitor gets version A, B or C at random (about a third each) and keeps it.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-ink/10 bg-white p-1 text-sm">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`rounded-md px-3 py-1.5 ${range === r.id ? "bg-ink text-white" : "text-ink/70 hover:bg-ink/5"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {/* The answer first: who's winning, by how much, how sure. */}
      <div
        className={`mt-6 rounded-lg border p-5 ${decided ? "border-emerald-300 bg-emerald-50" : "border-ink/10 bg-white"}`}
      >
        {words ? (
          <>
            <p className="text-lg font-semibold">{words.title}</p>
            <p className="mt-1 text-sm">{words.detail}</p>
            {words.note ? <p className="mt-1 text-sm text-ink/60">{words.note}</p> : null}
          </>
        ) : (
          <p className="text-sm text-ink/60">{stats ? "No results." : "Loading…"}</p>
        )}
      </div>

      {/* Version A vs B vs C. */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-ink/10 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-ink/10">
              <th className="w-[34%] p-4 text-left align-bottom text-xs font-normal uppercase tracking-wide text-ink/50">
                Version A vs. B vs. C
              </th>
              {VARIANTS.map((v) => (
                <th
                  key={v.id}
                  className={`p-4 text-left align-bottom font-normal ${leader === v.id ? "bg-emerald-50/70" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">Version {v.id.toUpperCase()}</span>
                    {leader === v.id ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        {decided ? "Winner" : "Leading"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-ink/60">{v.name}</p>
                  <a
                    href={`${SITE}/?home=${v.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-ink/50 underline hover:text-ink"
                  >
                    Preview ↗
                  </a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <ComparisonRow key={row.label} row={row} stats={stats} leader={leader} />
            ))}
            <tr className="border-t border-ink/10">
              <RowLabel label="Chance of being best" hint="based on the conversion rate" />
              {VARIANTS.map((v) => (
                <td key={v.id} className={`p-4 font-mono ${leader === v.id ? "bg-emerald-50/70" : ""}`}>
                  {result?.basis === "registrations" ? formatChance(result.chance[v.id]) : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 max-w-3xl space-y-1 text-xs text-ink/50">
        <p>
          Counts only visitors who chose “Accept all” in the website's cookie banner. Each visitor keeps
          their version, so each column is a different group of people.
        </p>
        <p>
          Completed registrations are real accounts created after the visitor got that version, split by
          account type. The best version is the one with the highest registration conversion rate;
          “chance of being best” says how sure that is, and 95% or more makes it the winner.
        </p>
        <p>30 and 7 days cover the visitors who first got a version in that time, and what they did since.</p>
      </div>

      <h2 className="mt-10 text-lg font-semibold">What people clicked</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {VARIANTS.map((v) => {
          const list = clicks.filter((c) => c.variant === v.id);
          return (
            <div key={v.id} className="rounded-lg border border-ink/10 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-ink/50">
                Version {v.id.toUpperCase()} · {v.name}
              </p>
              {list.length === 0 ? (
                <p className="mt-3 text-sm text-ink/50">{stats ? "No clicks yet." : "Loading…"}</p>
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

function RowLabel({ label, hint, sub, main }: { label: string; hint: string; sub?: boolean; main?: boolean }) {
  return (
    <th className={`p-4 text-left align-top font-normal ${sub ? "pl-8" : ""}`}>
      <span className={main ? "font-semibold" : sub ? "text-ink/80" : "font-medium"}>{label}</span>
      <span className="block text-xs text-ink/50">{hint}</span>
    </th>
  );
}

function ComparisonRow({
  row,
  stats,
  leader,
}: {
  row: Row;
  stats: VariantStats[] | null;
  leader: Variant | null;
}) {
  // The headline rate is bold for the best version (raw counts aren't:
  // more visitors means more of everything).
  const best = stats && row.main ? Math.max(...stats.map(row.value)) : 0;
  return (
    <tr className={`border-t border-ink/5 ${row.main ? "bg-bone" : ""}`}>
      <RowLabel label={row.label} hint={row.hint} sub={row.sub} main={row.main} />
      {(stats ?? VARIANTS.map(() => null)).map((s, i) => (
        <td
          key={VARIANTS[i].id}
          className={`p-4 align-top ${leader === VARIANTS[i].id ? "bg-emerald-50/70" : ""}`}
        >
          {s ? (
            <Cell
              text={row.show ? row.show(s) : row.value(s).toLocaleString()}
              note={row.note?.(s)}
              strong={best > 0 && row.value(s) === best}
              big={row.main}
            />
          ) : (
            <span className="text-ink/40">…</span>
          )}
        </td>
      ))}
    </tr>
  );
}

function Cell({ text, note, strong, big }: { text: string; note?: string; strong: boolean; big?: boolean }) {
  return (
    <div>
      <span className={`font-mono ${big ? "text-xl" : "text-base"} ${strong ? "font-semibold" : ""}`}>{text}</span>
      {note ? <span className="block text-xs text-ink/50">{note}</span> : null}
    </div>
  );
}

// "tile:venues" → "Tile: venues", "category:Florists" → "Category chip: Florists".
function describe(row: ClickRow): string {
  if (row.event === "select") return `Picked event type: ${row.detail}`;
  if (row.detail === "cta") return "Main button";
  const [kind, ...rest] = row.detail.split(":");
  const value = rest.join(":");
  const label: Record<string, string> = { tile: "Tile", category: "Category chip", explore: "Explore link" };
  return value ? `${label[kind] ?? kind}: ${value}` : row.detail;
}
