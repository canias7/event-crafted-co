import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import {
  AppointmentsList,
  type Appointment,
} from "@/components/appointments/AppointmentsList";
import { RecurringAvailabilityCard } from "@/components/vendor/RecurringAvailabilityCard";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { vendorNavItems as navItems } from "@/data/navItems";

// Unified Calendar dashboard for vendors. Merges what used to live on
// two separate pages (Appointments + Availability) into a single
// scrollable view: appointments at the top, then weekly rules, the
// date-block calendar and the list of blocked
// dates. Routes /vendor/appointments and /vendor/availability both
// land here so existing links keep working.

interface BusyEvent {
  external_event_id: string;
  summary: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
}

const unavailableTable = () => supabase.from("vendor_unavailable_dates");

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function VendorAppointmentsPage() {
  const { user, vendorMemberships } = useAuth();
  const vendorId = vendorMemberships[0]?.vendor_id ?? null;

  // Appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);

  // Availability
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [busyEvents, setBusyEvents] = useState<BusyEvent[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function loadAppointments() {
    if (!user || !vendorId) {
      setAppointments([]);
      setAppointmentsLoading(false);
      return;
    }
    setAppointmentsLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("appointments")
      .select(
        "id, inquiry_id, vendor_id, host_id, kind, title, location, scheduled_at, duration_minutes, status, proposed_by, notes, meeting_url, meeting_provider, host:profiles!appointments_host_id_fkey(display_name)",
      )
      .eq("vendor_id", vendorId)
      .order("scheduled_at", { ascending: true });

    const rows = ((data as Array<Appointment & { host: { display_name: string | null } | null }> | null) ?? []).map(
      (r) => ({
        ...r,
        host_name: r.host?.display_name ?? null,
      }),
    );
    setAppointments(rows);
    setAppointmentsLoading(false);
  }

  async function loadAvailability() {
    if (!user || !vendorId) {
      setAvailabilityLoading(false);
      return;
    }
    const [{ data: rows }, { data: busy }] = await Promise.all([
      unavailableTable().select("date").eq("vendor_id", vendorId),
      // calendar_synced_busy isn't in the generated types yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("calendar_synced_busy")
        .select("external_event_id, summary, starts_at, ends_at, is_all_day")
        .eq("user_id", user.id)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true }),
    ]);
    setUnavailable(new Set((rows ?? []).map((r) => r.date)));
    setBusyEvents((busy as BusyEvent[]) ?? []);
    setAvailabilityLoading(false);
  }

  useEffect(() => {
    loadAppointments();
    loadAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorId]);

  // Realtime — refresh appointments list as bookings come in.
  const realtimeConfig = useMemo(
    () =>
      vendorId
        ? { table: "appointments", filter: `vendor_id=eq.${vendorId}` }
        : null,
    [vendorId],
  );
  useRealtime(realtimeConfig, () => loadAppointments());

  const busyDays = useMemo(() => {
    const set = new Set<string>();
    for (const e of busyEvents) {
      const start = new Date(e.starts_at);
      const end = new Date(e.ends_at);
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      while (cursor <= end) {
        set.add(dateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return set;
  }, [busyEvents]);

  async function toggleDate(date: Date) {
    if (!vendorId) return;
    const key = dateKey(date);
    const wasUnavailable = unavailable.has(key);

    setPendingKey(key);
    setUnavailable((prev) => {
      const next = new Set(prev);
      if (wasUnavailable) next.delete(key);
      else next.add(key);
      return next;
    });

    const { error } = wasUnavailable
      ? await unavailableTable()
          .delete()
          .eq("vendor_id", vendorId)
          .eq("date", key)
      : await unavailableTable().insert({ vendor_id: vendorId, date: key });

    setPendingKey(null);

    if (error) {
      setUnavailable((prev) => {
        const next = new Set(prev);
        if (wasUnavailable) next.add(key);
        else next.delete(key);
        return next;
      });
      toast.error(error.message);
    }
  }

  const upcomingBlocked = Array.from(unavailable)
    .filter((k) => parseDate(k) >= new Date(new Date().toDateString()))
    .sort();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const noVendor = !vendorId;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Upcoming appointments, weekly availability, and blocked dates
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-10">
          {noVendor ? (
            <div className="rounded-sm border border-border bg-card p-8 text-center">
              <CalendarIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-display text-xl mb-2">
                Set up your business profile first
              </p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Calendar tools are per-vendor — finish your business profile
                so we know who's blocking dates + receiving bookings.
              </p>
            </div>
          ) : (
            <>
              {/* Appointments — top of the page since this is where
                  vendors land most often when checking the calendar. */}
              <section>
                <h2 className="font-display text-lg mb-3">
                  Upcoming appointments
                </h2>
                {appointmentsLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading appointments…
                  </p>
                ) : (
                  <AppointmentsList
                    appointments={appointments}
                    side="vendor"
                    onMutate={loadAppointments}
                  />
                )}
              </section>

              {/* Weekly recurring availability rules + buffer time. */}
              <section className="space-y-3">
                <h2 className="font-display text-lg">Weekly availability</h2>
                {availabilityLoading ? (
                  <Skeleton className="h-64 w-full rounded-sm" />
                ) : (
                  <RecurringAvailabilityCard vendorId={vendorId!} />
                )}
              </section>

              {availabilityLoading ? null : (
                <>
                  {/* One-off date blocking. Selected dates win over
                      recurring rules — explicit blocks are absolute. */}
                  <section className="space-y-3">
                    <h2 className="font-display text-lg">Block specific dates</h2>
                    <div className="rounded-sm border border-border bg-card p-4 sm:p-6">
                      <Calendar
                        mode="multiple"
                        selected={Array.from(unavailable).map(parseDate)}
                        onDayClick={(d) => toggleDate(d)}
                        disabled={{ before: today }}
                        numberOfMonths={1}
                        className="mx-auto"
                        modifiers={{
                          busy: Array.from(busyDays).map(parseDate),
                        }}
                        modifiersClassNames={{
                          busy:
                            "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-accent relative",
                        }}
                        classNames={{
                          day_selected:
                            "bg-foreground text-background hover:bg-foreground/90 focus:bg-foreground",
                        }}
                      />
                      <p className="text-xs text-muted-foreground text-center mt-4">
                        Click a date to toggle. Selected dates are{" "}
                        <span className="font-medium text-foreground">
                          blocked
                        </span>
                        {busyDays.size > 0 && (
                          <>
                            ; dots are{" "}
                            <span className="text-accent">
                              synced from your connected calendar
                            </span>
                          </>
                        )}
                        .
                      </p>
                    </div>
                  </section>

                  {/* Compact list of upcoming blocked dates with one-
                      tap unblock. */}
                  <section>
                    <div className="rounded-sm border border-border bg-card p-5">
                      <p className="font-label text-muted-foreground mb-3">
                        Blocked dates ({upcomingBlocked.length})
                      </p>
                      {upcomingBlocked.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No upcoming blocked dates. Click any future day on
                          the calendar to block it.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {upcomingBlocked.map((k) => (
                            <Button
                              key={k}
                              variant="outline"
                              size="sm"
                              className="rounded-full h-8 text-xs"
                              disabled={pendingKey === k}
                              onClick={() => toggleDate(parseDate(k))}
                            >
                              <span className="tnum">{k}</span>
                              {pendingKey === k ? (
                                <Loader2 className="w-3 h-3 ml-1.5 animate-spin" />
                              ) : (
                                <X className="w-3 h-3 ml-1.5" />
                              )}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
