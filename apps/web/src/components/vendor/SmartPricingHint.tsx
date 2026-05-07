import { useEffect, useState } from "react";
import { TrendingUp, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/format";

// Vendor-side smart pricing — runs the same get_budget_benchmarks
// RPC the host budget page uses, but flips the framing: shows the
// vendor where their price sits in their category + city. "Peers
// charge $X-$Y; you're at $Z" — encourages confident pricing.
//
// Rendered inline next to a package's price. If the RPC doesn't have
// enough data (sample <5), we render nothing.

interface Benchmark {
  p25_cents: number;
  p75_cents: number;
  p50_cents: number;
  sample_size: number;
}

interface Props {
  category: string;
  location: string | null;
  myPriceCents: number;
}

export function SmartPricingHint({ category, location, myPriceCents }: Props) {
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!category) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc("get_budget_benchmarks", {
        p_category: category,
        p_location: location ?? null,
      })
      .then(({ data }: { data: Benchmark | null }) => {
        if (cancelled) return;
        setBenchmark(data ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [category, location]);

  if (!benchmark) return null;

  // Where is the vendor priced? Lower than p25 = below market.
  // Above p75 = premium. Inside band = in line.
  const belowMarket = myPriceCents < benchmark.p25_cents;
  const aboveBand = myPriceCents > benchmark.p75_cents;
  const inBand = !belowMarket && !aboveBand;

  return (
    <div className="rounded-sm border border-accent/25 bg-accent/5 px-3 py-2 flex items-start gap-2.5 text-xs">
      {inBand ? (
        <TrendingUp className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
      )}
      <div className="min-w-0">
        {belowMarket && (
          <p className="font-medium leading-snug">
            You're priced below the local typical (
            <span className="tnum">
              {formatCents(benchmark.p25_cents)}–
              {formatCents(benchmark.p75_cents)}
            </span>
            ).
          </p>
        )}
        {aboveBand && (
          <p className="font-medium leading-snug">
            Premium tier — above the local typical (
            <span className="tnum">
              {formatCents(benchmark.p25_cents)}–
              {formatCents(benchmark.p75_cents)}
            </span>
            ).
          </p>
        )}
        {inBand && (
          <p className="font-medium leading-snug">
            In line with local peers (
            <span className="tnum">
              {formatCents(benchmark.p25_cents)}–
              {formatCents(benchmark.p75_cents)}
            </span>
            ).
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-0.5">
          From {benchmark.sample_size} {category.toLowerCase()} package
          {benchmark.sample_size === 1 ? "" : "s"}
          {location ? ` near ${location}` : ""}.
        </p>
      </div>
    </div>
  );
}
