import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { TrendingUp, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/format";
import { useCategoryNames } from "@/lib/categoryNames";

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
  const { t } = useTranslation("listingEditor");
  const categoryNames = useCategoryNames();
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
  const range = {
    low: formatCents(benchmark.p25_cents),
    high: formatCents(benchmark.p75_cents),
  };
  const rangeTag = { range: <span className="tnum" /> };
  const sample = {
    count: benchmark.sample_size,
    category: categoryNames.sub(category).toLowerCase(),
    location,
  };

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
            <Trans t={t} i18nKey="smartPricing.below" values={range} components={rangeTag} />
          </p>
        )}
        {aboveBand && (
          <p className="font-medium leading-snug">
            <Trans t={t} i18nKey="smartPricing.above" values={range} components={rangeTag} />
          </p>
        )}
        {inBand && (
          <p className="font-medium leading-snug">
            <Trans t={t} i18nKey="smartPricing.inBand" values={range} components={rangeTag} />
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {location
            ? t("smartPricing.sampleNear", sample)
            : t("smartPricing.sample", sample)}
        </p>
      </div>
    </div>
  );
}
