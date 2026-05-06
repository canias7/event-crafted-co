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
// Hours stack vertically, days fan across the columns, appointments
// render as absolutely-positioned blocks inside the day they belong
// to. The header drives navigation: prev/next/Today buttons + week
// range. Today's date in the column header gets a black circular
// badge to anchor the user without colored row backgrounds.

const HOUR_HEIGHT = 64; // px per hour row
const FIRST_HOUR = 6; // 6 AM
const LAST_HOUR = 22; // 10 PM
const HOURS = Array.from(
  { length: LAST_HOUR - FIRST_HOUR + 1 },
  (_, i) => FIRST_HOUR + i,
);
const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function hourLabel(h: number) {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
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
            className="rounded-full h-9"
            onClick={() =>
              setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
            }
          >
            Today
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

      <div className="overflow-x-auto rounded-sm border border-border">
        <div className="min-w-[840px]">
          {/* Day headers */}
          <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-border bg-card">
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

          {/* Hour grid */}
          <div className="grid grid-cols-[64px_repeat(7,1fr)] relative">
            {/* Left gutter — hour labels */}
            <div className="bg-card">
              {HOURS.map((h) => (
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
                  date={d}
                  appointments={dayApts}
                  onSelect={onSelectAppointment}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayColumn({
  date,
  appointments,
  onSelect,
}: {
  date: Date;
  appointments: Appointment[];
  onSelect?: (a: Appointment) => void;
}) {
  return (
    <div
      className="relative border-l border-border"
      style={{
        height: HOURS.length * HOUR_HEIGHT,
        // Subtle diagonal striping across the cells — gives the
        // "available time" look without coloring every empty cell.
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent 0 6px, rgba(0,0,0,0.025) 6px 7px)",
      }}
    >
      {/* Hour grid lines (visual only — match the gutter row heights). */}
      {HOURS.map((h, i) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-border first:border-t-0"
          style={{ top: i * HOUR_HEIGHT }}
        />
      ))}

      {/* Appointment blocks */}
      {appointments.map((a) => (
        <AppointmentBlock
          key={a.id}
          appointment={a}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function AppointmentBlock({
  appointment,
  onSelect,
}: {
  appointment: Appointment;
  onSelect?: (a: Appointment) => void;
}) {
  const start = new Date(appointment.scheduled_at);
  const minutesFromGridTop =
    (start.getHours() - FIRST_HOUR) * 60 + start.getMinutes();
  if (minutesFromGridTop < 0) return null; // before grid window
  const totalMinutes = (LAST_HOUR - FIRST_HOUR + 1) * 60;
  if (minutesFromGridTop >= totalMinutes) return null; // after grid window

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
