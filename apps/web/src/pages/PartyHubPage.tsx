import { useEffect, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import {
  CalendarDays,
  MapPin,
  ArrowRight,
  Sparkles,
  Users,
  Clock,
  Gift,
  ListChecks,
  CheckCircle2,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PrefetchLink as PLink } from "@/components/shared/PrefetchLink";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

interface PartyEventSummary {
  invite_id: string;
  event_id: string;
  event_name: string | null;
  event_type: string;
  event_date: string | null;
  event_location: string | null;
  role_label: string;
  host_name: string;
}

interface PartyPortal {
  role_label: string;
  event: {
    id: string;
    name: string | null;
    event_type: string;
    event_date: string | null;
    event_location: string | null;
    host_name: string;
  };
  schedule: Array<{
    id: string;
    title: string;
    notes: string | null;
    start_time: string;
    duration_minutes: number | null;
    location: string | null;
  }>;
  vendors: Array<{
    vendor_id: string;
    business_name: string;
    category: string;
    location: string | null;
  }>;
  registry: Array<{
    id: string;
    label: string;
    provider: string;
    url: string;
    description: string | null;
  }>;
  gifts: Array<{
    id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    target_cents: number | null;
    share_token: string;
  }>;
  my_tasks: Array<{
    id: string;
    title: string;
    notes: string | null;
    due_date: string | null;
    completed_at: string | null;
  }>;
}

const EVENT_LABEL: Record<string, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  holiday_dinner: "Holiday gathering",
  other: "Event",
};

