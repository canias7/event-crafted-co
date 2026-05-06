import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
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
import { CalendarWeekView } from "@/components/vendor/CalendarWeekView";
import { Calendar } from "@/components/ui/calendar";
import { vendorNavItems as navItems } from "@/data/navItems";

// Vendor Calendar dashboard. Three sections, top to bottom:
//   1. Week-view calendar (appointments rendered as time blocks)
//   2. Upcoming-appointments detail list (Accept/Decline/Reschedule)
//   3. Block-specific-dates month picker
// Recurring weekly rules + Google-Calendar sync + the redundant
// blocked-dates list were removed at the user's request to keep this
// page focused on appointments + the one date-block surface.
// Routes /vendor/appointments and /vendor/availability both land here.

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

  // One-off blocked dates (vendor_unavailable_dates)
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [availabilityLoading, setAvailabilityLoading] = useState(true);

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
    const { data: rows } = await unavailableTable()
      .select("date")
      .eq("vendor_id", vendorId);
    setUnavailable(new Set((rows ?? []).map((r) => r.date)));
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

  async function toggleDate(date: Date) {
    if (!vendorId) return;
    const key = dateKey(date);
    const wasUnavailable = unavailable.has(key);

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
              {/* Week-view calendar — primary surface for the page.
                  Appointments render as blocks positioned by their
                  scheduled_at + duration_minutes; clicking a block
                  jumps to the appointment detail row below. */}
              <section>
                {appointmentsLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading calendar…
                  </p>
                ) : (
                  <CalendarWeekView
                    appointments={appointments}
                    onSelectAppointment={(a) => {
                      const el = document.getElementById(
                        `appointment-${a.id}`,
                      );
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                      }
                    }}
                  />
                )}
              </section>

              {/* Detail list under the week view — keeps the existing
                  Accept/Decline/Reschedule actions one tap away. */}
              {!appointmentsLoading && appointments.length > 0 && (
                <section>
                  <h2 className="font-display text-lg mb-3">
                    Upcoming appointments
                  </h2>
                  <AppointmentsList
                    appointments={appointments}
                    side="vendor"
                    onMutate={loadAppointments}
                  />
                </section>
              )}

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
                        .
                      </p>
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
