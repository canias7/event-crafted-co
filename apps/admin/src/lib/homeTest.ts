import { supabase } from "@/lib/supabase";

// The homepage A/B/C test (the section under the website's hero; see the
// website's lib/homeExperiment.ts). Numbers come from
// home_experiment_summary(): the visitors who first got each version in the
// chosen period and what they did since. A completed registration is an
// account created after the visitor got their version (the version is
// saved with the account at sign-up); vendor or host is the account's role.
// Only visitors who accepted analytics cookies are counted.

export type Variant = "a" | "b" | "c";
export type Range = "all" | "30d" | "7d";

export interface VariantStats {
  variant: Variant;
  visitors: number;
  sectionViewers: number;
  interactions: number;
  interactors: number;
  ctaClicks: number;
  ctaClickers: number;
  registrationStarters: number;
  registrations: number;
  vendorRegistrations: number;
  hostRegistrations: number;
}

export const VARIANTS: { id: Variant; name: string; about: string }[] = [
  { id: "a", name: "Category showcase", about: "Five photo tiles: venues, food, entertainment, decor, photography." },
  { id: "b", name: "What are you planning?", about: "Pick an event type; see its photo and vendor categories." },
  { id: "c", name: "How it works", about: "Plan. Connect. Celebrate. Three steps on photos." },
];

export const SITE = "https://eventvendora.com";

const RANGE_DAYS: Record<Exclude<Range, "all">, number> = { "30d": 30, "7d": 7 };

function since(range: Range): string | null {
  return range === "all" ? null : new Date(Date.now() - RANGE_DAYS[range] * 86_400_000).toISOString();
}

const empty = (variant: Variant): VariantStats => ({
  variant,
  visitors: 0,
  sectionViewers: 0,
  interactions: 0,
  interactors: 0,
  ctaClicks: 0,
  ctaClickers: 0,
  registrationStarters: 0,
  registrations: 0,
  vendorRegistrations: 0,
  hostRegistrations: 0,
});

