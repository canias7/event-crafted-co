import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

// Real-time service health page. Each check pings a known surface and
// reports up / degraded / down based on response. Calls happen in
// parallel; latencies are individual so a slow CDN doesn't make the
// whole page look like it's failing.
//
// We keep checks lightweight — anonymous SELECT against a public-RLS
// table for Postgres, OPTIONS preflight for edge functions. No
// authenticated calls so visitors can see status without an account.

type CheckStatus = "checking" | "operational" | "degraded" | "down";

interface ServiceCheck {
  id: string;
  label: string;
  description: string;
  /** Returns the latency in ms, or throws/returns null on failure. */
  ping: () => Promise<{ ok: boolean; latencyMs: number; note?: string }>;
}

interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  note?: string;
  checkedAt: number;
}

const SERVICES: ServiceCheck[] = [
  {
    id: "supabase-db",
    label: "Database",
    description: "Postgres reads via the Supabase API",
    ping: async () => {
      const start = performance.now();
      // Anonymous select against vendor_profiles (public RLS read).
      // Limit 1 keeps this cheap.
      const { error } = await supabase
        .from("vendor_profiles")
        .select("id", { count: "exact", head: true })
        .limit(1);
      const latencyMs = Math.round(performance.now() - start);
      return { ok: !error, latencyMs, note: error?.message };
    },
  },
  {
    id: "supabase-auth",
    label: "Authentication",
    description: "Sign-in + session endpoints",
    ping: async () => {
      const start = performance.now();
      const { error } = await supabase.auth.getSession();
      const latencyMs = Math.round(performance.now() - start);
      return { ok: !error, latencyMs, note: error?.message };
    },
  },
  {
    id: "edge-functions",
    label: "Edge functions",
    description: "Sitemap, calendar feeds, transactional email",
    ping: async () => {
      // Sitemap is a public, anonymous edge function — perfect health
      // check. The functions URL isn't exposed by supabase-js (the
      // .url property is protected), so derive from env.
      const base = import.meta.env.VITE_SUPABASE_URL;
      if (!base) {
        return { ok: false, latencyMs: 0, note: "function URL unknown" };
      }
      const start = performance.now();
      const res = await fetch(`${base}/functions/v1/sitemap-xml`, {
        method: "GET",
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "" },
      });
      const latencyMs = Math.round(performance.now() - start);
      return { ok: res.ok, latencyMs };
    },
  },
  {
    id: "storage",
    label: "Storage",
    description: "Image and file delivery",
    ping: async () => {
      // Hit the public bucket index — should always 200.
      const base = import.meta.env.VITE_SUPABASE_URL;
      if (!base) {
        return { ok: false, latencyMs: 0, note: "storage URL unknown" };
      }
      const start = performance.now();
      const res = await fetch(
        `${base}/storage/v1/object/public/vendor-portfolios/_health.txt`,
        { method: "HEAD" },
      );
      const latencyMs = Math.round(performance.now() - start);
      // 404 is fine — it means the bucket responded; the file just
      // doesn't exist. We only care that the storage API is reachable.
      return {
        ok: res.status < 500,
        latencyMs,
        note:
          res.status >= 500
            ? `storage returned ${res.status}`
            : undefined,
      };
    },
  },
];

// Latency thresholds in ms. Above slow → degraded; failed → down.
const SLOW_LATENCY = 1500;

function classify(
  ok: boolean,
  latencyMs: number,
): { status: CheckStatus; label: string } {
  if (!ok) return { status: "down", label: "Down" };
  if (latencyMs > SLOW_LATENCY) return { status: "degraded", label: "Degraded" };
  return { status: "operational", label: "Operational" };
}

const STATUS_META: Record<
  CheckStatus,
  { tone: string; Icon: typeof CheckCircle2; label: string }
> = {
  checking: {
    tone: "text-muted-foreground",
    Icon: Loader2,
    label: "Checking",
  },
  operational: {
    tone: "text-emerald-600 dark:text-emerald-400",
    Icon: CheckCircle2,
    label: "Operational",
  },
  degraded: {
    tone: "text-amber-600 dark:text-amber-400",
    Icon: AlertCircle,
    label: "Degraded",
  },
  down: {
    tone: "text-destructive",
    Icon: XCircle,
    label: "Down",
  },
};

