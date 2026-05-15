// Customer (host) Events tab. Same data model as the host-mobile
// events screen: derive an "event" from any unique (event_type,
// event_date, location) triple this host has inquiries against.
// Pick the next upcoming event as the "Up next" hero card, then
// group the rest by month.
//
// Tap an event → open the matching conversation. Single-vendor
// events jump straight into the thread; multi-vendor events bounce
// to the inbox so the host can pick a vendor to talk to.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Inbox, Sparkles } from "lucide-react";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { customerNavItems as navItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RawInquiry {
  id: string;
  vendor_id: string | null;
  status: string;
  event_type: string | null;
  event_date: string | null;
  location: string | null;
  vendor: { business_name: string | null; category: string | null } | null;
}

interface EventVendor {
  inquiry_id: string;
  vendor_id: string | null;
  name: string;
  status: string;
}

interface HostEvent {
  key: string;
  title: string;
  eventDate: Date | null;
  location: string | null;
  vendors: EventVendor[];
}

function titleCase(s: string | null): string {
  if (!s) return "Event";
  return s
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function asDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function groupIntoEvents(rows: RawInquiry[]): HostEvent[] {
  const map = new Map<string, HostEvent>();
  for (const r of rows) {
    const dateStr = r.event_date ?? "tbd";
    const key = [r.event_type ?? "_", dateStr, r.location ?? "_"].join("|");
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: titleCase(r.event_type),
        eventDate: asDate(r.event_date),
        location: r.location,
        vendors: [],
      });
    }
    map.get(key)!.vendors.push({
      inquiry_id: r.id,
      vendor_id: r.vendor_id,
      name: r.vendor?.business_name ?? "Vendor",
      status: r.status,
    });
  }
  return [...map.values()].sort((a, b) => {
    const aT = a.eventDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bT = b.eventDate?.getTime() ?? Number.POSITIVE_INFINITY;
    return aT - bT;
  });
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(date);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86_400_000);
}

