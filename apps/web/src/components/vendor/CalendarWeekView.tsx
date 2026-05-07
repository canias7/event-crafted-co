import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  format,
  isSameDay,
  isSameMonth,
  startOfWeek,
} from "date-fns";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@/components/appointments/AppointmentsList";

// Editorial-style week view (Mon-Sun) for the vendor Calendar page.
// The primary grid covers business hours (9 AM-5 PM). Off-hours
// (6-9 AM "Before hours" + 5-10 PM "After hours") render as smaller
// secondary grids stacked underneath so vendors can still see + book
// appointments outside the core day without the main view getting
// cluttered. Today's date column-header gets a black circular badge.

// Square cells: HOUR_HEIGHT == day-column width (80px) so every cell
// on the grid is the same height as it is wide. Column width is set
// in the Tailwind grid template (`grid-cols-[64px_repeat(7,80px)]`).
const HOUR_HEIGHT = 80;
// Core business hours: rows 9, 10, 11, 12, 1, 2, 3, 4 PM (8 rows;
// covers 9 AM – 5 PM since each row spans its starting hour to the
// next).
const CORE_FIRST = 9;
const CORE_LAST = 16;
// Pre-business: 6, 7, 8 AM (covers 6 AM – 9 AM).
const PRE_FIRST = 6;
const PRE_LAST = 8;
// Post-business: 5, 6, 7, 8, 9 PM (covers 5 PM – 10 PM).
const POST_FIRST = 17;
const POST_LAST = 21;

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function hourLabel(h: number) {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function hoursInRange(firstHour: number, lastHour: number) {
  return Array.from(
    { length: lastHour - firstHour + 1 },
    (_, i) => firstHour + i,
  );
}

interface Props {
  appointments: Appointment[];
  onSelectAppointment?: (a: Appointment) => void;
}

export function CalendarWeekView({ appointments, onSelectAppointment }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const today = new Date();

  const rangeLabel = useMemo(() => {
    const first = days[0];
    const last = days[6];
    const sameMonth = isSameMonth(first, last);
    if (sameMonth) {
      return `${format(first, "MMM d")} – ${format(last, "d, yyyy")}`;
    }
    return `${format(first, "MMM d")} – ${format(last, "MMM d, yyyy")}`;
  }, [days]);

  // Compact form of the visible week, shown on the action button so
  // it always reflects the week the user is looking at instead of a
  // static "Today" label.
  const compactRangeLabel = useMemo(() => {
    const first = days[0];
    const last = days[6];
    if (isSameMonth(first, last)) {
      return `${format(first, "MMM d")}–${format(last, "d")}`;
    }
    return `${format(first, "MMM d")} – ${format(last, "MMM d")}`;
  }, [days]);

  // Bucket appointments by day-key (YYYY-MM-DD) so each day column
  // only iterates its own.
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const dt = new Date(a.scheduled_at);
      const key = format(dt, "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [appointments]);

  // Track which off-hours grids actually have anything to show. If
  // there are no early / late appointments scheduled in the visible
  // week, hide the empty grid to keep the page tight.
  const hasAppointmentsInRange = (firstHour: number, lastHour: number) => {
    for (const d of days) {
      const key = format(d, "yyyy-MM-dd");
      const dayApts = byDay.get(key) ?? [];
      for (const a of dayApts) {
        const h = new Date(a.scheduled_at).getHours();
        if (h >= firstHour && h <= lastHour) return true;
      }
    }
    return false;
  };

  const showPre = hasAppointmentsInRange(PRE_FIRST, PRE_LAST);
  const showPost = hasAppointmentsInRange(POST_FIRST, POST_LAST);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-3xl tracking-tight">{rangeLabel}</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full h-9 w-9"
            aria-label="Previous week"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full h-9 tnum"
            onClick={() =>
              setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
            }
          >
            {compactRangeLabel}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full h-9 w-9"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Fixed cell sizing keeps every square equal. Wrapper hugs
          the inner grid (~624px) and centers; horizontal scroll is
          available only on viewports narrower than the grid. */}
      <div className="rounded-sm border border-border w-fit mx-auto overflow-x-auto max-w-full">
        <div>
          {/* Day headers (rendered once, sticky-feel via the
              border-b — applies to every grid section below). */}
          <div className="grid grid-cols-[64px_repeat(7,80px)] border-b border-border bg-card">
            <div />
            {days.map((d) => {
              const isToday = isSameDay(d, today);
              return (
                <div
                  key={d.toISOString()}
                  className="px-3 py-3 border-l border-border first:border-l-0"
                >
                  <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    {DAY_LABELS[(d.getDay() + 6) % 7]}
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span
                      className={
                        isToday
                          ? "inline-flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background text-sm font-medium tnum"
                          : "font-display text-lg tnum"
                      }
                    >
                      {format(d, "d")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(d, "MMM")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Core 9 AM – 5 PM grid — primary view. */}
          <WeekHourGrid
            firstHour={CORE_FIRST}
            lastHour={CORE_LAST}
            days={days}
            byDay={byDay}
            onSelect={onSelectAppointment}
          />

          {/* Off-hours: rendered only when the week actually contains
              appointments outside core hours, so the empty case stays
              clean. */}
          {showPre && (
            <OffHoursSection
              label="Before hours"
              firstHour={PRE_FIRST}
              lastHour={PRE_LAST}
              days={days}
              byDay={byDay}
              onSelect={onSelectAppointment}
            />
          )}
          {showPost && (
            <OffHoursSection
              label="After hours"
              firstHour={POST_FIRST}
              lastHour={POST_LAST}
              days={days}
              byDay={byDay}
              onSelect={onSelectAppointment}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function OffHoursSection({
  label,
  firstHour,
  lastHour,
  days,
  byDay,
  onSelect,
}: {
  label: string;
  firstHour: number;
  lastHour: number;
  days: Date[];
  byDay: Map<string, Appointment[]>;
  onSelect?: (a: Appointment) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-[64px_repeat(7,80px)] border-t border-border bg-muted/30">
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {label}
        </div>
        <div className="col-span-7" />
      </div>
      <WeekHourGrid
        firstHour={firstHour}
        lastHour={lastHour}
        days={days}
        byDay={byDay}
        onSelect={onSelect}
      />
    </>
  );
}

function WeekHourGrid({
  firstHour,
  lastHour,
  days,
  byDay,
  onSelect,
}: {
  firstHour: number;
  lastHour: number;
  days: Date[];
  byDay: Map<string, Appointment[]>;
  onSelect?: (a: Appointment) => void;
}) {
  const hours = hoursInRange(firstHour, lastHour);
  return (
    <div className="grid grid-cols-[64px_repeat(7,80px)] relative">
      {/* Left gutter — hour labels */}
      <div className="bg-card">
        {hours.map((h) => (
          <div
            key={h}
            style={{ height: HOUR_HEIGHT }}
            className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-2 pt-1 border-t border-border first:border-t-0"
          >
            {hourLabel(h)}
          </div>
        ))}
      </div>

      {/* Day columns */}
      {days.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const dayApts = byDay.get(key) ?? [];
        return (
          <DayColumn
            key={d.toISOString()}
            firstHour={firstHour}
            lastHour={lastHour}
            appointments={dayApts}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

function DayColumn({
  firstHour,
  lastHour,
  appointments,
  onSelect,
}: {
  firstHour: number;
  lastHour: number;
  appointments: Appointment[];
  onSelect?: (a: Appointment) => void;
}) {
  const hours = hoursInRange(firstHour, lastHour);
  return (
    <div className="relative border-l border-border">
      {/* Each hour cell renders as its own div so the per-cell
          edit / delete icons have a stable anchor in the layout. */}
      {hours.map((h) => (
        <HourCell key={h} />
      ))}

      {/* Appointment blocks overlay — absolutely positioned by their
          start time + duration so they layer on top of the cells. */}
      {appointments.map((a) => (
        <AppointmentBlock
          key={a.id}
          appointment={a}
          firstHour={firstHour}
          lastHour={lastHour}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function HourCell() {
  return (
    <div
      style={{
        height: HOUR_HEIGHT,
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent 0 6px, rgba(0,0,0,0.025) 6px 7px)",
      }}
      className="border-t border-border first:border-t-0"
    />
  );
}

function AppointmentBlock({
  appointment,
  firstHour,
  lastHour,
  onSelect,
}: {
  appointment: Appointment;
  firstHour: number;
  lastHour: number;
  onSelect?: (a: Appointment) => void;
}) {
  const start = new Date(appointment.scheduled_at);
  const minutesFromGridTop =
    (start.getHours() - firstHour) * 60 + start.getMinutes();
  if (minutesFromGridTop < 0) return null;
  const totalMinutes = (lastHour - firstHour + 1) * 60;
  if (minutesFromGridTop >= totalMinutes) return null;

  const top = (minutesFromGridTop / 60) * HOUR_HEIGHT;
  const height = Math.max(
    20,
    (Math.min(appointment.duration_minutes, totalMinutes - minutesFromGridTop) /
      60) *
      HOUR_HEIGHT,
  );

  const status = appointment.status;
  const tone =
    status === "accepted"
      ? "bg-accent/15 text-accent border-accent/40 hover:bg-accent/25"
      : status === "proposed"
        ? "bg-secondary text-secondary-foreground border-border hover:bg-secondary/80"
        : "bg-muted text-muted-foreground border-border opacity-70 line-through";

  const title = appointment.title ?? appointment.kind ?? "Appointment";
  const timeLabel = `${format(start, "h:mm a")} – ${format(
    new Date(start.getTime() + appointment.duration_minutes * 60_000),
    "h:mm a",
  )}`;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(appointment)}
      style={{ top, height }}
      className={`absolute left-1 right-1 rounded-sm border text-left px-2 py-1 transition-colors text-xs leading-tight overflow-hidden ${tone}`}
    >
      <p className="font-medium truncate">{title}</p>
      <p className="text-[10px] tnum opacity-80 truncate">{timeLabel}</p>
      {appointment.host_name && (
        <p className="text-[10px] truncate opacity-70">
          {appointment.host_name}
        </p>
      )}
    </button>
  );
}
