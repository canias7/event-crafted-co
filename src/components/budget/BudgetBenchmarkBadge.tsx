import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/format";

// Inline annotation for budget rows / forms: "Vendora hosts spend
// $X–$Y on photography here." Backed by the get_budget_benchmarks
// RPC which aggregates active vendor packages by category + location
// and returns p25–p75 percentiles.
//
// Renders nothing if there's not enough data (fewer than 5 packages
// matching) — the RPC returns null in that case.

interface Benchmark {
  category: string;
  location: string | null;
  sample_size: number;
  p25_cents: number;
  p50_cents: number;
  p75_cents: number;
  p90_cents: number;
  min_cents: number;
  max_cents: number;
}

interface Props {
  category: string;
  location?: string | null;
  /** Compact = single line for inline use; default = card with sample size. */
  compact?: boolean;
}

export function BudgetBenchmarkBadge({ category, location, compact }: Props) {
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!category) {
      setBenchmark(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // RPC isn't in the auto-generated types yet; cast through any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc("get_budget_benchmarks", {
        p_category: category,
        p_location: location ?? null,
      })
      .then(({ data }: { data: Benchmark | null }) => {
        if (cancelled) return;
        setBenchmark(data ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, location]);

  if (loading || !benchmark) return null;

  const range = `${formatCents(benchmark.p25_cents)}–${formatCents(benchmark.p75_cents)}`;

  if (compact) {
    return (
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <TrendingUp className="w-3 h-3 text-accent" aria-hidden="true" />
        Typical here: <span className="tnum font-medium">{range}</span>
      </p>
    );
  }

  return (
    <div className="rounded-sm border border-accent/25 bg-accent/5 px-3 py-2 flex items-start gap-2.5">
      <TrendingUp className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium">
          Vendora hosts spend{" "}
          <span className="tnum">{range}</span>
          {location ? ` in ${location}` : " on average"}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          Middle 50% of {benchmark.sample_size} active package
          {benchmark.sample_size === 1 ? "" : "s"} from {category.toLowerCase()}{" "}
          vendors{location ? ` near ${location}` : ""}.
        </p>
      </div>
    </div>
  );
}