function relativeLabel(date: Date): string {
  const d = daysUntil(date);
  if (d < 0) return `${Math.abs(d)} ${Math.abs(d) === 1 ? "day" : "days"} ago`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 7) return `In ${d} days`;
  if (d < 14) return "Next week";
  if (d < 30) return `In ${Math.round(d / 7)} weeks`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function fmtFullDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function HostEventsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<HostEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const openEvent = useCallback(
    async (event: HostEvent) => {
      if (event.vendors.length === 0) return;
      if (event.vendors.length === 1) {
        const inquiryId = event.vendors[0].inquiry_id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc(
          "ensure_inquiry_thread",
          { p_inquiry_id: inquiryId },
        );
        if (error || !data) {
          toast.error(`Couldn't open thread: ${error?.message ?? "try again from the inbox"}`);
          return;
        }
        navigate(`/customer/messages?thread=${data as string}`);
        return;
      }
      // Multi-vendor event: bounce to inquiries hub so the host can
      // pick a vendor to talk to.
      navigate("/customer/inquiries");
    },
    [navigate],
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase as any)
        .from("inquiries")
        .select(
          "id, vendor_id, status, event_type, event_date, location, vendor:vendor_profiles!inquiries_vendor_id_fkey(business_name, category)",
        )
        .eq("host_id", user.id)
        .order("event_date", { ascending: true, nullsFirst: false });
      if (cancelled) return;
      if (e) setError(e.message);
      else setEvents(groupIntoEvents((data ?? []) as RawInquiry[]));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  // Split into upcoming + past based on eventDate.
  const { upcoming, past, nextUp } = useMemo(() => {
    const up: HostEvent[] = [];
    const ps: HostEvent[] = [];
    for (const ev of events) {
      if (ev.eventDate && daysUntil(ev.eventDate) < 0) ps.push(ev);
      else up.push(ev);
    }
    return { upcoming: up, past: ps.reverse(), nextUp: up[0] ?? null };
  }, [events]);

  const rest = useMemo(
    () => (nextUp ? upcoming.slice(1) : upcoming),
    [upcoming, nextUp],
  );

  // Group rest by month-year.
  const byMonth = useMemo(() => {
    const groups = new Map<string, HostEvent[]>();
    for (const ev of rest) {
      const label = ev.eventDate ? fmtMonthYear(ev.eventDate) : "Date TBD";
      const existing = groups.get(label) ?? [];
      existing.push(ev);
      groups.set(label, existing);
    }
    return [...groups.entries()];
  }, [rest]);

  // 14-day pill strip starting today. Mirrors mobile (host)/events.tsx
  // dayStrip — lets the host glance at "what's coming this fortnight"
  // and tap a day to filter the list to just that date.
  const dayStrip = useMemo(() => {
    const arr: Date[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, []);

  // Map day-key → events for the dot indicator on each pill.
  const eventsByDayKey = useMemo(() => {
    const m = new Map<string, HostEvent[]>();
    for (const ev of upcoming) {
      if (!ev.eventDate) continue;
      const k = ev.eventDate.toDateString();
      const arr = m.get(k) ?? [];
      arr.push(ev);
      m.set(k, arr);
    }
    return m;
  }, [upcoming]);

  const filteredByDay = useMemo(() => {
    if (!selectedDayKey) return null;
    return eventsByDayKey.get(selectedDayKey) ?? [];
  }, [selectedDayKey, eventsByDayKey]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Events" backPath="/customer/dashboard" />
      <main className="flex-1 pb-24 md:pb-0">
        <div className="px-5 pt-8 pb-12 md:px-12 md:pt-12 max-w-4xl mx-auto md:mx-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-editorial text-4xl text-foreground">
                Events
              </h1>
              <p className="mt-2 text-base text-muted-foreground">
                Every event you have an inquiry against, grouped by date.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {past.length > 0 ? (
                <button
                  onClick={() => setShowPast((s) => !s)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {showPast ? "Hide past" : `Show past (${past.length})`}
                </button>
              ) : null}
              <NotificationBell variant="light" />
            </div>
          </div>

          {loading ? (
            <p className="mt-12 text-sm text-muted-foreground">Loading events…</p>
          ) : error ? (
            <div className="mt-8 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : events.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="mt-8 space-y-10">
              {nextUp ? <UpNextHero event={nextUp} onOpen={() => openEvent(nextUp)} /> : null}

              {/* 14-day pill strip — tap a day to filter the list. */}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                {dayStrip.map((d) => {
                  const k = d.toDateString();
                  const isSelected = selectedDayKey === k;
                  const has = (eventsByDayKey.get(k) ?? []).length > 0;
                  return (
                    <DayPill
                      key={k}
                      date={d}
                      isSelected={isSelected}
                      hasEvent={has}
                      onClick={() => setSelectedDayKey(isSelected ? null : k)}
                    />
                  );
                })}
              </div>

              {filteredByDay !== null ? (
                <section>
                  <h2 className="font-editorial text-xl mb-3">
                    {filteredByDay.length === 0 ? "Nothing on this day" : "On this day"}
                  </h2>
                  <div className="space-y-2">
                    {filteredByDay.map((ev) => (
                      <EventRow
                        key={ev.key}
                        event={ev}
                        onOpen={() => openEvent(ev)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {byMonth.length > 0 && filteredByDay === null ? (
                <div className="space-y-8">
                  {byMonth.map(([label, evs]) => (
                    <section key={label}>
                      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {label}
                      </h2>
                      <div className="space-y-2">
                        {evs.map((ev) => (
                          <EventRow
                            key={ev.key}
                            event={ev}
                            onOpen={() => openEvent(ev)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}

              {showPast && past.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Past
                  </h2>
                  <div className="space-y-2">
                    {past.map((ev) => (
                      <EventRow
                        key={ev.key}
                        event={ev}
                        onOpen={() => openEvent(ev)}
                        muted
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

function UpNextHero({
  event,
  onOpen,
}: {
  event: HostEvent;
  onOpen: () => void;
}) {
  const rel = event.eventDate ? relativeLabel(event.eventDate) : "Date TBD";
  const full = event.eventDate ? fmtFullDate(event.eventDate) : null;
  return (
    <button
      onClick={onOpen}
      className="group block w-full rounded-2xl p-6 text-left transition active:opacity-80"
      style={{
        background:
          "linear-gradient(135deg, #fbc88a 0%, #fcd9a3 50%, #fce6c4 100%)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/70">
            <Sparkles className="h-3.5 w-3.5" />
            Up next
          </div>
          <h3 className="mt-2 text-2xl font-bold text-[#1a1a1a]">
            {event.title}
          </h3>
          {full ? (
            <p className="mt-1 text-sm text-[#1a1a1a]/70">{full}</p>
          ) : null}
          {event.location ? (
            <p className="mt-0.5 text-sm text-[#1a1a1a]/60">
              {event.location}
            </p>
          ) : null}
        </div>
        <span className="rounded-full bg-[#1a1a1a]/10 px-3 py-1 text-xs font-semibold text-[#1a1a1a]">
          {rel}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-[#1a1a1a]/75">
        {event.vendors.slice(0, 4).map((v) => (
          <span
            key={v.inquiry_id}
            className="rounded-full bg-white/60 px-2.5 py-0.5"
          >
            {v.name}
          </span>
        ))}
        {event.vendors.length > 4 ? (
          <span className="text-[#1a1a1a]/60">
            +{event.vendors.length - 4} more
          </span>
        ) : null}
      </div>
    </button>
  );
}

function EventRow({
  event,
  onOpen,
  muted,
}: {
  event: HostEvent;
  onOpen: () => void;
  muted?: boolean;
}) {
  const rel = event.eventDate ? relativeLabel(event.eventDate) : "TBD";
  const full = event.eventDate ? fmtFullDate(event.eventDate) : null;
  const status = statusOf(event.vendors);
  return (
    <button
      onClick={onOpen}
      className={`group flex w-full items-center justify-between gap-3 rounded-xl border border-black/10 px-4 py-3 text-left transition hover:bg-foreground/5 ${
        muted ? "opacity-60" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-foreground truncate">
            {event.title}
          </h3>
          <span className="text-xs text-muted-foreground">{rel}</span>
          {status ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${status.cls}`}
            >
              {status.text}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {full ? <span>{full}</span> : null}
          {event.location ? (
            <>
              <span>·</span>
              <span className="truncate">{event.location}</span>
            </>
          ) : null}
          <span>·</span>
          <span>
            {event.vendors.length}{" "}
            {event.vendors.length === 1 ? "vendor" : "vendors"}
          </span>
        </div>
      </div>
      <VendorBubbles vendors={event.vendors} />
      <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
    </button>
  );
}

const AVATAR_HUES = [
  "bg-violet-400",
  "bg-pink-400",
  "bg-orange-400",
  "bg-amber-400",
  "bg-emerald-400",
  "bg-blue-400",
  "bg-cyan-400",
  "bg-rose-400",
];

function hueFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_HUES[Math.abs(h) % AVATAR_HUES.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function DayPill({
  date,
  isSelected,
  hasEvent,
  onClick,
}: {
  date: Date;
  isSelected: boolean;
  hasEvent: boolean;
  onClick: () => void;
}) {
  const dow = date
    .toLocaleDateString(undefined, { weekday: "short" })
    .slice(0, 3)
    .toUpperCase();
  return (
    <button
      onClick={onClick}
      className={`shrink-0 w-16 py-3 px-2 rounded-2xl flex flex-col items-center transition ${
        isSelected
          ? "bg-foreground text-background"
          : "bg-secondary/60 text-foreground hover:bg-secondary"
      }`}
    >
      <span
        className={`text-[10px] font-semibold tracking-wider ${
          isSelected ? "text-background/70" : "text-muted-foreground"
        }`}
      >
        {dow}
      </span>
      <span className="mt-0.5 font-editorial text-xl">{date.getDate()}</span>
      <span
        className={`mt-1.5 w-1 h-1 rounded-full ${
          hasEvent
            ? isSelected
              ? "bg-background"
              : "bg-foreground"
            : "bg-transparent"
        }`}
      />
    </button>
  );
}

function VendorBubbles({ vendors }: { vendors: EventVendor[] }) {
  const visible = vendors.slice(0, 3);
  const overflow = vendors.length - visible.length;
  return (
    <div className="hidden sm:flex items-center">
      {visible.map((v, i) => (
        <div
          key={v.inquiry_id}
          className={`w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center border-2 border-background ${hueFor(
            v.vendor_id ?? v.inquiry_id,
          )}`}
          style={{ marginLeft: i === 0 ? 0 : -8 }}
        >
          {initialsOf(v.name)}
        </div>
      ))}
      {overflow > 0 ? (
        <div
          className="px-2 h-7 rounded-full bg-secondary text-[10px] font-bold flex items-center justify-center border-2 border-background text-foreground"
          style={{ marginLeft: -8, minWidth: "1.75rem" }}
        >
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}

function statusOf(
  vendors: EventVendor[],
): { text: string; cls: string } | null {
  if (vendors.length === 0) return null;
  const won = vendors.filter((v) => v.status === "won").length;
  const pending = vendors.filter(
    (v) =>
      v.status === "new" || v.status === "replied" || v.status === "drafted",
  ).length;
  if (won === vendors.length) {
    return { text: "Confirmed", cls: "bg-emerald-100 text-emerald-700" };
  }
  if (pending > 0) {
    return {
      text: `Awaiting ${pending}`,
      cls: "bg-amber-100 text-amber-700",
    };
  }
  return null;
}

function EmptyState() {
  return (
    <div className="mt-12 rounded-md border border-dashed border-border bg-card/40 p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary/60">
        <Inbox className="h-5 w-5 text-foreground" />
      </div>
      <h2 className="font-editorial text-2xl">No events yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Send an inquiry to a vendor and your event will show up here.
      </p>
      <Link
        to="/customer/explore"
        className="mt-6 inline-block rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
      >
        Browse vendors
      </Link>
    </div>
  );
}
