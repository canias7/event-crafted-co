import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Calendar, Copy } from "lucide-react";
import { toast } from "sonner";
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

  const [feedToken, setFeedToken] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("profiles")
      .select("calendar_feed_token")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }: { data: { calendar_feed_token: string | null } | null }) => {
        if (cancelled) return;
        setFeedToken(data?.calendar_feed_token ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  function copyFeedUrl() {
    if (!feedToken) {
      toast.error("Calendar feed isn't ready yet — try again in a moment");
      return;
    }
    // Build the public function URL from the supabase client's URL.
    const supabaseUrl = (supabase as unknown as { supabaseUrl: string })
      .supabaseUrl;
    const url = `${supabaseUrl}/functions/v1/calendar-feed?token=${feedToken}`;
    // webcal:// triggers the OS calendar app's subscribe flow on most
    // platforms; fall back to https:// in the clipboard so users can
    // paste it manually if their system doesn't recognize webcal.
    const webcalUrl = url.replace(/^https?:\/\//i, "webcal://");
    navigator.clipboard.writeText(webcalUrl).then(
      () =>
        toast.success(
          "Calendar URL copied — paste into Google / Apple Calendar's 'Add by URL'",
        ),
      () => toast.error("Couldn't copy"),
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-xl">Appointments</h1>
            <p className="text-sm text-muted-foreground">
              Tastings, walkthroughs, and consultations with your vendors
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copyFeedUrl}
            disabled={!feedToken}
            className="rounded-full"
            title="Subscribe in Google Calendar / Apple Calendar — auto-syncs every few hours"
          >
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            Subscribe to calendar
            <Copy className="w-3 h-3 ml-1.5 opacity-60" />
          </Button>
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
