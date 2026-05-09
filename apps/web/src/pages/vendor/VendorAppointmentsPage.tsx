import { useEffect, useMemo, useState } from "react";
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
import { vendorNavItems as navItems } from "@/data/navItems";

// Vendor Calendar dashboard. Two sections, top to bottom:
//   1. Week-view calendar (appointments rendered as time blocks)
//   2. Upcoming-appointments detail list (Accept/Decline/Reschedule)
// Recurring weekly rules, Google Calendar sync, blocked-dates list,
// and the month-grid date blocker were all removed at the user's
// request. Routes /vendor/appointments and /vendor/availability both
// land here.

export default function VendorAppointmentsPage() {
  const { user, vendorMemberships } = useAuth();
  const vendorId = vendorMemberships[0]?.vendor_id ?? null;

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);

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

  useEffect(() => {
    loadAppointments();
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

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Upcoming appointments at a glance
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-4xl space-y-10">
          {/* Week-view calendar — primary surface for the page.
              Renders for every signed-in vendor account (even before
              the business profile exists), so a brand-new vendor sees
              their week immediately. Appointments render as blocks
              positioned by their scheduled_at + duration_minutes;
              clicking a block jumps to the appointment detail row
              below. */}
          <section>
            {appointmentsLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading calendar…
              </p>
            ) : (
              <CalendarWeekView
                appointments={appointments}
                onSelectAppointment={(a) => {
                  const el = document.getElementById(`appointment-${a.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }}
              />
            )}
          </section>

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
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
