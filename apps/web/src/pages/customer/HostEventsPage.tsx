// Manual events the host plans themselves. Reads from public.host_events
// (each row is one event), not derived from inquiries. The host creates,
// edits, and deletes rows through the New event modal; the page renders
// an Up Next hero card for the next upcoming row plus a chronological
// list of upcoming and past events.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { customerNavItems as navItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface HostEvent {
  id: string;
  title: string;
  event_type: string | null;
  event_date: string; // YYYY-MM-DD
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  guest_count: number | null;
  notes: string | null;
  share_token: string;
  going_count?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventsTable = () => (supabase as any).from("host_events");

const EVENT_TYPES = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "anniversary", label: "Anniversary" },
  { value: "corporate", label: "Corporate" },
  { value: "holiday_dinner", label: "Holiday dinner" },
  { value: "other", label: "Other" },
];

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Latest selectable date — end of the year AFTER the current one. We
// compute it on read so the bound advances as the calendar year rolls
// over (e.g. on 2026-12-31 the cap is 2027-12-31, on 2027-01-01 it
// becomes 2028-12-31).
function endOfNextYearYmd(): string {
  return `${new Date().getFullYear() + 1}-12-31`;
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTimeRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt(start ?? end!);
}

function eventTypeLabel(type: string | null): string | null {
  if (!type) return null;
  return EVENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export default function HostEventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<HostEvent[] | null>(null);
  const [editing, setEditing] = useState<HostEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<HostEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await eventsTable()
      .select(
        "id, title, event_type, event_date, start_time, end_time, location, guest_count, notes, share_token",
      )
      .eq("host_id", user.id)
      .order("event_date", { ascending: true });
    if (error) {
      toast.error(error.message);
      setEvents([]);
      return;
    }
    const rows = (data as HostEvent[]) ?? [];
    // Pull going-count per event in one query so each card can show
    // "N going" without N round-trips.
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rsvps } = await (supabase as any)
        .from("host_event_rsvps")
        .select("event_id")
        .in("event_id", ids)
        .eq("status", "going");
      const counts: Record<string, number> = {};
      for (const r of (rsvps as Array<{ event_id: string }> | null) ?? []) {
        counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
      }
      for (const row of rows) {
        row.going_count = counts[row.id] ?? 0;
      }
    }
    setEvents(rows);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const { upcoming, past, nextUp } = useMemo(() => {
    if (!events) return { upcoming: [], past: [], nextUp: null };
    const today = todayYmd();
    const upcoming = events.filter((e) => e.event_date >= today);
    const past = [...events]
      .filter((e) => e.event_date < today)
      .reverse();
    return { upcoming, past, nextUp: upcoming[0] ?? null };
  }, [events]);

  // Month grid (Sun-first, 6 weeks = 42 cells). Selected day filters
  // the list below; tapping a cell from a non-current month bounces
  // the view to that month.
  const monthCells = useMemo(() => {
    const first = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth(),
      1,
    );
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const pad = (n: number) => String(n).padStart(2, "0");
    const out: { date: Date; ymd: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push({
        date: d,
        ymd: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        inMonth: d.getMonth() === viewMonth.getMonth(),
      });
    }
    return out;
  }, [viewMonth]);

  function shiftMonth(delta: number) {
    setViewMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  }

  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const eventDayKeys = useMemo(
    () => new Set((events ?? []).map((e) => e.event_date)),
    [events],
  );

  useEffect(() => {
    if (selectedDay !== null) return;
    if (nextUp) setSelectedDay(nextUp.event_date);
    else if (events) setSelectedDay(todayYmd());
  }, [nextUp, events, selectedDay]);

  const eventsOnSelectedDay = useMemo(
    () =>
      selectedDay
        ? (events ?? []).filter((e) => e.event_date === selectedDay)
        : [],
    [events, selectedDay],
  );

  async function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    const { error } = await eventsTable().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Event deleted");
    setEvents((prev) => prev?.filter((e) => e.id !== id) ?? null);
  }

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar
        items={navItems}
        title="Events"
        backPath="/customer/explore"
      />
      <main id="main-content" className="flex-1 pb-24 md:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-editorial text-3xl">Events</h1>
            <p className="text-sm text-muted-foreground">
              Plan your events — weddings, dinners, anything.
            </p>
          </div>
          <NotificationBell variant="light" />
        </div>

        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
          {events === null ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-3xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          ) : events.length === 0 ? (
            <EmptyState onCreate={() => setCreating(true)} />
          ) : (
            <>
              {/* Month calendar — Sunday-first, 6-week grid. Cells
                  with an event get a small dot; selected day fills
                  dark. Chevrons move between months. */}
              <MonthCalendar
                viewMonth={viewMonth}
                monthLabel={monthLabel}
                cells={monthCells}
                selectedDay={selectedDay}
                eventDays={eventDayKeys}
                onShiftMonth={shiftMonth}
                onSelectDay={(ymd, inMonth) => {
                  setSelectedDay(ymd);
                  if (!inMonth) {
                    const [y, m] = ymd.split("-").map(Number);
                    setViewMonth(new Date(y, m - 1, 1));
                  }
                }}
              />

              {/* Selected-day content: hero card for the first event +
                  card list for the rest. Empty state when nothing on
                  the picked day. */}
              {eventsOnSelectedDay.length > 0 ? (
                <div className="space-y-3">
                  <UpNextHero
                    event={eventsOnSelectedDay[0]}
                    label={
                      selectedDay && nextUp?.event_date === selectedDay
                        ? "Up next"
                        : "On this day"
                    }
                    onEdit={() => setEditing(eventsOnSelectedDay[0])}
                    onDelete={() => setDeleting(eventsOnSelectedDay[0])}
                  />
                  {eventsOnSelectedDay.slice(1).map((e) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      onEdit={() => setEditing(e)}
                      onDelete={() => setDeleting(e)}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="rounded-2xl p-6 text-center text-sm text-muted-foreground"
                  style={{
                    background: "rgba(255,253,250,0.5)",
                    border: "0.5px solid rgba(255,138,76,0.14)",
                  }}
                >
                  Nothing on this day.
                </div>
              )}

              {past.length > 0 ? (
                <section>
                  <h2 className="font-editorial text-2xl mb-3 mt-4">Past</h2>
                  <div className="space-y-3 opacity-80">
                    {past.map((e) => (
                      <EventCard
                        key={e.id}
                        event={e}
                        onEdit={() => setEditing(e)}
                        onDelete={() => setDeleting(e)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {/* New event CTA — bottom of the page so creation lives
                  below the day picker, not in the page header. */}
              <div className="pt-4 flex justify-center">
                <Button
                  onClick={() => setCreating(true)}
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90 px-6 h-11"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  New event
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />

      <EventFormDialog
        open={creating || editing !== null}
        editing={editing}
        hostId={user?.id ?? null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-editorial text-3xl">
              Delete event?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              "{deleting?.title}" will be removed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="rounded-2xl p-10 md:p-14 text-center"
      style={{
        background: "rgba(255,253,250,0.6)",
        border: "0.5px solid rgba(255,138,76,0.22)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div
        className="w-14 h-14 mx-auto rounded-full inline-flex items-center justify-center mb-5"
        style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
      >
        <CalendarIcon className="w-6 h-6" />
      </div>
      <h2 className="font-editorial italic text-3xl mb-2">
        Plan your first event
      </h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
        Add a date, location, and a few details. You'll have a clean
        timeline of every event you're planning.
      </p>
      <Button
        onClick={onCreate}
        className="rounded-full bg-foreground text-background hover:bg-foreground/90"
      >
        <Plus className="w-4 h-4 mr-1.5" />
        New event
      </Button>
    </div>
  );
}

const WEEKDAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

function MonthCalendar({
  monthLabel,
  cells,
  selectedDay,
  eventDays,
  onShiftMonth,
  onSelectDay,
}: {
  viewMonth: Date;
  monthLabel: string;
  cells: { date: Date; ymd: string; inMonth: boolean }[];
  selectedDay: string | null;
  eventDays: Set<string>;
  onShiftMonth: (delta: number) => void;
  onSelectDay: (ymd: string, inMonth: boolean) => void;
}) {
  const today = todayYmd();
  return (
    <div
      className="rounded-3xl p-4 md:p-5"
      style={{
        background: "rgba(255,253,250,0.7)",
        border: "0.5px solid rgba(255,138,76,0.18)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-editorial text-2xl">{monthLabel}</h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onShiftMonth(-1)}
            aria-label="Previous month"
            className="w-9 h-9 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onShiftMonth(1)}
            aria-label="Next month"
            className="w-9 h-9 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_HEADERS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((c) => (
          <CalendarCell
            key={c.ymd}
            day={c.date.getDate()}
            ymd={c.ymd}
            inMonth={c.inMonth}
            isToday={c.ymd === today}
            isPast={c.ymd < today}
            selected={selectedDay === c.ymd}
            hasEvent={eventDays.has(c.ymd)}
            onClick={() => onSelectDay(c.ymd, c.inMonth)}
          />
        ))}
      </div>
    </div>
  );
}

function CalendarCell({
  day,
  inMonth,
  isToday,
  isPast,
  selected,
  hasEvent,
  onClick,
}: {
  day: number;
  ymd: string;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  selected: boolean;
  hasEvent: boolean;
  onClick: () => void;
}) {
  // Past days are read-only — the calendar is for planning forward.
  // Disabling here also strips the hover/ring affordance so the dim
  // cell looks the part. Past events still surface in the "Past"
  // section below the calendar.
  const disabled = isPast;
  return (
    <div className="flex items-center justify-center py-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        aria-disabled={disabled || undefined}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center text-sm font-medium transition ${
          disabled
            ? "text-muted-foreground/40 cursor-default"
            : selected
              ? "bg-foreground text-background"
              : isToday
                ? "bg-white/70 ring-1 ring-foreground/30 hover:bg-white text-foreground"
                : `hover:bg-white/60 ${!inMonth ? "text-muted-foreground/50" : "text-foreground"}`
        }`}
      >
        {day}
        {hasEvent ? (
          <span
            className="absolute bottom-1 w-1 h-1 rounded-full"
            style={{
              background: selected
                ? "rgba(255,255,255,0.85)"
                : disabled
                  ? "rgba(255,138,76,0.35)"
                  : "#ff8a4c",
            }}
          />
        ) : null}
      </button>
    </div>
  );
}

function UpNextHero({
  event,
  label = "Up next",
  onEdit,
  onDelete,
}: {
  event: HostEvent;
  label?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const time = fmtTimeRange(event.start_time, event.end_time);
  return (
    <div
      className="rounded-3xl p-6 md:p-8 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,213,165,1) 0%, rgba(255,176,107,1) 100%)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] font-medium text-foreground/80">
          <Sparkles className="w-3 h-3" />
          {label}
        </span>
        {onEdit || onDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Event actions"
                className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-foreground/10 text-foreground/70 -mt-1 -mr-1"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit ? (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              ) : null}
              {onDelete ? (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <h3 className="font-editorial text-3xl mt-2">{event.title}</h3>
      <p className="mt-1 text-sm text-foreground/80">{fmtDate(event.event_date)}</p>
      {time ? <p className="text-sm text-foreground/80">{time}</p> : null}
      {event.location ? (
        <p className="mt-2 text-sm text-foreground/80 inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          {event.location}
        </p>
      ) : null}
      {event.event_type ? (
        <span className="mt-3 inline-block rounded-full bg-foreground/10 px-2.5 py-1 text-xs">
          {eventTypeLabel(event.event_type)}
        </span>
      ) : null}
    </div>
  );
}

function EventCard({
  event,
  onEdit,
  onDelete,
}: {
  event: HostEvent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const time = fmtTimeRange(event.start_time, event.end_time);
  async function copyShareLink() {
    const url = `${window.location.origin}/rsvp/${event.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — long-press the link in the menu instead.");
    }
  }
  return (
    <div
      className="rounded-2xl p-4 md:p-5"
      style={{
        background: "rgba(255,253,250,0.7)",
        border: "0.5px solid rgba(255,138,76,0.18)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="font-editorial text-xl">{event.title}</h3>
            {event.event_type ? (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                · {eventTypeLabel(event.event_type)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {fmtDate(event.event_date)}
            {time ? ` · ${time}` : ""}
          </p>
          {event.location ? (
            <p className="mt-1 text-sm text-muted-foreground inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {event.location}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {event.guest_count != null ? (
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {event.guest_count} guests
              </span>
            ) : null}
            {event.going_count != null ? (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                {event.going_count} going
              </span>
            ) : null}
          </div>
          {event.notes ? (
            <p className="mt-3 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {event.notes}
            </p>
          ) : null}
          <div className="mt-4">
            <button
              type="button"
              onClick={copyShareLink}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 px-3 py-1.5 text-xs font-medium transition"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  Share invite link
                </>
              )}
            </button>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Event actions"
              className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-black/5 text-muted-foreground"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

interface FormState {
  title: string;
  event_type: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  guest_count: string;
  notes: string;
}

function emptyForm(): FormState {
  return {
    title: "",
    event_type: "",
    event_date: "",
    start_time: "",
    end_time: "",
    location: "",
    guest_count: "",
    notes: "",
  };
}

function eventToForm(e: HostEvent): FormState {
  return {
    title: e.title,
    event_type: e.event_type ?? "",
    event_date: e.event_date,
    start_time: e.start_time ?? "",
    end_time: e.end_time ?? "",
    location: e.location ?? "",
    guest_count: e.guest_count != null ? String(e.guest_count) : "",
    notes: e.notes ?? "",
  };
}

function EventFormDialog({
  open,
  editing,
  hostId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  editing: HostEvent | null;
  hostId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  // Track the open<->editing transition so we hydrate the form once
  // per open, not on every render.
  const lastEditingId = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      lastEditingId.current = null;
      return;
    }
    const id = editing?.id ?? null;
    if (lastEditingId.current === id) return;
    lastEditingId.current = id;
    setForm(editing ? eventToForm(editing) : emptyForm());
  }, [open, editing]);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function parseInt(v: string): number | null {
    if (!v.trim()) return null;
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hostId) {
      toast.error("Sign in first");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!form.event_date) {
      toast.error("Date is required");
      return;
    }
    // Hard-cap on date range — browser min/max are soft hints (pasting
    // bypasses them), so we re-check here.
    const minYmd = todayYmd();
    const maxYmd = endOfNextYearYmd();
    if (form.event_date < minYmd || form.event_date > maxYmd) {
      toast.error("Pick a date between today and the end of next year.");
      return;
    }
    setSaving(true);
    const payload = {
      host_id: hostId,
      title: form.title.trim(),
      event_type: form.event_type || null,
      event_date: form.event_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location.trim() || null,
      guest_count: parseInt(form.guest_count),
      notes: form.notes.trim() || null,
    };
    const result = editing
      ? await eventsTable().update(payload).eq("id", editing.id)
      : await eventsTable().insert(payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(editing ? "Event updated" : "Event created");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl">
            {editing ? "Edit event" : "New event"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Sarah & Marcus's Wedding"
              autoFocus
              required
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event_type">Event type</Label>
              <Select
                value={form.event_type}
                onValueChange={(v) => update("event_type", v)}
              >
                <SelectTrigger id="event_type">
                  <SelectValue placeholder="Pick one (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="event_date">Date</Label>
              <Input
                id="event_date"
                type="date"
                value={form.event_date}
                onChange={(e) => update("event_date", e.target.value)}
                min={todayYmd()}
                max={endOfNextYearYmd()}
                required
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">Start time</Label>
              <Input
                id="start_time"
                type="time"
                step={900}
                value={form.start_time}
                onChange={(e) => update("start_time", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">End time</Label>
              <Input
                id="end_time"
                type="time"
                step={900}
                value={form.end_time}
                onChange={(e) => update("end_time", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
              placeholder="Venue or address"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest_count">Guests</Label>
            <Input
              id="guest_count"
              type="number"
              min="0"
              value={form.guest_count}
              onChange={(e) => update("guest_count", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Anything else worth remembering."
            />
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {saving
                ? editing
                  ? "Saving…"
                  : "Creating…"
                : editing
                  ? "Save changes"
                  : "Create event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