export default function StatusPage() {
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [running, setRunning] = useState(false);

  useDocumentMeta({
    title: "System status — Vendora",
    description:
      "Real-time health of Vendora's core services — database, authentication, edge functions, storage.",
  });

  async function runChecks() {
    setRunning(true);
    const initial: Record<string, CheckResult> = {};
    for (const s of SERVICES) {
      initial[s.id] = { status: "checking", checkedAt: Date.now() };
    }
    setResults((prev) => ({ ...prev, ...initial }));

    await Promise.all(
      SERVICES.map(async (s) => {
        try {
          const r = await s.ping();
          const { status } = classify(r.ok, r.latencyMs);
          setResults((prev) => ({
            ...prev,
            [s.id]: {
              status,
              latencyMs: r.latencyMs,
              note: r.note,
              checkedAt: Date.now(),
            },
          }));
        } catch (err) {
          setResults((prev) => ({
            ...prev,
            [s.id]: {
              status: "down",
              note: err instanceof Error ? err.message : "ping threw",
              checkedAt: Date.now(),
            },
          }));
        }
      }),
    );
    setRunning(false);
  }

  useEffect(() => {
    runChecks();
    const id = window.setInterval(runChecks, 60_000); // re-check every 60s
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overall = useMemo<CheckStatus>(() => {
    const list = Object.values(results);
    if (list.length === 0 || list.some((r) => r.status === "checking")) {
      return "checking";
    }
    if (list.some((r) => r.status === "down")) return "down";
    if (list.some((r) => r.status === "degraded")) return "degraded";
    return "operational";
  }, [results]);

  const overallMeta = STATUS_META[overall];
  const OverallIcon = overallMeta.Icon;

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="border-b border-border pt-32 pb-12 md:pb-16">
        <div className="container mx-auto px-6 md:px-8 max-w-4xl">
          <p className="font-label text-accent tracking-[0.4em] mb-4">
            — STATUS
          </p>
          <h1 className="font-editorial text-5xl md:text-6xl leading-[1.0] mb-6">
            How the system is{" "}
            <span className="italic font-light text-accent">behaving.</span>
          </h1>

          {/* Top-line overall */}
          <div className="card-soft p-5 flex items-center gap-4 mb-3">
            <OverallIcon
              className={`w-6 h-6 shrink-0 ${overallMeta.tone} ${
                overall === "checking" ? "animate-spin" : ""
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="font-editorial text-2xl leading-tight">
                {overall === "operational"
                  ? "All systems operational"
                  : overall === "degraded"
                    ? "Partial degradation"
                    : overall === "down"
                      ? "Service interruption"
                      : "Running checks…"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Re-checks every 60s · last refresh just now
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full shrink-0"
              onClick={runChecks}
              disabled={running}
            >
              {running ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="container mx-auto px-6 md:px-8 max-w-4xl">
          <ul className="space-y-3">
            {SERVICES.map((s) => {
              const r = results[s.id];
              const meta = r ? STATUS_META[r.status] : STATUS_META.checking;
              const Icon = meta.Icon;
              return (
                <li
                  key={s.id}
                  className="card-soft p-4 flex items-center gap-4"
                >
                  <Icon
                    className={`w-5 h-5 shrink-0 ${meta.tone} ${
                      r?.status === "checking" ? "animate-spin" : ""
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <p className="font-display text-base leading-tight">
                        {s.label}
                      </p>
                      <p
                        className={`text-xs font-medium ${meta.tone} tabular-nums`}
                      >
                        {meta.label}
                        {r?.latencyMs != null && (
                          <span className="text-muted-foreground font-normal ml-2">
                            {r.latencyMs}ms
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.description}
                    </p>
                    {r?.note && r.status !== "operational" && (
                      <p className="text-[11px] text-destructive/85 mt-1">
                        {r.note}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-muted-foreground mt-8 max-w-2xl leading-relaxed">
            Checks run from your browser, so they reflect the path between you
            and Vendora — not just our infrastructure. If you're seeing red
            here but our team's status post says green, it's likely a
            networking issue between you and the closest Supabase edge.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