/** One row per version, A to C (zeros for a version nobody has got yet). */
export async function loadHomeTest(range: Range): Promise<VariantStats[]> {
  const { data, error } = await supabase.rpc("home_experiment_summary", {
    p_experiment: "home_section_v1",
    p_since: since(range),
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, string | number>[];
  return VARIANTS.map(({ id }) => {
    const r = rows.find((row) => row.variant === id);
    if (!r) return empty(id);
    const n = (key: string) => Number(r[key] ?? 0);
    return {
      variant: id,
      visitors: n("visitors"),
      sectionViewers: n("section_viewers"),
      interactions: n("interactions"),
      interactors: n("interactors"),
      ctaClicks: n("cta_clicks"),
      ctaClickers: n("cta_clickers"),
      registrationStarters: n("registration_starters"),
      registrations: n("registrations"),
      vendorRegistrations: n("vendor_registrations"),
      hostRegistrations: n("host_registrations"),
    };
  });
}

export async function loadHomeTestClicks(range: Range) {
  const { data, error } = await supabase.rpc("home_experiment_clicks", {
    p_experiment: "home_section_v1",
    p_since: since(range),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { variant: Variant; event: "click" | "select"; detail: string; total: number; visitors: number }[]).map(
    (r) => ({ ...r, total: Number(r.total), visitors: Number(r.visitors) }),
  );
}

export function pct(part: number, whole: number): string {
  return formatRate(whole > 0 ? part / whole : null);
}

// ---- Which version is best ----------------------------------------------

// "Chance of being best": how often each version comes out on top when
// its true rate is drawn from what the data allows (a Beta distribution
// per version, simulated 20,000 times with a fixed seed so the numbers
// don't jump between reloads).
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// Marsaglia–Tsang; shape is always ≥ 1 here.
function gamma(shape: number, rand: () => number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rand);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function chanceToBeBest(arms: { successes: number; trials: number }[], draws = 20_000): number[] {
  const rand = mulberry32(20261007);
  const wins = arms.map(() => 0);
  for (let i = 0; i < draws; i++) {
    let best = 0;
    let bestValue = -1;
    arms.forEach((arm, j) => {
      const successes = Math.min(arm.successes, arm.trials);
      const x = gamma(1 + successes, rand);
      const y = gamma(1 + arm.trials - successes, rand);
      const value = x / (x + y);
      if (value > bestValue) {
        bestValue = value;
        best = j;
      }
    });
    wins[best] += 1;
  }
  return wins.map((w) => w / draws);
}

/** Below these, a lead is called "too early". */
export const MIN_VISITORS_PER_VERSION = 100;
export const MIN_REGISTRATIONS = 10;
const SURE = 0.95;

export type Basis = "registrations" | "starts" | "cta";

export interface Verdict {
  /** no-data: nobody counted yet · waiting: visitors but no clicks or
   *  registrations · early: a lead, too soon to trust · leading: ahead,
   *  under 95% sure · winner: ahead and at least 95% sure. */
  status: "no-data" | "waiting" | "early" | "leading" | "winner";
  /** What the lead is measured on: completed registrations, or (until the
   *  first one) started registrations, then main-button clicks. */
  basis: Basis | null;
  leader: Variant | null;
  /** Per version: the rate on the basis (per visitor) and the chance of
   *  being best (null when a version has no visitors). */
  rate: Record<Variant, number | null>;
  chance: Record<Variant, number | null>;
  totalVisitors: number;
}

const successesFor = (s: VariantStats, basis: Basis) =>
  basis === "registrations" ? s.registrations : basis === "starts" ? s.registrationStarters : s.ctaClickers;

export function verdict(stats: VariantStats[]): Verdict {
  const totalVisitors = stats.reduce((sum, s) => sum + s.visitors, 0);
  const total = (basis: Basis) => stats.reduce((sum, s) => sum + successesFor(s, basis), 0);
  const blank = { a: null, b: null, c: null };
  if (totalVisitors === 0) {
    return { status: "no-data", basis: null, leader: null, rate: blank, chance: blank, totalVisitors };
  }
  const basis: Basis | null =
    total("registrations") > 0 ? "registrations" : total("starts") > 0 ? "starts" : total("cta") > 0 ? "cta" : null;
  if (!basis) {
    return { status: "waiting", basis: null, leader: null, rate: blank, chance: blank, totalVisitors };
  }

  const rate = { ...blank } as Record<Variant, number | null>;
  const chance = { ...blank } as Record<Variant, number | null>;
  const arms = stats.filter((s) => s.visitors > 0);
  const chances = chanceToBeBest(arms.map((s) => ({ successes: successesFor(s, basis), trials: s.visitors })));
  arms.forEach((s, i) => {
    rate[s.variant] = successesFor(s, basis) / s.visitors;
    chance[s.variant] = chances[i];
  });

  // The leader is the highest rate as shown; a tie goes to the likelier best.
  const leader = arms.reduce((best, s) => {
    const r = rate[s.variant]!;
    const b = rate[best.variant]!;
    return r > b || (r === b && chance[s.variant]! > chance[best.variant]!) ? s : best;
  }).variant;

  const enough =
    stats.every((s) => s.visitors >= MIN_VISITORS_PER_VERSION) && total("registrations") >= MIN_REGISTRATIONS;
  const status =
    basis !== "registrations" || !enough ? "early" : chance[leader]! >= SURE ? "winner" : "leading";
  return { status, basis, leader, rate, chance, totalVisitors };
}

export const variantName = (id: Variant) => `Version ${id.toUpperCase()}`;

const BASIS_WORDS: Record<Basis, { did: string; label: string }> = {
  registrations: { did: "registered", label: "completed registrations" },
  starts: { did: "started registering", label: "started registrations" },
  cta: { did: "clicked the main button", label: "main-button clicks" },
};

export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  const p = rate * 100;
  return `${p > 0 && p < 10 ? p.toFixed(1) : p.toFixed(0)}%`;
}

export function formatChance(chance: number | null): string {
  if (chance === null) return "—";
  if (chance < 0.01) return "<1%";
  if (chance > 0.99) return ">99%";
  return `${Math.round(chance * 100)}%`;
}

/** The verdict in words, for the A/B testing page and the dashboard card. */
export function describeVerdict(v: Verdict): { title: string; detail: string; note: string } {
  if (v.status === "no-data") {
    return {
      title: "No results yet",
      detail: "They show up here as visitors who accept analytics cookies see the homepage.",
      note: "",
    };
  }
  if (v.status === "waiting") {
    return {
      title: "No registrations or clicks yet",
      detail: `${v.totalVisitors.toLocaleString()} ${v.totalVisitors === 1 ? "visitor has" : "visitors have"} got a version so far.`,
      note: "",
    };
  }
  const leader = v.leader!;
  const name = variantName(leader);
  const words = BASIS_WORDS[v.basis!];
  const others = (["a", "b", "c"] as Variant[])
    .filter((id) => id !== leader)
    .map((id) => `${id.toUpperCase()} ${formatRate(v.rate[id])}`)
    .join(" · ");
  const detail = `${formatRate(v.rate[leader])} of its visitors ${words.did} (${others}).`;
  const sure = `${formatChance(v.chance[leader])} sure it's the best`;
  if (v.status === "winner") return { title: `${name} is the winner`, detail, note: `${sure}.` };
  if (v.status === "leading") {
    return { title: `${name} is in the lead`, detail, note: `${sure}. Keep the test running until one version reaches 95%.` };
  }
  return v.basis === "registrations"
    ? {
        title: `${name} is ahead, but it's too early to call`,
        detail,
        note: `Wait for at least ${MIN_VISITORS_PER_VERSION} visitors per version and ${MIN_REGISTRATIONS} registrations in total.`,
      }
    : {
        title: `No completed registrations yet. ${name} is ahead on ${words.label}`,
        detail,
        note: "The winner is decided on completed registrations.",
      };
}
