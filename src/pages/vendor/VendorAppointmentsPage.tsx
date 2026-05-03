import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import {
  AppointmentsList,
  type Appointment,
} from "@/components/appointments/AppointmentsList";
import { vendorNavItems as navItems } from "@/data/navItems";

export default function VendorAppointmentsPage() {
  const { user, vendorMemberships } = useAuth();
  const vendorId = vendorMemberships[0]?.vendor_id ?? null;
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user || !vendorId) {
      setAppointments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("appointments")
      .select(
        "id, inquiry_id, vendor_id, host_id, kind, title, location, scheduled_at, duration_minutes, status, proposed_by, notes, host:profiles!appointments_host_id_fkey(display_name)",
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
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorId]);

  useEffect(() => {
    if (!vendorId) return;
    const channel = supabase
      .channel(`vendor-appointments-${vendorId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `vendor_id=eq.${vendorId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            Calendar bookings, tastings, walkthroughs, and consults
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-3xl">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">
              Loading appointments…
            </div>
          ) : !vendorId ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <p className="font-display text-xl mb-2">
                Set up your business profile first
              </p>
              <p className="text-sm text-muted-foreground">
                Once you have a vendor profile, appointments will land here.
              </p>
            </div>
          ) : (
            <AppointmentsList
              appointments={appointments}
              side="vendor"
              onMutate={load}
            />
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
