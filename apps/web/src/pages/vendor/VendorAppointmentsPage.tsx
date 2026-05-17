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
import { Skeleton } from "@/components/ui/skeleton";
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
  const [manualBlocks, setManualBlocks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocking, setBlocking] = useState(false);
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
      // Preselect the first listing on load. Once the user picks one,
      // we don't override their choice.
      setSelectedListingId((prev) => prev ?? rows[0]?.id ?? null);
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
      setManualBlocks([]);
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
      setManualBlocks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const startYmd = ymdKey(monthBounds.start);
    const endYmd = ymdKey(monthBounds.end);
    const [inqRes, blockRes] = await Promise.all([
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
        .select("date")
        .eq("vendor_id", selectedListingId)
        .gte("date", startYmd)
        .lt("date", endYmd),
    ]);
    setInquiries((inqRes.data ?? []) as InquiryRow[]);
    setManualBlocks(
      ((blockRes.data ?? []) as { date: string }[]).map((r) => r.date),
    );
    setLoading(false);
  }, [selectedListingId, user?.id, monthBounds, listings, listingsLoading]);

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
    const { data } = await (supabase as any)
      .from("appointments")
      .select(
        "id, inquiry_id, vendor_id, host_id, kind, title, location, scheduled_at, duration_minutes, status, proposed_by, notes, meeting_url, meeting_provider, host:profiles!appointments_host_id_fkey(display_name)",
      )
      .eq("vendor_id", selectedListingId)
      .order("scheduled_at", { ascending: true });
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
    for (const key of manualBlocks) {
      const prev = m.get(key);
      if (prev !== "booked" && prev !== "pending") m.set(key, "blocked");
    }
    return m;
  }, [inquiries, manualBlocks]);

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
    if (manualBlocks.includes(selectedYmd)) {
      out.push({
        kind: "busy",
        inquiryId: null,
        title: "Blocked",
        subtitle: "Marked unavailable",
        amountCents: null,
        accent: "muted",
        timeLabel: "All day",
      });
    }
    return out;
  }, [selectedYmd, inquiries, manualBlocks]);

  const isSelectedBlocked =
    !!selectedYmd && manualBlocks.includes(selectedYmd);

  async function toggleSelectedDayBlock() {
    if (!selectedYmd || !selectedListingId || blocking) return;
    const willBlock = !isSelectedBlocked;
    const verb = willBlock ? "Block" : "Unblock";
    const listingLabel =
      selectedListing?.business_name?.trim() || "this listing";
    const ok = window.confirm(
      willBlock
        ? `Mark ${prettyDay(selectedYmd)} unavailable on ${listingLabel}. Hosts won't see this listing as bookable for that date.`
        : `Re-open ${prettyDay(selectedYmd)} on ${listingLabel}.`,
    );
    if (!ok) return;
    setBlocking(true);
    if (willBlock) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_unavailable_dates")
        .upsert(
          [
            {
              vendor_id: selectedListingId,
              date: selectedYmd,
              reason: "Blocked manually",
            },
          ],
          { onConflict: "vendor_id,date" },
        );
      setBlocking(false);
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
              scoped to whichever listing the vendor picks here. */}
          {!listingsLoading && listings.length === 0 ? (
            <NoListingsEmptyState />
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

          {listings.length > 0 && (
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
                  onClick={toggleSelectedDayBlock}
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
                  {selectedItems.map((it, idx) => (
                    <BookingRow key={idx} item={it} />
                  ))}
                </div>
              )}
            </div>
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
                  side="vendor"
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
                  return (
                    <CommandItem
                      key={l.id}
                      value={`${label} ${sub}`}
                      onSelect={() => onSelect(l.id)}
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
      <a
        href={`/vendor/inbox/${item.inquiryId}`}
        className="block card-soft p-4 hover:bg-secondary/40 transition"
      >
        {children}
      </a>
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
