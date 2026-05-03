import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import {
  AppointmentsList,
  type Appointment,
} from "@/components/appointments/AppointmentsList";
import { customerNavItems as navItems } from "@/data/navItems";

export default function AppointmentsPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("appointments")
      .select(
        "id, inquiry_id, vendor_id, host_id, kind, title, location, scheduled_at, duration_minutes, status, proposed_by, notes, vendor:vendor_profiles!appointments_vendor_id_fkey(business_name)",
      )
      .eq("host_id", user.id)
      .order("scheduled_at", { ascending: true });

    const rows = ((data as Array<Appointment & { vendor: { business_name: string } | null }> | null) ?? []).map(
      (r) => ({
        ...r,
        vendor_name: r.vendor?.business_name ?? null,
      }),
    );
    setAppointments(rows);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime: refetch on any change to appointments where I'm the host.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`host-appointments-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `host_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            Tastings, walkthroughs, and consultations with your vendors
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-3xl">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">
              Loading appointments…
            </div>
          ) : (
            <AppointmentsList
              appointments={appointments}
              side="host"
              onMutate={load}
            />
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
