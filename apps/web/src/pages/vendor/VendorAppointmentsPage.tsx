// Vendor calendar — month-grid primary view + actionable upcoming
// appointments list. Mirrors apps/vendor-mobile/app/(vendor)/calendar.tsx.
//
// Three data streams render onto the month grid, scoped to ONE listing
// at a time (picked via the listing dropdown above the grid):
//   • inquiries (status = 'won')      → BOOKED   (ink fill, cream digit)
//   • inquiries (new/replied)         → PENDING  (soft amber fill)
//   • vendor_unavailable_dates        → BLOCKED  (diagonal hatch)
//
// Blocking a day writes a vendor_unavailable_dates row for the selected
// listing only — its public listing page reflects the block immediately
// via VendorAvailabilityPublic. Other listings stay open.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  X as XIcon,
} from "lucide-react";
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
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { vendorNavItems as navItems } from "@/data/navItems";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const DAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

type DayState = "available" | "booked" | "pending" | "blocked";

interface InquiryRow {
  id: string;
  status: string;
  event_date: string | null;
  event_type: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  host_id: string;
  host: { display_name: string | null } | null;
}

interface ListingOpt {
  id: string;
  business_name: string | null;
  category: string | null;
  location: string | null;
  application_status: "pending" | "approved" | "rejected" | null;
  logo_url: string | null;
}

function ymdKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function parseYmd(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function fmtMoneyShort(cents: number): string {
  if (cents >= 100_000_000) return `$${(cents / 100_000_000).toFixed(1)}M`;
  if (cents >= 100_000) return `$${(cents / 100_000).toFixed(1)}k`;
  return `$${Math.round(cents / 100)}`;
}

function statusLabel(s: string): string {
  switch (s) {
    case "won":
      return "Confirmed";
    case "new":
      return "Awaiting reply";
    case "replied":
      return "Replied";
    case "drafted":
      return "Drafting reply";
    case "lost":
      return "Lost";
    case "expired":
      return "Expired";
    default:
      return s;
  }
}

function prettyDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function VendorAppointmentsPage() {
  const { user } = useAuth();

  // All listings this vendor owns (up to 5). The calendar scopes to ONE
  // listing at a time — selectedListingId drives every query + write.
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    null,
  );
  const [listingPickerOpen, setListingPickerOpen] = useState(false);

  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  // Blocked-date map: date string → optional reason/title the vendor
  // typed when adding the block ("Christian's birthday", "Vacation",
  // etc). The reason is private to the vendor side — the public
  // availability surface only selects `date` from this table, so
  // hosts never see the title.
  const [manualBlocks, setManualBlocks] = useState<Map<string, string | null>>(
    () => new Map(),
  );
  // Recurring weekly rules — vendor sets "I never work Sundays" /
  // "Mondays are off" once and the calendar applies that pattern
  // forever. Keyed by day_of_week (0=Sun..6=Sat). Value true means
  // "vendor is unavailable this weekday". Backed by
  // vendor_availability_rules; one row per (vendor, weekday).
  const [recurringOff, setRecurringOff] = useState<Set<number>>(
    () => new Set(),
  );
  const [savingRecurring, setSavingRecurring] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocking, setBlocking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedYmd, setSelectedYmd] = useState<string | null>(() =>
    ymdKey(new Date()),
  );

  // Appointments (separate row in DB; surfaces in the actionable list
  // below the calendar — scoped to the selected listing).
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setListingsLoading(true);
      const { data } = await supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, location, application_status, logo_url",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const rows = (data ?? []) as ListingOpt[];
      setListings(rows);
      // Preselect the first APPROVED listing on load — pending /
      // rejected listings can't be managed here (hosts can't book them
      // yet), so anchoring on them by default would leave the vendor
      // staring at a calendar that doesn't accept changes. If no
      // listings are approved we leave selection null and render an
      // empty state below.
      const firstApproved = rows.find(
        (l) => l.application_status === "approved",
      );
      setSelectedListingId((prev) => prev ?? firstApproved?.id ?? null);
      setListingsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === selectedListingId) ?? null,
    [listings, selectedListingId],
  );

  const monthBounds = useMemo(() => {
    const start = new Date(viewMonth);
    const end = new Date(viewMonth);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }, [viewMonth]);

  const loadCalendar = useCallback(async () => {
    if (!selectedListingId || !user?.id) {
      setInquiries([]);
      setManualBlocks(new Map());
      setLoading(false);
      return;
    }
    // Belt-and-braces: only query a listing the user actually owns.
    // RLS would silently return zero rows for someone else's id (URL
    // injection, stale state from logging in as a different account),
    // which reads as "no bookings" — indistinguishable from genuinely
    // free dates. Bail out fast with an empty calendar instead.
    if (
      !listingsLoading &&
      listings.length > 0 &&
      !listings.some((l) => l.id === selectedListingId)
    ) {
      setInquiries([]);
      setManualBlocks(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const startYmd = ymdKey(monthBounds.start);
    const endYmd = ymdKey(monthBounds.end);
    const [inqRes, blockRes, recurringRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("inquiries")
        .select(
          "id, status, event_date, event_type, budget_min_cents, budget_max_cents, host_id, host:profiles!inquiries_host_id_fkey(display_name)",
        )
        .eq("vendor_id", selectedListingId)
        .gte("event_date", startYmd)
        .lt("event_date", endYmd),
      supabase
        .from("vendor_unavailable_dates")
        .select("date, reason")
        .eq("vendor_id", selectedListingId)
        .gte("date", startYmd)
        .lt("date", endYmd),
      // Recurring weekday rules (vendor never works Mondays etc).
      // Scoped to the selected listing; same vendor's other listings
      // may have different recurring schedules.
      supabase
        .from("vendor_availability_rules")
        .select("day_of_week, is_unavailable")
        .eq("vendor_id", selectedListingId),
    ]);
    setInquiries((inqRes.data ?? []) as InquiryRow[]);
    setManualBlocks(
      new Map(
        ((blockRes.data ?? []) as Array<{
          date: string;
          reason: string | null;
        }>).map((r) => [r.date, r.reason]),
      ),
    );
    setRecurringOff(
      new Set(
        ((recurringRes.data ?? []) as Array<{
          day_of_week: number;
          is_unavailable: boolean;
        }>)
          .filter((r) => r.is_unavailable)
          .map((r) => r.day_of_week),
      ),
    );
    setLoading(false);
  }, [selectedListingId, user?.id, monthBounds, listings, listingsLoading]);

  async function toggleRecurring(dow: number, willBeOff: boolean) {
    if (!selectedListingId || savingRecurring !== null) return;
    setSavingRecurring(dow);
    // Optimistic local update so the switch flips instantly.
    setRecurringOff((prev) => {
      const next = new Set(prev);
      if (willBeOff) next.add(dow);
      else next.delete(dow);
      return next;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_availability_rules")
      .upsert(
        {
          vendor_id: selectedListingId,
          day_of_week: dow,
          is_unavailable: willBeOff,
        },
        { onConflict: "vendor_id,day_of_week" },
      );
    setSavingRecurring(null);
    if (error) {
      // Roll back the local state on failure.
      setRecurringOff((prev) => {
        const next = new Set(prev);
        if (willBeOff) next.delete(dow);
        else next.add(dow);
        return next;
      });
      toast.error(`Couldn't update: ${error.message}`);
    }
  }

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const loadAppointments = useCallback(async () => {
    if (!user || !selectedListingId) {
      setAppointments([]);
      setAppointmentsLoading(false);
      return;
    }
    setAppointmentsLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Bound to ~90 days back so years-old history doesn't bloat the
    // payload. The calendar grid and "upcoming" lists only need the
    // recent window; deeper history can be exposed via a dedicated
    // archive view later.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const { data } = await (supabase as any)
      .from("appointments")
      .select(
        "id, inquiry_id, vendor_id, host_id, kind, title, location, scheduled_at, duration_minutes, status, proposed_by, notes, host:profiles!appointments_host_id_fkey(display_name)",
      )
      .eq("vendor_id", selectedListingId)
      .gte("scheduled_at", cutoff.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(500);
    const rows = (
      (data as Array<
        Appointment & { host: { display_name: string | null } | null }
      > | null) ?? []
    ).map((r) => ({ ...r, host_name: r.host?.display_name ?? null }));
    setAppointments(rows);
    setAppointmentsLoading(false);
  }, [user, selectedListingId]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const realtimeAppointments = useMemo(
    () =>
      selectedListingId
        ? { table: "appointments", filter: `vendor_id=eq.${selectedListingId}` }
        : null,
    [selectedListingId],
  );
  useRealtime(realtimeAppointments, () => loadAppointments());

  // Audit #10: refresh the BOOKED/BLOCKED overlays when an inquiry
  // is won/lost (changes the booked-date set) or a teammate adds a
  // block on vendor_unavailable_dates. Without these, the calendar
  // shows stale state until the vendor manually reloads.
  const realtimeInquiries = useMemo(
    () =>
      selectedListingId
        ? { table: "inquiries", filter: `vendor_id=eq.${selectedListingId}` }
        : null,
    [selectedListingId],
  );
  useRealtime(realtimeInquiries, () => {
    // Inquiries change → calendar grid needs new dot colors AND
    // the appointments list might gain/lose a row. Refresh both.
    void loadCalendar();
    void loadAppointments();
  });
  const realtimeUnavailable = useMemo(
    () =>
      selectedListingId
        ? { table: "vendor_unavailable_dates", filter: `vendor_id=eq.${selectedListingId}` }
        : null,
    [selectedListingId],
  );
  useRealtime(realtimeUnavailable, () => {
    // Blocked-date rows only affect the calendar grid + the day
    // info panel (which both read from manualBlocks). loadCalendar
    // covers both. Previously this called loadAppointments() which
    // only refreshes the bottom list — vendors on a second tab
    // never saw the hatch update from another tab's block.
    void loadCalendar();
  });

  const dayState = useMemo(() => {
    const m = new Map<string, DayState>();
    for (const i of inquiries) {
      const d = parseYmd(i.event_date);
      if (!d) continue;
      const key = ymdKey(d);
      const prev = m.get(key);
      if (i.status === "won") m.set(key, "booked");
      else if (
        (i.status === "new" ||
          i.status === "replied" ||
          i.status === "drafted") &&
        prev !== "booked"
      ) {
        m.set(key, "pending");
      }
    }
    // Recurring weekday-off rules paint every matching weekday in
    // the visible month as blocked (unless already booked / pending).
    // Walking the month bounds is cheaper than rebuilding the whole
    // dayState on every render; we already know the start/end.
    if (recurringOff.size > 0) {
      const cursor = new Date(monthBounds.start);
      const end = new Date(monthBounds.end);
      while (cursor < end) {
        if (recurringOff.has(cursor.getDay())) {
          const k = ymdKey(cursor);
          const prev = m.get(k);
          if (prev !== "booked" && prev !== "pending") m.set(k, "blocked");
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    // One-off manual blocks layer on top. Iterating .keys() (not the
    // Map directly) so we get the date strings — `for ... of` on a
    // Map yields [k, v] tuples by default which would set Map entries
    // with array keys and never match the public day-cell lookup.
    for (const ymd of manualBlocks.keys()) {
      const prev = m.get(ymd);
      if (prev !== "booked" && prev !== "pending") m.set(ymd, "blocked");
    }
    return m;
  }, [inquiries, manualBlocks, recurringOff, monthBounds]);

  // Header stats (booked/pending/earnings) were removed — vendors
  // don't transact through the app, so the dollar value is misleading.

  const selectedItems = useMemo(() => {
    if (!selectedYmd) return [];
    const out: Array<{
      kind: "inquiry" | "busy";
      inquiryId: string | null;
      title: string;
      subtitle: string;
      amountCents: number | null;
      accent: "booked" | "pending" | "muted";
      timeLabel: string | null;
    }> = [];
    for (const i of inquiries) {
      const d = parseYmd(i.event_date);
      if (!d || ymdKey(d) !== selectedYmd) continue;
      out.push({
        kind: "inquiry",
        inquiryId: i.id,
        title: i.event_type
          ? i.event_type[0].toUpperCase() + i.event_type.slice(1)
          : "Booking",
        subtitle:
          (i.host?.display_name ?? "Host") + " · " + statusLabel(i.status),
        amountCents: i.budget_min_cents ?? i.budget_max_cents,
        accent: i.status === "won" ? "booked" : "pending",
        timeLabel: null,
      });
    }
    if (manualBlocks.has(selectedYmd)) {
      const reason = manualBlocks.get(selectedYmd)?.trim() ?? "";
      // 'Blocked manually' is the legacy hardcoded fallback from
      // before the title input existed (PR #852). Treat it as
      // no-title so older blocks display as plain "Blocked"
      // instead of the awkward "Blocked manually" string.
      const isLegacyFallback = reason === "Blocked manually";
      out.push({
        kind: "busy",
        inquiryId: null,
        title: reason && !isLegacyFallback ? reason : "Blocked",
        subtitle: "Marked unavailable",
        amountCents: null,
        accent: "muted",
        timeLabel: "All day",
      });
    }
    return out;
  }, [selectedYmd, inquiries, manualBlocks]);

  const isSelectedBlocked =
    !!selectedYmd && manualBlocks.has(selectedYmd);
  // Title input state for the block dialog. Reset to blank on each
  // open; if the vendor is opening a date that's already blocked
  // (i.e. they're about to unblock) we don't show the input.
  const [blockTitle, setBlockTitle] = useState("");

  async function commitSelectedDayBlock() {
    if (!selectedYmd || !selectedListingId || blocking) return;
    const willBlock = !isSelectedBlocked;
    const verb = willBlock ? "Block" : "Unblock";
    setConfirmOpen(false);
    setBlocking(true);
    if (willBlock) {
      const trimmedTitle = blockTitle.trim();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_unavailable_dates")
        .upsert(
          [
            {
              vendor_id: selectedListingId,
              date: selectedYmd,
              reason: trimmedTitle.length > 0 ? trimmedTitle : "Blocked manually",
            },
          ],
          { onConflict: "vendor_id,date" },
        );
      setBlocking(false);
      setBlockTitle("");
      if (error) {
        toast.error(`Couldn't ${verb.toLowerCase()}: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase
        .from("vendor_unavailable_dates")
        .delete()
        .eq("vendor_id", selectedListingId)
        .eq("date", selectedYmd);
      setBlocking(false);
      if (error) {
        toast.error(`Couldn't unblock: ${error.message}`);
        return;
      }
    }
    loadCalendar();
  }

  // Edit the title of an already-blocked date. UPDATE the reason
  // on vendor_unavailable_dates. Optimistic local update so the
  // input doesn't flicker while waiting for the round trip.
  async function editBlockTitle(ymd: string, newTitle: string) {
    if (!selectedListingId) return;
    const trimmed = newTitle.trim();
    const reasonForDb = trimmed.length > 0 ? trimmed : "Blocked manually";
    setManualBlocks((prev) => {
      const next = new Map(prev);
      next.set(ymd, reasonForDb);
      return next;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_unavailable_dates")
      .update({ reason: reasonForDb })
      .eq("vendor_id", selectedListingId)
      .eq("date", ymd);
    if (error) {
      toast.error(`Couldn't update title: ${error.message}`);
      // Roll the local map back by reloading from the server.
      void loadCalendar();
    }
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + delta);
    setViewMonth(next);
  }

  function jumpToToday() {
    const today = new Date();
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedYmd(ymdKey(today));
  }

  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-editorial text-3xl">Calendar</h1>
            <p className="text-sm text-muted-foreground">
              Manage your bookings &amp; availability
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell variant="light" />
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-4xl space-y-6">
          {/* Listing picker — every block / inquiry on the grid is
              scoped to whichever listing the vendor picks here. Only
              approved listings are selectable; pending / rejected ones
              render in the picker for visibility but can't be chosen. */}
          {!listingsLoading && listings.length === 0 ? (
            <NoListingsEmptyState />
          ) : !listingsLoading &&
            !listings.some((l) => l.application_status === "approved") ? (
            <PendingApprovalEmptyState />
          ) : (
            <ListingPicker
              listings={listings}
              loading={listingsLoading}
              selectedId={selectedListingId}
              onSelect={(id) => {
                setSelectedListingId(id);
                setListingPickerOpen(false);
              }}
              open={listingPickerOpen}
              onOpenChange={setListingPickerOpen}
            />
          )}

          {selectedListingId && (
            <>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-editorial text-2xl">{monthLabel}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => shiftMonth(-1)}
                  className="w-9 h-9 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => shiftMonth(1)}
                  className="w-9 h-9 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="card-soft p-4">
              {loading ? (
                <Skeleton className="h-72 w-full rounded-md" />
              ) : (
                <MonthGrid
                  month={viewMonth}
                  dayState={dayState}
                  selectedYmd={selectedYmd}
                  onSelect={(k) => setSelectedYmd(k)}
                />
              )}
              <div className="mt-4 pt-3 border-t border-border flex justify-around text-xs font-bold">
                <LegendDot swatchClass="bg-foreground" label="Booked" />
                <LegendDot swatchClass="bg-amber-200" label="Pending" />
                <LegendDot swatchClass="hatch" label="Blocked" />
              </div>
            </div>
          </div>

          {selectedYmd ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-editorial text-xl">
                  {prettyDay(selectedYmd)}
                </h3>
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={blocking || !selectedListingId}
                  className="inline-flex items-center gap-1 rounded-full bg-foreground text-background px-3.5 py-2 text-xs font-bold disabled:opacity-60"
                >
                  {isSelectedBlocked ? (
                    <XIcon className="h-3.5 w-3.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {blocking ? "Saving…" : isSelectedBlocked ? "Unblock" : "Block"}
                </button>
              </div>

              {selectedItems.length === 0 ? (
                <div className="card-soft p-6 text-center text-sm text-muted-foreground">
                  Nothing on the books for this day.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedItems.map((it, idx) =>
                    it.kind === "busy" && selectedYmd ? (
                      <BlockedDayCard
                        key={idx}
                        title={it.title}
                        onSave={(newTitle) => editBlockTitle(selectedYmd, newTitle)}
                      />
                    ) : (
                      <BookingRow key={idx} item={it} />
                    ),
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* Recurring blocks — vendor sets "I never work Sundays"
              once and every Sunday on every future month is marked
              blocked automatically. Lives under the day-info panel
              and above Upcoming appointments. Free + paid vendors
              both get this; storage is keyed per-listing so a
              vendor with two listings can have different recurring
              schedules. */}
          {selectedListingId ? (
            <RecurringBlocksSection
              recurringOff={recurringOff}
              savingDow={savingRecurring}
              onToggle={toggleRecurring}
            />
          ) : null}

          {appointments.length > 0 || appointmentsLoading ? (
            <section>
              <h2 className="font-display text-lg mb-3">
                Upcoming appointments
              </h2>
              {appointmentsLoading ? (
                <Skeleton className="h-24 w-full rounded-md" />
              ) : (
                <AppointmentsList
                  appointments={appointments}
                  onMutate={loadAppointments}
                />
              )}
            </section>
          ) : null}
            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          // Reset the title input when the dialog closes (cancel or
          // commit) so the next open starts fresh — otherwise the
          // previous block's title would linger.
          if (!open) setBlockTitle("");
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-editorial text-3xl">
              {isSelectedBlocked ? "Re-open this date?" : "Block this date?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              {selectedYmd ? (
                isSelectedBlocked ? (
                  <>
                    {prettyDay(selectedYmd)} will be bookable again on{" "}
                    {selectedListing?.business_name?.trim() || "this listing"}.
                  </>
                ) : (
                  <>
                    Hosts won't see{" "}
                    {selectedListing?.business_name?.trim() || "this listing"}{" "}
                    as bookable on {prettyDay(selectedYmd)}.
                  </>
                )
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!isSelectedBlocked ? (
            <div className="mt-2">
              <label
                htmlFor="block-title"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                What is it? <span className="text-muted-foreground/70">(optional)</span>
              </label>
              <Input
                id="block-title"
                value={blockTitle}
                onChange={(e) => setBlockTitle(e.target.value)}
                placeholder="Christian's birthday, vacation…"
                maxLength={80}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitSelectedDayBlock();
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Only you see this. Hosts just see the day as unavailable.
              </p>
            </div>
          ) : null}
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={blocking} className="rounded-full">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                commitSelectedDayBlock();
              }}
              disabled={blocking}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {isSelectedBlocked ? "Unblock" : "Block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diagonal-hatch swatch for the legend uses an SVG pattern. */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <pattern
            id="hatch-legend"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#cbbfac" strokeWidth="2" />
          </pattern>
          <pattern
            id="hatch-cell"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#cbbfac" strokeWidth="1.6" />
          </pattern>
        </defs>
      </svg>
    </div>
  );
}

// StatsRow + StatCard removed — bookings/pending/earnings tiles were
// dropped from the calendar header because transactions are handled
// outside the app. The calendar grid is the only signal vendors need
// here (booked / pending / blocked dots).

function statusBadge(s: ListingOpt["application_status"]) {
  if (s === "approved")
    return { label: "Live", bg: "rgba(34,197,94,0.14)", color: "#0a7c4a" };
  if (s === "rejected")
    return { label: "Rejected", bg: "rgba(220,38,38,0.14)", color: "#a3160d" };
  return { label: "Pending", bg: "rgba(255,138,76,0.18)", color: "#c4541e" };
}

function ListingPicker({
  listings,
  loading,
  selectedId,
  onSelect,
  open,
  onOpenChange,
}: {
  listings: ListingOpt[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const selected = listings.find((l) => l.id === selectedId) ?? null;
  const selLabel =
    selected?.business_name?.trim() ||
    selected?.category?.toString() ||
    "Pick a listing";
  const selSub = selected
    ? [selected.category, selected.location].filter(Boolean).join(" · ")
    : null;
  const selBadge = selected ? statusBadge(selected.application_status) : null;

  if (loading) {
    return <Skeleton className="h-16 w-full rounded-2xl" />;
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] font-medium text-muted-foreground mb-2">
        Listing
      </p>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors"
            style={{
              background: "rgba(255,253,250,0.7)",
              border: "0.5px solid rgba(255,138,76,0.22)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: "0 8px 24px -16px rgba(196,84,30,0.18)",
            }}
          >
            <span className="flex items-center gap-3 min-w-0 flex-1">
              <span
                className="w-9 h-9 rounded-full shrink-0 overflow-hidden inline-flex items-center justify-center text-xs font-medium"
                style={{
                  background: "rgba(255,138,76,0.18)",
                  color: "#c4541e",
                }}
              >
                {selected?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.logo_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (selLabel.charAt(0) || "L").toUpperCase()
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground truncate">
                  {selLabel}
                </span>
                {selSub ? (
                  <span className="block text-xs text-muted-foreground truncate">
                    {selSub}
                  </span>
                ) : null}
              </span>
              {selBadge ? (
                <span
                  className="text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5 shrink-0"
                  style={{ background: selBadge.bg, color: selBadge.color }}
                >
                  {selBadge.label}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-muted-foreground shrink-0 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0 overflow-hidden"
          align="start"
          style={{
            background: "rgba(255,253,250,0.97)",
            border: "0.5px solid rgba(255,138,76,0.22)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          }}
        >
          <Command>
            <CommandInput placeholder="Search your listings…" className="h-11" />
            <CommandList>
              <CommandEmpty>No matching listings.</CommandEmpty>
              <CommandGroup>
                {listings.map((l) => {
                  const label =
                    l.business_name?.trim() || l.category || "Untitled listing";
                  const sub = [l.category, l.location]
                    .filter(Boolean)
                    .join(" · ");
                  const badge = statusBadge(l.application_status);
                  // Only approved listings can be selected — pending /
                  // rejected listings render here so the vendor sees
                  // them, but they aren't actionable.
                  const isApproved = l.application_status === "approved";
                  return (
                    <CommandItem
                      key={l.id}
                      value={`${label} ${sub}`}
                      disabled={!isApproved}
                      onSelect={isApproved ? () => onSelect(l.id) : undefined}
                      className={!isApproved ? "opacity-60" : undefined}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          selectedId === l.id
                            ? "opacity-100 text-accent"
                            : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground truncate">
                          {label}
                        </span>
                        {sub ? (
                          <span className="block text-xs text-muted-foreground truncate">
                            {sub}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5 shrink-0 ml-2"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function NoListingsEmptyState() {
  return (
    <div
      className="rounded-2xl p-10 md:p-14 text-center"
      style={{
        background: "rgba(255,253,250,0.6)",
        border: "0.5px solid rgba(255,138,76,0.22)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div
        className="w-14 h-14 mx-auto rounded-full inline-flex items-center justify-center mb-5"
        style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
      >
        <ImagePlus className="w-6 h-6" />
      </div>
      <h2 className="font-editorial italic text-3xl mb-2">
        Upload your first listing
      </h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
        The calendar lives per listing. Once you publish your first
        listing, you'll be able to block dates, see incoming inquiries,
        and manage availability right here.
      </p>
      <Link
        to="/vendor/me"
        className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        <Plus className="w-4 h-4" />
        Create a listing
      </Link>
    </div>
  );
}

function PendingApprovalEmptyState() {
  return (
    <div
      className="rounded-2xl p-10 md:p-14 text-center"
      style={{
        background: "rgba(255,253,250,0.6)",
        border: "0.5px solid rgba(255,138,76,0.22)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div
        className="w-14 h-14 mx-auto rounded-full inline-flex items-center justify-center mb-5"
        style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
      >
        <ImagePlus className="w-6 h-6" />
      </div>
      <h2 className="font-editorial italic text-3xl mb-2">
        Your listings are under review
      </h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
        The calendar lives per listing. Once one of your listings is
        approved you'll be able to block dates and manage availability
        here.
      </p>
      <Link
        to="/vendor/me"
        className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Review my listings
      </Link>
    </div>
  );
}

function MonthGrid({
  month,
  dayState,
  selectedYmd,
  onSelect,
}: {
  month: Date;
  dayState: Map<string, DayState>;
  selectedYmd: string | null;
  onSelect: (k: string) => void;
}) {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  return (
    <div>
      <div className="grid grid-cols-7 mb-2">
        {DAY_HEADERS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const key = ymdKey(d);
          const state = dayState.get(key) ?? "available";
          const selected = selectedYmd === key;
          return (
            <DayCell
              key={key}
              day={d.getDate()}
              inMonth={inMonth}
              state={state}
              selected={selected}
              onClick={() => onSelect(key)}
            />
          );
        })}
      </div>
    </div>
  );
}

// 7-day toggle strip for the vendor's recurring weekly off-days.
// Tap any day pill to flip its row in vendor_availability_rules
// between is_unavailable=true and =false. Pure UI — the page-level
// toggleRecurring handler does the DB upsert and the optimistic
// state update.
function RecurringBlocksSection({
  recurringOff,
  savingDow,
  onToggle,
}: {
  recurringOff: Set<number>;
  savingDow: number | null;
  onToggle: (dow: number, willBeOff: boolean) => void;
}) {
  const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
  const FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <section className="card-soft p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-display text-lg">Recurring blocks</h2>
        <p className="text-xs text-muted-foreground">
          {recurringOff.size > 0
            ? `${recurringOff.size}× weekly`
            : "Off-days repeat every week"}
        </p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Tap a day to mark it permanently unavailable on every future week.
        Hosts won't see you as bookable on that weekday.
      </p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {DAYS.map((short, dow) => {
          const isOff = recurringOff.has(dow);
          const saving = savingDow === dow;
          return (
            <button
              key={dow}
              type="button"
              onClick={() => onToggle(dow, !isOff)}
              disabled={savingDow !== null}
              aria-pressed={isOff}
              aria-label={`${FULL[dow]} ${isOff ? "off" : "on"}`}
              title={FULL[dow]}
              className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
                isOff
                  ? "bg-foreground text-background"
                  : "bg-secondary/60 text-foreground/70 hover:bg-secondary"
              }`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : short}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DayCell({
  day,
  inMonth,
  state,
  selected,
  onClick,
}: {
  day: number;
  inMonth: boolean;
  state: DayState;
  selected: boolean;
  onClick: () => void;
}) {
  const baseClass =
    state === "booked"
      ? "bg-foreground text-background"
      : state === "pending"
        ? "bg-amber-200 text-amber-900"
        : state === "blocked"
          ? "text-foreground"
          : "text-foreground";
  const dimmed = !inMonth ? "text-muted-foreground/50" : "";
  return (
    <div className="flex items-center justify-center py-1">
      <button
        onClick={onClick}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center text-sm font-medium overflow-hidden transition ${
          selected ? "ring-2 ring-foreground" : ""
        } ${state === "available" ? "hover:bg-secondary/60" : ""} ${baseClass} ${dimmed}`}
      >
        {state === "blocked" ? (
          <span
            className="absolute inset-0 rounded-xl"
            style={{ background: "#efe6d6" }}
          />
        ) : null}
        {state === "blocked" ? (
          <svg
            className="absolute inset-0 w-full h-full"
            aria-hidden
          >
            <rect width="100%" height="100%" fill="url(#hatch-cell)" />
          </svg>
        ) : null}
        <span className="relative">{day}</span>
      </button>
    </div>
  );
}

function LegendDot({
  swatchClass,
  label,
}: {
  swatchClass: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {swatchClass === "hatch" ? (
        <span className="w-3 h-3 rounded-sm overflow-hidden inline-block relative">
          <span
            className="absolute inset-0"
            style={{ background: "#efe6d6" }}
          />
          <svg className="absolute inset-0 w-full h-full" aria-hidden>
            <rect width="100%" height="100%" fill="url(#hatch-legend)" />
          </svg>
        </span>
      ) : (
        <span className={`w-3 h-3 rounded-sm ${swatchClass}`} />
      )}
      <span className="text-foreground">{label}</span>
    </div>
  );
}

// Busy/blocked day card with inline-editable title. Clicking the
// title (or the pencil) swaps it for an Input; Enter/blur saves,
// Escape reverts. Save calls back to the parent's editBlockTitle
// which UPDATE-s the vendor_unavailable_dates.reason column.
function BlockedDayCard({
  title,
  onSave,
}: {
  title: string;
  onSave: (newTitle: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  // Keep draft in sync if the parent prop changes (e.g. realtime
  // update from another tab). Doesn't fire while editing so the
  // vendor's keystrokes aren't stomped mid-edit.
  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    // No-op if unchanged so we don't fire a useless UPDATE round
    // trip every time the vendor opens + closes the input.
    if (trimmed === title.trim()) return;
    void onSave(trimmed);
  }

  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-10 rounded-full bg-muted-foreground/40" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <Input
              autoFocus
              value={draft}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft(title);
                  setEditing(false);
                }
              }}
              placeholder="Christian's birthday…"
              className="h-8 text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="group flex items-center gap-1.5 font-medium text-foreground hover:text-foreground/70 transition-colors text-left max-w-full"
              aria-label="Edit title"
            >
              <span className="truncate">{title}</span>
              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 shrink-0" />
            </button>
          )}
          <p className="text-xs text-muted-foreground truncate">
            Marked unavailable
          </p>
        </div>
        <span className="text-xs text-muted-foreground">All day</span>
      </div>
    </div>
  );
}

function BookingRow({
  item,
}: {
  item: {
    kind: "inquiry" | "busy";
    inquiryId: string | null;
    title: string;
    subtitle: string;
    amountCents: number | null;
    accent: "booked" | "pending" | "muted";
    timeLabel: string | null;
  };
}) {
  const accentClass =
    item.accent === "booked"
      ? "bg-emerald-500"
      : item.accent === "pending"
        ? "bg-amber-500"
        : "bg-muted-foreground/40";
  const wrap = (children: React.ReactNode) =>
    item.kind === "inquiry" && item.inquiryId ? (
      <Link
        to={`/vendor/inbox/${item.inquiryId}`}
        className="block card-soft p-4 hover:bg-secondary/40 transition"
      >
        {children}
      </Link>
    ) : (
      <div className="card-soft p-4">
        {children}
      </div>
    );
  return wrap(
    <div className="flex items-center gap-3">
      <span className={`w-1.5 h-10 rounded-full ${accentClass}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {item.subtitle}
        </p>
      </div>
      {item.amountCents ? (
        <span className="text-sm font-semibold tnum">
          {fmtMoneyShort(item.amountCents)}
        </span>
      ) : item.timeLabel ? (
        <span className="text-xs text-muted-foreground">{item.timeLabel}</span>
      ) : null}
    </div>,
  );
}
