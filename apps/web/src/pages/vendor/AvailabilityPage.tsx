import { useEffect, useState } from "react";
import { Calendar as CalendarIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { VENDOR_CALENDAR_HUB_TABS } from "@/data/hubTabs";
import { RecurringAvailabilityCard } from "@/components/vendor/RecurringAvailabilityCard";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { vendorNavItems as navItems } from "@/data/navItems";

const unavailableTable = () => supabase.from("vendor_unavailable_dates");

function dateKey(d: Date) {
  // Format as YYYY-MM-DD in local time
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(s: string) {
  // s is "YYYY-MM-DD"; build in local time
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function AvailabilityPage() {
  const { user, vendorMemberships } = useAuth();
  const vendorId = vendorMemberships[0]?.vendor_id ?? null;
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function loadDates() {
    if (!user || !vendorId) {
      setLoading(false);
      return;
    }
    const { data: rows } = await unavailableTable()
      .select("date")
      .eq("vendor_id", vendorId);
    setUnavailable(new Set((rows ?? []).map((r) => r.date)));
    setLoading(false);
  }

  useEffect(() => {
    loadDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorId]);

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
      // Roll back
      setUnavailable((prev) => {
        const next = new Set(prev);
        if (wasUnavailable) next.add(key);
        else next.delete(key);
        return next;
      });
      toast.error(error.message);
    }
  }

  const upcoming = Array.from(unavailable)
    .filter((k) => parseDate(k) >= new Date(new Date().toDateString()))
    .sort();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border/40 bg-card/60 backdrop-blur px-4 md:px-8 py-5 sticky top-0 z-40 space-y-3">
          <div>
            <h1 className="font-editorial text-3xl">Availability</h1>
            <p className="text-sm text-muted-foreground">
              Block dates you're not taking events
            </p>
          </div>
          <SubNavTabs tabs={VENDOR_CALENDAR_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-6">
          {loading ? (
            <Skeleton className="h-[420px] w-full rounded-sm" />
          ) : !vendorId ? (
            <div className="card-soft p-8 text-center">
              <CalendarIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-display text-xl mb-2">
                Set up your business profile first
              </p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Availability is per-vendor — finish your business profile so
                we know who's blocking dates.
              </p>
            </div>
          ) : (
            <>
              {/* Recurring rules + buffer time. Sit above the one-off
                  date picker so vendors set up their default pattern
                  first, then exception-block specific dates below. */}
              <RecurringAvailabilityCard vendorId={vendorId} />

              <div className="card-soft p-4 sm:p-6">
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
                  <span className="font-medium text-foreground">blocked</span>.
                </p>
              </div>

              <div className="card-soft p-5">
                <p className="font-label text-muted-foreground mb-3">
                  Blocked dates ({upcoming.length})
                </p>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No upcoming blocked dates. Click any future day on the
                    calendar to block it.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {upcoming.map((k) => (
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
            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
