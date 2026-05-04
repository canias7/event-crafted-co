import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { Skeleton } from "@/components/ui/skeleton";

// Compact "your profile is N% complete" widget powered by the
// get_vendor_profile_score RPC. Shows the score, the next 3 incomplete
// checks (highest weight first), and a deep link to the profile page.

interface Check {
  label: string;
  weight: number;
  done: boolean;
  hint: string | null;
}

interface ScoreData {
  score: number;
  checks: Check[];
}

export function ProfileScoreCard({ vendorId }: { vendorId: string }) {
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error } = await (supabase as any).rpc(
        "get_vendor_profile_score",
        { p_vendor_id: vendorId },
      );
      if (cancelled) return;
      if (error || !result) {
        setData(null);
        setLoading(false);
        return;
      }
      setData(result as ScoreData);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (loading) {
    return <Skeleton className="h-32 rounded-2xl" />;
  }
  if (!data) return null;

  const score = Math.min(100, Math.max(0, data.score));
  const tier =
    score >= 90 ? "Excellent"
    : score >= 70 ? "Strong"
    : score >= 40 ? "Getting there"
    : "Needs work";
  const tone =
    score >= 90 ? "text-accent"
    : score >= 70 ? "text-foreground"
    : score >= 40 ? "text-foreground"
    : "text-destructive";

  const incomplete = data.checks
    .filter((c) => !c.done)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const allDone = incomplete.length === 0;

  return (
    <div className="bg-card rounded-2xl p-5 card-shadow">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            Profile completeness
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className={`font-display text-3xl tnum ${tone}`}>
              {score}%
            </p>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              {tier}
            </span>
          </div>
        </div>
        <Link
          to="/vendor/profile"
          className="text-xs text-accent hover:underline inline-flex items-center gap-1 mt-1"
        >
          Edit profile
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-4">
        <div
          className="h-full bg-foreground rounded-full transition-all duration-500"
          style={{ width: `${score}%` }}
        />
      </div>

      {allDone ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Profile is fully built out. Check back as we add new fields —
          imported reviews + showcase clips + verifications all unlock new
          ranking signals.
        </p>
      ) : (
        <>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
            Next up · biggest wins
          </p>
          <ul className="space-y-2">
            {incomplete.map((c) => (
              <li
                key={c.label}
                className="flex items-start gap-2 text-sm leading-tight"
              >
                <Circle className="w-3.5 h-3.5 mt-0.5 text-muted-foreground/50 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p>{c.label}</p>
                  {c.hint && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {c.hint}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground tnum shrink-0 mt-1">
                  +{c.weight}
                </span>
              </li>
            ))}
          </ul>

          {/* Done so far — compact */}
          {data.checks.filter((c) => c.done).length > 0 && (
            <details className="mt-4 pt-3 border-t border-border group">
              <summary className="text-[11px] uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground inline-flex items-center gap-1 select-none">
                <CheckCircle2 className="w-3 h-3 text-accent" />
                {data.checks.filter((c) => c.done).length} done
              </summary>
              <ul className="space-y-1 mt-2">
                {data.checks
                  .filter((c) => c.done)
                  .map((c) => (
                    <li
                      key={c.label}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <CheckCircle2 className="w-3 h-3 text-accent shrink-0" />
                      <span className="line-through">{c.label}</span>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
