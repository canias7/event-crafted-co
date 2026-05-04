import { useEffect, useMemo, useState } from "react";
import {
  Mail,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  MousePointerClick,
  Users,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Skeleton } from "@/components/ui/skeleton";
import { adminNavItems as navItems } from "@/data/navItems";

interface Summary {
  window_days: number;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
  opened: number;
  clicked: number;
  unique_recipients: number;
  delivery_rate: number | null;
  bounce_rate: number | null;
  complaint_rate: number | null;
  open_rate: number | null;
  top_bounces: Array<{ recipient_email: string; count: number; last_seen: string }>;
  recent_failures: Array<{
    id: string;
    event_type: string;
    recipient_email: string | null;
    subject: string | null;
    occurred_at: string;
    meta: Record<string, unknown>;
  }>;
}

interface DailyVolume {
  day: string;
  sent: number;
  delivered: number;
  bounced: number;
}

type Window = 7 | 30 | 90;

function fmtPct(rate: number | null): string {
  if (rate === null || rate === undefined) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export default function AdminEmailDeliverabilityPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState<Window>(30);

  async function load() {
    setLoading(true);
    const [summaryRes, dailyRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("get_email_deliverability_summary", {
        p_window_days: windowDays,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("get_email_daily_volume", {
        p_window_days: windowDays,
      }),
    ]);
    setSummary((summaryRes.data as Summary) ?? null);
    setDaily((dailyRes.data as DailyVolume[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays]);

  const maxDaily = useMemo(
    () => Math.max(1, ...daily.map((d) => d.sent)),
    [daily],
  );

  const bounceWarn =
    summary?.bounce_rate != null && summary.bounce_rate >= 0.05;
  const complaintWarn =
    summary?.complaint_rate != null && summary.complaint_rate >= 0.001;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Admin" backPath="/" />
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-display text-xl">Email deliverability</h1>
              <p className="text-sm text-muted-foreground">
                Sends, bounces, complaints — fed by Resend webhooks
              </p>
            </div>
            <div className="inline-flex rounded-full border border-border bg-background overflow-hidden text-xs">
              {([7, 30, 90] as Window[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWindowDays(d)}
                  className={`px-3 py-1.5 transition-colors ${
                    windowDays === d
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-6">
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-sm" />
              ))}
            </div>
          ) : !summary || summary.sent === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <Mail className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-display text-xl mb-2">No email events yet</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Once Resend webhooks start flowing into{" "}
                <code className="text-foreground/80 bg-secondary/40 rounded px-1 text-xs">
                  /functions/v1/resend-webhook
                </code>
                , send / delivered / bounced rates will appear here. See
                migration{" "}
                <code className="text-xs">20260503650000_email_deliverability.sql</code>
                for setup.
              </p>
            </div>
          ) : (
            <>
              {/* Headline rates */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <RateCard
                  icon={Mail}
                  label="Sent"
                  value={summary.sent.toLocaleString()}
                  sub={`${summary.unique_recipients.toLocaleString()} unique recipients`}
                />
                <RateCard
                  icon={CheckCircle2}
                  label="Delivered"
                  value={fmtPct(summary.delivery_rate)}
                  sub={`${summary.delivered.toLocaleString()} delivered`}
                  tone="text-accent"
                />
                <RateCard
                  icon={AlertTriangle}
                  label="Bounce rate"
                  value={fmtPct(summary.bounce_rate)}
                  sub={`${summary.bounced.toLocaleString()} bounced`}
                  tone={bounceWarn ? "text-destructive" : undefined}
                  warn={bounceWarn ? "Above 5% — check sender reputation" : undefined}
                />
                <RateCard
                  icon={XCircle}
                  label="Complaint rate"
                  value={fmtPct(summary.complaint_rate)}
                  sub={`${summary.complained.toLocaleString()} complaints`}
                  tone={complaintWarn ? "text-destructive" : undefined}
                  warn={
                    complaintWarn
                      ? "Above 0.1% — review unsubscribe + opt-in flows"
                      : undefined
                  }
                />
              </section>

              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <RateCard
                  icon={Eye}
                  label="Open rate"
                  value={fmtPct(summary.open_rate)}
                  sub={`${summary.opened.toLocaleString()} opens`}
                />
                <RateCard
                  icon={MousePointerClick}
                  label="Clicks"
                  value={summary.clicked.toLocaleString()}
                  sub="link clicks tracked"
                />
                <RateCard
                  icon={Users}
                  label="Failed"
                  value={summary.failed.toLocaleString()}
                  sub="permanent failures"
                  tone={summary.failed > 0 ? "text-destructive" : undefined}
                />
                <RateCard
                  icon={Mail}
                  label="Volume"
                  value={(summary.sent / windowDays).toFixed(1)}
                  sub="emails/day average"
                />
              </section>

              {/* Daily volume chart */}
              <section className="bg-card border border-border rounded-sm p-5">
                <p className="font-label text-muted-foreground mb-4">
                  Daily volume
                </p>
                <div className="flex items-end gap-px h-24">
                  {daily.map((d, i) => {
                    const sentH = (d.sent / maxDaily) * 100;
                    const delivH = (d.delivered / maxDaily) * 100;
                    const bouncedH = (d.bounced / maxDaily) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col-reverse items-stretch gap-px relative group"
                        title={`${d.day}: ${d.sent} sent, ${d.delivered} delivered, ${d.bounced} bounced`}
                      >
                        {d.bounced > 0 && (
                          <div
                            className="bg-destructive rounded-sm"
                            style={{ height: `${Math.max(bouncedH, 4)}%` }}
                          />
                        )}
                        {d.delivered > 0 && (
                          <div
                            className="bg-accent rounded-sm"
                            style={{ height: `${Math.max(delivH, 4)}%` }}
                          />
                        )}
                        {d.sent > 0 && (
                          <div
                            className="bg-secondary rounded-sm"
                            style={{
                              height: `${Math.max(sentH - delivH - bouncedH, 0)}%`,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-2 tnum">
                  <span>{daily[0]?.day}</span>
                  <span>{daily[daily.length - 1]?.day}</span>
                </div>
                <div className="flex gap-3 text-[10px] uppercase tracking-wide text-muted-foreground mt-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 bg-accent rounded-sm" />
                    Delivered
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 bg-destructive rounded-sm" />
                    Bounced
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 bg-secondary rounded-sm" />
                    In-flight
                  </span>
                </div>
              </section>

              {/* Top bouncing recipients */}
              {summary.top_bounces.length > 0 && (
                <section className="bg-card border border-border rounded-sm p-5">
                  <p className="font-label text-muted-foreground mb-3 inline-flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Repeatedly bouncing or complaining
                  </p>
                  <ul className="divide-y divide-border">
                    {summary.top_bounces.map((b) => (
                      <li
                        key={b.recipient_email}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <span className="text-sm font-mono truncate">
                          {b.recipient_email}
                        </span>
                        <span className="text-xs text-muted-foreground tnum shrink-0">
                          {b.count} events · last{" "}
                          {new Date(b.last_seen).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Consider suppressing these addresses from future sends.
                    Resend's suppression list can be managed in their
                    dashboard.
                  </p>
                </section>
              )}

              {/* Recent failures */}
              {summary.recent_failures.length > 0 && (
                <section className="bg-card border border-border rounded-sm p-5">
                  <p className="font-label text-muted-foreground mb-3">
                    Recent failures
                  </p>
                  <ul className="divide-y divide-border max-h-96 overflow-y-auto">
                    {summary.recent_failures.map((f) => {
                      const tone =
                        f.event_type === "email.complained"
                          ? "text-destructive"
                          : f.event_type === "email.failed"
                            ? "text-destructive"
                            : "text-amber-600 dark:text-amber-400";
                      return (
                        <li
                          key={f.id}
                          className="py-2.5 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-mono truncate">
                              {f.recipient_email ?? "(unknown)"}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {f.subject ?? "(no subject)"}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p
                              className={`text-[10px] uppercase tracking-wide ${tone}`}
                            >
                              {f.event_type.replace("email.", "")}
                            </p>
                            <p className="text-[10px] text-muted-foreground tnum">
                              {new Date(f.occurred_at).toLocaleString()}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

function RateCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  warn,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  sub: string;
  tone?: string;
  warn?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-sm p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="w-3.5 h-3.5" />
        <p className="font-label">{label}</p>
      </div>
      <p className={`font-display text-2xl tnum ${tone ?? ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      {warn && (
        <p className="text-[10px] text-destructive mt-2 leading-relaxed">
          {warn}
        </p>
      )}
    </div>
  );
}
