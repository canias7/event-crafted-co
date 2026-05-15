import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";

// Public-facing availability calendar, Airbnb/Turo style. Combines:
//   - one-off blocked dates (vendor_unavailable_dates)
//   - recurring weekly rules (vendor_availability_rules → projected
//     onto every weekday for the next ~6 months)
//   - accepted appointments (mirrors the vendor's /vendor/calendar
//     week view via the vendor_booked_dates RPC, which exposes only
//     the date — no host or meeting detail leaks to anonymous hosts)
// Renders a non-interactive month calendar with blocked dates struck
// through; tappable dates remain visually open ("inquire to book").
//
// Returns null when the vendor has no availability data (rare —
// typically every vendor has at least one weekly rule once onboarded).

interface RecurringRule {
  day_of_week: number;
  is_unavailable: boolean;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const HORIZON_MONTHS = 6;

export function VendorAvailabilityPublic({ vendorId }: { vendorId: string }) {
  const [oneOffBlocks, setOneOffBlocks] = useState<string[]>([]);
  const [weeklyRules, setWeeklyRules] = useState<RecurringRule[]>([]);
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    (async () => {
      // Today onward, capped at the horizon — no point shipping the
      // entire history of blocks down the wire.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const horizon = new Date(today);
      horizon.setMonth(horizon.getMonth() + HORIZON_MONTHS);

      const [{ data: blocks }, { data: rules }, { data: booked }] =
        await Promise.all([
          supabase
            .from("vendor_unavailable_dates")
            .select("date")
            .eq("vendor_id", vendorId)
            .gte("date", dateKey(today))
            .lte("date", dateKey(horizon)),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("vendor_availability_rules")
            .select("day_of_week, is_unavailable")
            .eq("vendor_id", vendorId),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).rpc("vendor_booked_dates", {
            p_vendor_id: vendorId,
          }),
        ]);
      if (cancelled) return;
      setOneOffBlocks(((blocks as Array<{ date: string }> | null) ?? []).map((r) => r.date));
      setWeeklyRules((rules as RecurringRule[] | null) ?? []);
      // RPC returns rows shaped { vendor_booked_dates: 'YYYY-MM-DD' }
      // when called via PostgREST, OR plain string[] depending on PG
      // version — handle both shapes defensively.
      const bookedRaw = (booked as unknown) ?? [];
      const bookedList = Array.isArray(bookedRaw)
        ? bookedRaw
            .map((row: unknown) =>
              typeof row === "string"
                ? row
                : (row as { vendor_booked_dates?: string }).vendor_booked_dates,
            )
            .filter((s): s is string => typeof s === "string")
        : [];
      setBookedDates(bookedList);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  // Merge one-off blocks, the projected recurring rules, and accepted
  // appointment dates into a single disabled set so the calendar
  // visually matches whatever the vendor sees on /vendor/calendar.
  const blockedDateObjects = useMemo(() => {
    const set = new Set(oneOffBlocks);
    for (const d of bookedDates) set.add(d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const closedDays = new Set(
      weeklyRules.filter((r) => r.is_unavailable).map((r) => r.day_of_week),
    );
    if (closedDays.size > 0) {
      const horizon = new Date(today);
      horizon.setMonth(horizon.getMonth() + HORIZON_MONTHS);
      for (const d = new Date(today); d <= horizon; d.setDate(d.getDate() + 1)) {
        if (closedDays.has(d.getDay())) set.add(dateKey(d));
      }
    }
    return Array.from(set).map(parseDate);
  }, [oneOffBlocks, weeklyRules, bookedDates]);

  if (!loaded) return null;
  if (
    blockedDateObjects.length === 0 &&
    weeklyRules.length === 0 &&
    bookedDates.length === 0
  ) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div>
      <p className="font-label text-accent mb-4">Availability</p>
      <h2 className="font-display text-3xl mb-3">When they're free</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xl leading-relaxed">
        Crossed-out dates are already booked or blocked. Open dates are
        still available — send an inquiry to confirm and lock in.
      </p>

      <div className="card-soft p-4 sm:p-6 inline-block">
        <Calendar
          mode="single"
          selected={undefined}
          // Read-only — no click handler so dates can't be selected.
          onSelect={() => {}}
          disabled={{ before: today }}
          numberOfMonths={2}
          className="mx-auto"
          modifiers={{
            blocked: blockedDateObjects,
          }}
          modifiersClassNames={{
            blocked:
              "line-through text-muted-foreground/70 bg-muted/40 hover:bg-muted/40",
          }}
        />
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-muted/40 line-through inline-block" />
          Booked / blocked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarIcon className="w-3 h-3" />
          Open dates — send an inquiry to confirm
        </span>
      </div>
    </div>
  );
}
