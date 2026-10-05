import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
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

/**
 * Why a check failed: the server's own message, shown as is, or one of
 * ours, kept as a key (notes.<key> in locales/<language>/status.json) so
 * it shows in the visitor's language.
 */
type CheckNote =
  | string
  | {
      key: "function_url_unknown" | "storage_url_unknown" | "storage_returned" | "ping_threw";
      status?: number;
    };

interface ServiceCheck {
  /** Also names the service's label and description in status.json (services.<id>). */
  id: string;
  /** Returns the latency in ms, or throws/returns null on failure. */
  ping: () => Promise<{ ok: boolean; latencyMs: number; note?: CheckNote }>;
}

interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  note?: CheckNote;
  checkedAt: number;
}

const SERVICES: ServiceCheck[] = [
  {
    id: "supabase-db",
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
    ping: async () => {
      const start = performance.now();
      const { error } = await supabase.auth.getSession();
      const latencyMs = Math.round(performance.now() - start);
      return { ok: !error, latencyMs, note: error?.message };
    },
  },
  {
    id: "edge-functions",
    ping: async () => {
      // Sitemap is a public, anonymous edge function — perfect health
      // check. The functions URL isn't exposed by supabase-js (the
      // .url property is protected), so derive from env.
      const base = import.meta.env.VITE_SUPABASE_URL;
      if (!base) {
        return { ok: false, latencyMs: 0, note: { key: "function_url_unknown" } };
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
    ping: async () => {
      // Hit the public bucket index — should always 200.
      const base = import.meta.env.VITE_SUPABASE_URL;
      if (!base) {
        return { ok: false, latencyMs: 0, note: { key: "storage_url_unknown" } };
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
            ? { key: "storage_returned", status: res.status }
            : undefined,
      };
    },
  },
];

// Latency thresholds in ms. Above slow → degraded; failed → down.
const SLOW_LATENCY = 1500;

function classify(ok: boolean, latencyMs: number): CheckStatus {
  if (!ok) return "down";
  if (latencyMs > SLOW_LATENCY) return "degraded";
  return "operational";
}

// On the dark page: green only for "operational" (a live signal),
// champagne for slow, and "Down" on a cream pill so the brand red
// stays readable against ink (its latency turns ink to match). Each
// status's word is labels.<status> in status.json.
const STATUS_META: Record<
  CheckStatus,
  { tone: string; labelTone: string; latencyTone: string; Icon: typeof CheckCircle2 }
> = {
  checking: {
    tone: "text-[#f4f1ea]/80",
    labelTone: "text-[#f4f1ea]/80",
    latencyTone: "text-[#f4f1ea]/80",
    Icon: Loader2,
  },
  operational: {
    tone: "text-emerald-400",
    labelTone: "text-emerald-400",
    latencyTone: "text-[#f4f1ea]/80",
    Icon: CheckCircle2,
  },
  degraded: {
    tone: "text-gold",
    labelTone: "text-gold",
    latencyTone: "text-[#f4f1ea]/80",
    Icon: AlertCircle,
  },
  down: {
    tone: "text-destructive",
    labelTone: "rounded-full bg-[#f4f1ea] px-2 py-0.5 text-destructive",
    latencyTone: "text-foreground",
    Icon: XCircle,
  },
};

export default function StatusPage() {
  const { t } = useTranslation("status");
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [running, setRunning] = useState(false);

  useDocumentMeta({
    title: t("meta.title"),
    description: t("meta.description"),
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
          const status = classify(r.ok, r.latencyMs);
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
              note: err instanceof Error ? err.message : { key: "ping_threw" },
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
    <div className="min-h-screen text-[#f4f1ea]" style={{ backgroundColor: "#14161a" }}>
      <PublicNav tone="dark" />

      <section className="border-b border-white/15 pt-12 md:pt-16 pb-12 md:pb-16">
        <div className="container mx-auto px-5 md:px-8 max-w-4xl">
          <p className="font-label text-gold tracking-[0.4em] mb-4">
            {t("eyebrow")}
          </p>
          <h1 className="font-editorial text-5xl md:text-6xl leading-[1.0] mb-6">
            <Trans t={t} i18nKey="title" components={{ gold: <span className="text-gold" /> }} />
          </h1>

          {/* Top-line overall */}
          <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 flex items-center gap-4 mb-3">
            <OverallIcon
              className={`w-6 h-6 shrink-0 ${overallMeta.tone} ${
                overall === "checking" ? "animate-spin" : ""
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="font-editorial text-2xl leading-tight">
                {t(`overall.${overall}`)}
              </p>
              <p className="text-xs text-[#f4f1ea]/80 mt-0.5">
                {t("refresh_note")}
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
              {t("refresh")}
            </Button>
          </div>
        </div>
      </section>

      <section id="main-content" className="py-10 md:py-14">
        <div className="container mx-auto px-5 md:px-8 max-w-4xl">
          <ul className="space-y-3">
            {SERVICES.map((s) => {
              const r = results[s.id];
              const status: CheckStatus = r ? r.status : "checking";
              const meta = STATUS_META[status];
              const Icon = meta.Icon;
              return (
                <li
                  key={s.id}
                  className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 flex items-center gap-4"
                >
                  <Icon
                    className={`w-5 h-5 shrink-0 ${meta.tone} ${
                      r?.status === "checking" ? "animate-spin" : ""
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <p className="font-display text-base leading-tight">
                        {t(`services.${s.id}.label`)}
                      </p>
                      <p
                        className={`text-xs font-medium ${meta.labelTone} tabular-nums`}
                      >
                        {t(`labels.${status}`)}
                        {r?.latencyMs != null && (
                          <span className={`${meta.latencyTone} font-normal ml-2`}>
                            {r.latencyMs}ms
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-[#f4f1ea]/80 mt-1">
                      {t(`services.${s.id}.description`)}
                    </p>
                    {r?.note && r.status !== "operational" && (
                      <p className="text-[11px] text-[#f4f1ea]/80 mt-1">
                        {typeof r.note === "string"
                          ? r.note
                          : t(`notes.${r.note.key}`, { status: r.note.status })}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-[#f4f1ea]/80 mt-8 max-w-2xl leading-relaxed">
            {t("footnote")}
          </p>
        </div>
      </section>

      <Footer tone="dark" />
    </div>
  );
}