function fmtTime(t: string | null | undefined) {
  if (!t) return "";
  const parts = t.split(":").map(Number);
  const h = parts[0];
  const m = parts[1];
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// /party — shows all events the logged-in user has accepted invites for.
// /party/:eventId — the per-event VIP portal.
export default function PartyHubPage() {
  const { user } = useAuth();
  const { eventId } = useParams();

  if (!user) return <Navigate to="/login" replace />;
  if (eventId) return <PartyEventView eventId={eventId} />;
  return <PartyIndex />;
}

function PartyIndex() {
  const [events, setEvents] = useState<PartyEventSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useDocumentMeta({
    title: "Inner-circle portal — Vendora",
    description: "Events you're a VIP for, all in one place.",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("list_my_party_events");
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setEvents([]);
      } else {
        setEvents((data as PartyEventSummary[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 sticky top-0 z-40">
        <div className="container mx-auto flex items-center justify-between">
          <Link to="/" className="font-display text-lg">
            Vendora
          </Link>
          <p className="text-xs text-muted-foreground uppercase tracking-[0.3em]">
            VIP portal
          </p>
        </div>
      </header>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-6 max-w-3xl">
          <p className="font-label text-accent tracking-[0.4em] mb-3">
            — INNER CIRCLE
          </p>
          <h1 className="font-editorial text-4xl md:text-4xl leading-tight mb-3">
            Events you're a VIP for
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-10">
            Schedule, vendor contacts, group gifts, and any tasks the host
            assigned you — all the day-of details, none of the planning
            paperwork.
          </p>

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-32 rounded-sm" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 max-w-md mx-auto">
              <Sparkles className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
              <p className="font-editorial text-2xl mb-2">No invitations yet</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When a host adds you to their inner circle for an event,
                you'll see it here. They'll send a magic-link invitation by
                email.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {events.map((e) => {
                const days =
                  e.event_date != null
                    ? Math.ceil(
                        (new Date(`${e.event_date}T00:00:00`).getTime() - Date.now()) /
                          (1000 * 60 * 60 * 24),
                      )
                    : null;
                const past = days !== null && days < 0;
                return (
                  <li key={e.invite_id}>
                    <PLink
                      to={`/party/${e.event_id}`}
                      className="group block rounded-sm border border-border bg-card p-5 hover:border-foreground/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-label text-accent mb-1">
                            {e.role_label}
                          </p>
                          <h2 className="font-editorial text-2xl leading-tight mb-1">
                            {e.event_name ??
                              `${e.host_name}'s ${EVENT_LABEL[e.event_type] ?? "event"}`}
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            with{" "}
                            <span className="text-foreground/80">{e.host_name}</span>
                          </p>
                          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                            {e.event_date && (
                              <span className="inline-flex items-center gap-1.5 tnum">
                                <CalendarDays className="w-3 h-3" />
                                {new Date(
                                  `${e.event_date}T00:00:00`,
                                ).toLocaleDateString(undefined, {
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                            )}
                            {e.event_location && (
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="w-3 h-3" />
                                {e.event_location}
                              </span>
                            )}
                          </div>
                        </div>
                        {days !== null && (
                          <span
                            className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 tnum ${
                              past
                                ? "bg-muted text-muted-foreground"
                                : days <= 30
                                  ? "bg-accent text-accent-foreground"
                                  : "bg-secondary text-foreground"
                            }`}
                          >
                            {past ? `${Math.abs(days)}d ago` : `${days}d to go`}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-accent mt-4 inline-flex items-center gap-1 group-hover:underline">
                        Open portal <ArrowRight className="w-3 h-3" />
                      </p>
                    </PLink>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function PartyEventView({ eventId }: { eventId: string }) {
  const [data, setData] = useState<PartyPortal | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [pendingTask, setPendingTask] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error } = await (supabase as any).rpc(
      "get_party_portal",
      { p_event_id: eventId },
    );
    if (error || !result) {
      setDenied(true);
      setLoading(false);
      return;
    }
    setData(result as PartyPortal);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useDocumentMeta({
    title: data
      ? `${data.event.host_name}'s ${EVENT_LABEL[data.event.event_type] ?? "event"} — VIP portal`
      : "VIP portal — Vendora",
    description: "VIP details for this event.",
  });

  async function toggleTask(t: PartyPortal["my_tasks"][number]) {
    setPendingTask(t.id);
    const next = t.completed_at ? null : new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("event_party_tasks")
      .update({ completed_at: next })
      .eq("id", t.id);
    setPendingTask(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    load();
  }

  if (denied) return <Navigate to="/party" replace />;

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card px-6 py-4">
          <div className="container mx-auto">
            <Skeleton className="h-6 w-32" />
          </div>
        </header>
        <div className="container mx-auto px-6 py-12 max-w-3xl space-y-4">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  const ev = data.event;
  const days =
    ev.event_date != null
      ? Math.ceil(
          (new Date(`${ev.event_date}T00:00:00`).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 sticky top-0 z-40">
        <div className="container mx-auto flex items-center justify-between">
          <Link
            to="/party"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            All events
          </Link>
          <p className="text-xs text-muted-foreground uppercase tracking-[0.3em]">
            VIP portal
          </p>
        </div>
      </header>

      {/* Hero */}
      <section className="py-10 md:py-14 border-b border-border">
        <div className="container mx-auto px-6 max-w-3xl">
          <p className="font-label text-accent tracking-[0.4em] mb-3">
            — {data.role_label.toUpperCase()}
          </p>
          <h1 className="font-editorial text-4xl md:text-5xl leading-[1.05] mb-3">
            {ev.name ??
              `${ev.host_name}'s ${EVENT_LABEL[ev.event_type] ?? "event"}`}
          </h1>
          <div className="flex items-center gap-5 text-sm text-muted-foreground flex-wrap">
            {ev.event_date && (
              <span className="inline-flex items-center gap-1.5 tnum">
                <CalendarDays className="w-3.5 h-3.5" />
                {new Date(`${ev.event_date}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
            {ev.event_location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {ev.event_location}
              </span>
            )}
            {days !== null && days >= 0 && (
              <span className="inline-flex items-center gap-1.5 text-accent tnum">
                <Clock className="w-3.5 h-3.5" />
                {days} days to go
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="container mx-auto px-6 py-10 md:py-14 max-w-3xl space-y-12">
        {/* My tasks */}
        {data.my_tasks.length > 0 && (
          <Section icon={ListChecks} title="Your tasks">
            <ul className="space-y-2">
              {data.my_tasks.map((t) => {
                const done = Boolean(t.completed_at);
                return (
                  <li
                    key={t.id}
                    className={`rounded-sm border p-4 flex items-start gap-3 ${
                      done
                        ? "bg-secondary/40 border-border/40"
                        : "bg-card border-border"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleTask(t)}
                      disabled={pendingTask === t.id}
                      className={`mt-0.5 w-5 h-5 rounded-full shrink-0 flex items-center justify-center border ${
                        done
                          ? "bg-accent border-accent text-accent-foreground"
                          : "border-border hover:border-foreground"
                      }`}
                      aria-label={done ? "Mark not done" : "Mark done"}
                    >
                      {done && <CheckCircle2 className="w-3 h-3" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm leading-tight ${
                          done ? "line-through text-muted-foreground" : ""
                        }`}
                      >
                        {t.title}
                      </p>
                      {t.notes && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-line">
                          {t.notes}
                        </p>
                      )}
                      {t.due_date && (
                        <p className="text-[11px] text-muted-foreground mt-1 tnum">
                          due {new Date(`${t.due_date}T00:00:00`).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* Schedule */}
        {data.schedule.length > 0 && (
          <Section icon={Clock} title="Run of show">
            <ol className="space-y-3">
              {data.schedule.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start gap-4 rounded-sm border border-border bg-card p-4"
                >
                  <div className="shrink-0 w-20">
                    <p className="font-display text-base tnum">
                      {fmtTime(s.start_time)}
                    </p>
                    {s.duration_minutes && (
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground tnum">
                        {s.duration_minutes} min
                      </p>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm leading-tight">{s.title}</p>
                    {s.location && (
                      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {s.location}
                      </p>
                    )}
                    {s.notes && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {s.notes}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Vendors (names + categories only) */}
        {data.vendors.length > 0 && (
          <Section
            icon={Users}
            title="Vendor contacts"
            sub="Names + roles only — talk to the host for direct numbers"
          >
            <div className="grid sm:grid-cols-2 gap-2">
              {data.vendors.map((v) => (
                <PLink
                  key={v.vendor_id}
                  to={`/vendors/${v.vendor_id}`}
                  className="rounded-sm border border-border bg-card p-3 hover:border-foreground/30 transition-colors group"
                >
                  <p className="font-display text-sm leading-tight group-hover:text-accent transition-colors">
                    {v.business_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                    {v.category}
                    {v.location && ` · ${v.location}`}
                  </p>
                </PLink>
              ))}
            </div>
          </Section>
        )}

        {/* Group gifts */}
        {data.gifts.length > 0 && (
          <Section icon={Gift} title="Group gifts">
            <div className="grid sm:grid-cols-2 gap-2">
              {data.gifts.map((g) => (
                <a
                  key={g.id}
                  href={`/gift/${g.share_token}`}
                  className="rounded-sm border border-border bg-card p-4 hover:border-foreground/30 transition-colors group flex items-start gap-3"
                >
                  {g.image_url ? (
                    <img
                      src={g.image_url}
                      alt=""
                      className="w-12 h-12 rounded-sm object-cover bg-muted shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-sm bg-secondary shrink-0 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-accent" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm leading-tight">{g.title}</p>
                    {g.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                        {g.description}
                      </p>
                    )}
                    <p className="text-[10px] uppercase tracking-wide text-accent mt-2 inline-flex items-center gap-1 group-hover:underline">
                      Contribute <ExternalLink className="w-2.5 h-2.5" />
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </Section>
        )}

        {/* Registry */}
        {data.registry.length > 0 && (
          <Section icon={Gift} title="Registry">
            <ul className="space-y-2">
              {data.registry.map((r) => (
                <li key={r.id}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-sm border border-border bg-card p-3 hover:border-foreground/30 transition-colors flex items-start gap-3 group"
                  >
                    <Gift className="w-4 h-4 mt-1 text-accent shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm group-hover:underline">
                        {r.label}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                        {r.provider}
                      </p>
                      {r.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                          {r.description}
                        </p>
                      )}
                    </div>
                    <ExternalLink className="w-3 h-3 mt-1 shrink-0 opacity-50 group-hover:opacity-100" />
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Empty state if nothing yet */}
        {data.schedule.length === 0 &&
          data.vendors.length === 0 &&
          data.registry.length === 0 &&
          data.gifts.length === 0 &&
          data.my_tasks.length === 0 && (
            <div className="rounded-sm border border-dashed border-border p-12 text-center">
              <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium mb-1">Nothing here yet</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                The host is still putting things together. This page will
                fill in as they add a schedule, book vendors, and set up
                their registry.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  sub,
  children,
}: {
  icon: typeof ListChecks;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-4">
        <Icon className="w-4 h-4 text-accent" />
        <h2 className="font-editorial text-3xl">{title}</h2>
      </div>
      {sub && (
        <p className="text-xs text-muted-foreground mb-4 -mt-2">{sub}</p>
      )}
      {children}
    </section>
  );
}

