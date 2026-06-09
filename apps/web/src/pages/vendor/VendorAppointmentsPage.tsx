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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime";
import { LISTING_PALETTE } from "@/lib/listingColors";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import {
  AppointmentsList,
  type Appointment,
} from "@/components/appointments/AppointmentsList";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { type ListingOpt } from "@/components/vendor/ListingPicker";

const DAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

type DayState = "available" | "booked" | "pending" | "blocked";


// Sentinel for the cockpit block-target picker: "all" writes blocks /
// recurring rules across every listing (the original account-wide
// behavior); a specific listing id scopes writes to just that listing.
type BlockTarget = string | "all";

interface InquiryRow {
  id: string;
  status: string;
  event_date: string | null;
  event_type: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  host_id: string;
  // The listing (vendor_profiles.id) this inquiry belongs to — drives
  // the per-listing dot color on the account calendar.
  vendor_id: string;
  host: { display_name: string | null } | null;
}

// One listing's activity on a given day, for the multi-dot account
// calendar. The strongest state wins per listing (booked > pending >
// blocked).
interface DayListingEntry {
  vendorId: string;
  state: Exclude<DayState, "available">;
}

// ListingOpt moved to @/components/vendor/ListingPicker so any
// picker-using surface can share the same type.

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

// How a meeting reads on the calendar: confirmed (accepted) or already
// happened (completed) occupy the day as "booked"; a still-proposed one is
// "pending". Declined meetings are dead and don't show at all (mirrors how
// lost/expired inquiries are dropped).
function apptDayState(status: string): "booked" | "pending" | null {
  if (status === "accepted" || status === "completed") return "booked";
  if (status === "proposed") return "pending";
  return null;
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

// Appointment display helpers — kind → label and a local-time string
// for the calendar day panel.
const APPT_KIND_LABEL: Record<string, string> = {
  consultation: "Consultation",
  walkthrough: "Walkthrough",
  tasting: "Tasting",
  fitting: "Fitting",
  phone_call: "Phone call",
  other: "Meeting",
};
function fmtApptTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function VendorAppointmentsPage({
  embedded = false,
  listingId: listingIdProp,
  accountVendorIds,
  listings: listingsProp,
  hideUpcoming = false,
  hideLegend = false,
}: {
  embedded?: boolean;
  listingId?: string | null;
  accountVendorIds?: string[];
  // When the embedding cockpit already fetched the user's listings, it
  // passes them here so we don't issue a duplicate vendor_profiles query.
  listings?: ListingOpt[];
  // The cockpit relocates the "Upcoming appointments" list into its own
  // column beside the invoices, so it asks the embedded calendar rail to
  // suppress its in-rail copy to avoid rendering it twice.
  hideUpcoming?: boolean;
  // The cockpit also relocates the per-listing color legend next to the
  // appointments list, so it suppresses the in-rail legend here. The
  // calendar keeps its colored dots; only the written key moves.
  hideLegend?: boolean;
} = {}) {
  const { user } = useAuth();

  // Two modes:
  //  - Standalone /vendor/appointments page: works on the listing the
  //    user picks from the local listing-picker. Reads + writes scope
  //    to selectedListingId.
  //  - Embedded in the cockpit (accountVendorIds prop provided):
  //    READS aggregate across every listing on the account (.in()) so
  //    the calendar surfaces every appointment / inquiry / blocked
  //    date / weekday rule the vendor has anywhere. WRITES still
  //    target one listing — the primary (accountVendorIds[0]) — since
  //    "block this date" needs a concrete destination. A future
  //    per-listing picker on the cockpit calendar can replace that.
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [localSelectedListingId, setLocalSelectedListingId] = useState<string | null>(
    null,
  );
  // The calendar is ALWAYS account-level: one shared availability
  // calendar that aggregates across every listing on the account —
  // never scoped to a single listing. Embedded cockpit callers pass
  // the id set in `accountVendorIds`; the standalone
  // /vendor/appointments page derives the same set from the listings
  // it fetched itself. There is no per-listing picker — a vendor's
  // bookings and blocked dates are one account-wide calendar.
  const accountIds = accountVendorIds ?? listings.map((l) => l.id);
  const isAccountMode = accountIds.length > 0;
  const accountPrimaryId = accountIds.length > 0 ? accountIds[0] : null;
  const selectedListingId =
    accountPrimaryId ??
    (listingIdProp !== undefined ? listingIdProp : localSelectedListingId);
  const setSelectedListingId = setLocalSelectedListingId;
  // Listing ids any READ query fans out over.
  const queryListingIds = isAccountMode
    ? accountIds
    : selectedListingId
      ? [selectedListingId]
      : [];
  const queryListingKey = queryListingIds.join(",");

  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  // Blocked-date map: date string → optional reason/title the vendor
  // typed when adding the block ("Christian's birthday", "Vacation",
  // etc). The reason is private to the vendor side — the public
  // availability surface only selects `date` from this table, so
  // hosts never see the title.
  const [manualBlocks, setManualBlocks] = useState<Map<string, string | null>>(
    () => new Map(),
  );
  // Per-date listing attribution for manual blocks: date → set of
  // listing ids that have that date blocked. Drives the account
  // calendar's per-listing dot coloring. Parallel to manualBlocks
  // (which only keeps one display reason per date for the day panel).
  const [blockListingIds, setBlockListingIds] = useState<
    Map<string, Set<string>>
  >(() => new Map());
  // Recurring weekly rules — vendor sets "I never work Sundays" /
  // "Mondays are off" once and the calendar applies that pattern
  // forever. Keyed by day_of_week (0=Sun..6=Sat). Value true means
  // "vendor is unavailable this weekday". Backed by
  // vendor_availability_rules; one row per (vendor, weekday).
  const [recurringOff, setRecurringOff] = useState<Set<number>>(
    () => new Set(),
  );
  // Per-weekday listing attribution for recurring rules: dow → set of
  // listing ids unavailable that weekday. Same role as blockListingIds
  // but for the recurring projection.
  const [recurringListingIds, setRecurringListingIds] = useState<
    Map<number, Set<string>>
  >(() => new Map());
  // Cockpit block-target: which listing(s) a new block / recurring rule
  // is written to. Defaults to "all" (account-wide, original behavior).
  // Only surfaced in account mode where >1 listing exists.
  const [blockTarget, setBlockTarget] = useState<BlockTarget>("all");
  const [savingRecurring, setSavingRecurring] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocking, setBlocking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Clicking a calendar day opens a preview modal of that day's schedule.
  const [dayModalOpen, setDayModalOpen] = useState(false);
  // Manual "add appointment" form — vendor-created, no host/inquiry.
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [aTitle, setATitle] = useState("");
  const [aTime, setATime] = useState("09:00");
  const [aDuration, setADuration] = useState("60");
  const [aLocation, setALocation] = useState("");
  const [aNotes, setANotes] = useState("");
  const [aListingId, setAListingId] = useState<string | null>(null);
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
    // Reuse listings handed down by the cockpit instead of refetching.
    if (listingsProp) {
      setListings(listingsProp);
      const firstApproved = listingsProp.find(
        (l) => l.application_status === "approved",
      );
      setSelectedListingId((prev) => prev ?? firstApproved?.id ?? null);
      setListingsLoading(false);
      return;
    }
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
  }, [user?.id, listingsProp]);

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === selectedListingId) ?? null,
    [listings, selectedListingId],
  );

  // The calendar draws a full 6-week (42-cell) grid, so it always shows
  // leading days from the previous month and trailing days from the next.
  // Bound the fetched data AND the recurring/manual-block projection to
  // that SAME visible grid (the Sunday on/before the 1st, through 42 days
  // later) — matching MonthGrid's gridStart. Otherwise edge cells showed
  // appointment dots (fetched in a wide window) but missed inquiry/block
  // dots (previously month-only), so the same day rendered different dots
  // depending on which month you were viewing it from.
  const monthBounds = useMemo(() => {
    const firstOfMonth = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth(),
      1,
    );
    const start = new Date(firstOfMonth);
    start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 42); // exclusive — full 6-week grid
    return { start, end };
  }, [viewMonth]);

  const calReqRef = useRef(0);
  const loadCalendar = useCallback(async () => {
    if (queryListingIds.length === 0 || !user?.id) {
      setInquiries([]);
      setManualBlocks(new Map());
      setBlockListingIds(new Map());
      setRecurringOff(new Set());
      setRecurringListingIds(new Map());
      setLoading(false);
      return;
    }
    const reqId = ++calReqRef.current;
    // Belt-and-braces in standalone mode: only query a listing the
    // user actually owns. (Account mode trusts accountVendorIds —
    // the parent component already derived it from the user's own
    // listing set, so every id is owned by the current user.) RLS
    // would silently return zero rows for someone else's id, which
    // reads as "no bookings" — indistinguishable from genuinely
    // free dates. Bail out fast with an empty calendar instead.
    if (
      !isAccountMode &&
      !listingsLoading &&
      listings.length > 0 &&
      !listings.some((l) => l.id === selectedListingId)
    ) {
      setInquiries([]);
      setManualBlocks(new Map());
      setBlockListingIds(new Map());
      setRecurringOff(new Set());
      setRecurringListingIds(new Map());
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
          "id, status, event_date, event_type, budget_min_cents, budget_max_cents, host_id, vendor_id, host:profiles!inquiries_host_id_fkey(display_name)",
        )
        .in("vendor_id", queryListingIds)
        .gte("event_date", startYmd)
        .lt("event_date", endYmd),
      supabase
        .from("vendor_unavailable_dates")
        .select("date, reason, vendor_id")
        .in("vendor_id", queryListingIds)
        .gte("date", startYmd)
        .lt("date", endYmd),
      // Recurring weekday rules. In account mode this is a union
      // across listings: a weekday counts as "off" if ANY listing
      // has it marked unavailable. That matches what the cockpit
      // calendar should show ("am I busy on Mondays at any of my
      // listings?"). Per-listing attribution is kept alongside for
      // the dot coloring + the per-listing block-target picker.
      supabase
        .from("vendor_availability_rules")
        .select("day_of_week, is_unavailable, vendor_id")
        .in("vendor_id", queryListingIds),
    ]);
    // A newer load (month flip / realtime) started while this was in flight
    // — drop this result so it can't paint a stale month over the new one.
    if (reqId !== calReqRef.current) return;
    setInquiries((inqRes.data ?? []) as InquiryRow[]);
    const blockRows = (blockRes.data ?? []) as Array<{
      date: string;
      reason: string | null;
      vendor_id: string;
    }>;
    // One display reason per date (last write wins for the day panel),
    // plus the full per-listing attribution map for dot coloring.
    const reasonByDate = new Map<string, string | null>();
    const listingsByDate = new Map<string, Set<string>>();
    for (const r of blockRows) {
      reasonByDate.set(r.date, r.reason);
      let s = listingsByDate.get(r.date);
      if (!s) {
        s = new Set();
        listingsByDate.set(r.date, s);
      }
      s.add(r.vendor_id);
    }
    setManualBlocks(reasonByDate);
    setBlockListingIds(listingsByDate);
    const recurringRows = ((recurringRes.data ?? []) as Array<{
      day_of_week: number;
      is_unavailable: boolean;
      vendor_id: string;
    }>).filter((r) => r.is_unavailable);
    setRecurringOff(new Set(recurringRows.map((r) => r.day_of_week)));
    const recurringByDow = new Map<number, Set<string>>();
    for (const r of recurringRows) {
      let s = recurringByDow.get(r.day_of_week);
      if (!s) {
        s = new Set();
        recurringByDow.set(r.day_of_week, s);
      }
      s.add(r.vendor_id);
    }
    setRecurringListingIds(recurringByDow);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryListingKey, user?.id, monthBounds, listings, listingsLoading, isAccountMode, selectedListingId]);

  // Listing ids a block / recurring-rule write should target. Account
  // mode honors the block-target picker: "all" fans out across every
  // listing (original behavior), a specific id scopes to one listing.
  // Standalone mode always targets the single picked listing.
  const writeTargetIds = useCallback((): string[] => {
    if (!isAccountMode) return selectedListingId ? [selectedListingId] : [];
    if (blockTarget === "all") return queryListingIds;
    return queryListingIds.includes(blockTarget) ? [blockTarget] : [];
  }, [isAccountMode, selectedListingId, blockTarget, queryListingIds]);

  async function toggleRecurring(dow: number, willBeOff: boolean) {
    if (savingRecurring !== null) return;
    const targetIds = writeTargetIds();
    if (targetIds.length === 0) return;
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
        targetIds.map((vid) => ({
          vendor_id: vid,
          day_of_week: dow,
          is_unavailable: willBeOff,
        })),
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
      return;
    }
    // Reload so the per-listing attribution (recurringListingIds →
    // dot colors) reflects exactly which listings now carry the rule.
    void loadCalendar();
  }

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  // Keep the block-target valid: if the selected listing leaves the
  // account's listing set (deleted / switched away), fall back to "all"
  // so the Block button doesn't strand on an unresolvable target.
  // Depend on the stable key string, not the array (new ref each render).
  useEffect(() => {
    if (blockTarget !== "all" && !queryListingKey.split(",").includes(blockTarget)) {
      setBlockTarget("all");
    }
  }, [blockTarget, queryListingKey]);

  // Create a manual, vendor-side appointment on the selected day — no
  // host, no inquiry. Stored confirmed (proposed_by 'vendor', accepted)
  // so it reads as the vendor's own committed time on the calendar.
  async function addManualAppointment() {
    if (!user?.id || !selectedYmd || addSaving) return;
    // Attach the entry to a listing when the vendor has one; with zero
    // listings it attaches to the vendor's account directly
    // (owner_user_id) so a brand-new vendor can keep a personal calendar
    // before publishing anything.
    const vid = aListingId ?? selectedListingId ?? null;
    const scheduledAt = new Date(`${selectedYmd}T${aTime || "09:00"}:00`);
    // Block scheduling in the past — appointments are forward-looking
    // calendar blocks, not a record of things that already happened.
    if (scheduledAt.getTime() < Date.now()) {
      toast.error("Can't add an appointment in the past", {
        description: "Pick today or a future date and time.",
      });
      return;
    }
    setAddSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("appointments").insert({
      vendor_id: vid,
      owner_user_id: vid ? null : user.id,
      inquiry_id: null,
      host_id: null,
      kind: "other", // off-platform/personal entry — not a host-meeting type
      title: aTitle.trim() || null,
      location: aLocation.trim() || null,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: parseInt(aDuration, 10) || 60,
      status: "accepted",
      proposed_by: "vendor",
      notes: aNotes.trim() || null,
    });
    setAddSaving(false);
    if (error) {
      toast.error("Couldn't add to calendar", { description: error.message });
      return;
    }
    toast.success("Added to your calendar");
    setAddOpen(false);
    setATitle("");
    setALocation("");
    setANotes("");
    void loadAppointments();
  }

  const apptReqRef = useRef(0);
  const loadAppointments = useCallback(async () => {
    if (!user) {
      setAppointments([]);
      setAppointmentsLoading(false);
      return;
    }
    const reqId = ++apptReqRef.current;
    setAppointmentsLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Bound to ~90 days back so years-old history doesn't bloat the
    // payload. The calendar grid and "upcoming" lists only need the
    // recent window; deeper history can be exposed via a dedicated
    // archive view later. In account mode this fans out across
    // every listing the vendor owns. When the vendor navigates the
    // calendar to an older month than that window, extend the lower
    // bound to cover the month in view — otherwise it shows inquiry
    // dots but no appointment dots for that month.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const lowerBound =
      monthBounds.start < cutoff ? monthBounds.start : cutoff;
    // Pull this account's listing appointments PLUS the vendor's own
    // listing-less personal entries (owner_user_id). A vendor with no
    // listing at all still sees their personal calendar.
    let query = (supabase as any)
      .from("appointments")
      .select(
        "id, inquiry_id, vendor_id, host_id, kind, title, location, scheduled_at, duration_minutes, status, proposed_by, notes, host:profiles!appointments_host_id_fkey(display_name)",
      )
      .gte("scheduled_at", lowerBound.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1000);
    query =
      queryListingIds.length > 0
        ? query.or(
            `vendor_id.in.(${queryListingIds.join(",")}),owner_user_id.eq.${user.id}`,
          )
        : query.eq("owner_user_id", user.id);
    const { data } = await query;
    // Drop a stale in-flight result superseded by a newer load.
    if (reqId !== apptReqRef.current) return;
    const rows = (
      (data as Array<
        Appointment & { host: { display_name: string | null } | null }
      > | null) ?? []
    ).map((r) => ({ ...r, host_name: r.host?.display_name ?? null }));
    setAppointments(rows);
    setAppointmentsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, queryListingKey, monthBounds]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // Scope realtime to the WHOLE account, not just the selected listing.
  // The calendar renders across every queryListingId, so a change on a
  // non-primary listing must also refresh it. The shared channel delivers
  // all of the user's row changes; we filter in JS by whether the changed
  // row's vendor_id belongs to this account's listings (the per-row server
  // filter only supported a single id).
  const accountIdSet = useMemo(
    () => new Set(queryListingIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryListingKey],
  );
  const rowInAccount = useCallback(
    (payload: { new: unknown; old: unknown }) => {
      const row = (payload.new ?? payload.old) as {
        vendor_id?: string | null;
        owner_user_id?: string | null;
      } | null;
      // Listing-less personal entries belong to the account via owner.
      if (row?.owner_user_id && row.owner_user_id === user?.id) return true;
      return !!row?.vendor_id && accountIdSet.has(row.vendor_id);
    },
    [accountIdSet, user?.id],
  );

  // Always subscribe to appointments — a vendor with zero listings still
  // has personal (owner-owned) entries that should update live.
  const realtimeAppointments = useMemo(
    () => ({ table: "appointments" }) as const,
    [],
  );
  useRealtime(realtimeAppointments, (p) => {
    if (rowInAccount(p)) void loadAppointments();
  });

  // Audit #10: refresh the BOOKED/BLOCKED overlays when an inquiry
  // is won/lost (changes the booked-date set) or a teammate adds a
  // block on vendor_unavailable_dates. Without these, the calendar
  // shows stale state until the vendor manually reloads.
  const realtimeInquiries = useMemo(
    () => (queryListingIds.length > 0 ? { table: "inquiries" } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryListingKey],
  );
  useRealtime(realtimeInquiries, (p) => {
    // Inquiries change → calendar grid needs new dot colors AND
    // the appointments list might gain/lose a row. Refresh both.
    if (rowInAccount(p)) {
      void loadCalendar();
      void loadAppointments();
    }
  });
  const realtimeUnavailable = useMemo(
    () => (queryListingIds.length > 0 ? { table: "vendor_unavailable_dates" } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryListingKey],
  );
  useRealtime(realtimeUnavailable, (p) => {
    // Blocked-date rows only affect the calendar grid + the day
    // info panel (which both read from manualBlocks). loadCalendar
    // covers both. Previously this called loadAppointments() which
    // only refreshes the bottom list — vendors on a second tab
    // never saw the hatch update from another tab's block.
    if (rowInAccount(p)) void loadCalendar();
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
    // Scheduled appointments mark their day busy too: a confirmed
    // (accepted) meeting reads as booked, a still-proposed one as
    // pending. Layered before the block loops below so a meeting
    // overrides a recurring / manual block — you're not "unavailable"
    // on a day you actually have a confirmed appointment.
    for (const a of appointments) {
      const st = apptDayState(a.status);
      if (!st) continue;
      const k = ymdKey(new Date(a.scheduled_at));
      const prev = m.get(k);
      if (st === "booked") m.set(k, "booked");
      else if (prev !== "booked") m.set(k, "pending");
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
  }, [inquiries, appointments, manualBlocks, recurringOff, monthBounds]);

  // Stable palette index per listing — assigned by position in the
  // account's listing list so colors don't reshuffle between renders.
  const listingColorById = useMemo(() => {
    const m = new Map<string, string>();
    listings.forEach((l, idx) => {
      m.set(l.id, LISTING_PALETTE[idx % LISTING_PALETTE.length]);
    });
    return m;
  }, [listings]);

  // Per-listing day state for the account calendar's multi-dot view:
  // date → [{ vendorId, state }] with the strongest state per listing
  // (booked > pending > blocked). Mirrors the aggregate dayState loops
  // but keyed by listing so two listings booked on the same day render
  // as two dots. Only meaningful in account mode (>1 listing); the
  // standalone view keeps the single-state grid.
  const dayListingState = useMemo(() => {
    const rank: Record<Exclude<DayState, "available">, number> = {
      booked: 3,
      pending: 2,
      blocked: 1,
    };
    // date → (listingId → strongest state)
    const byDate = new Map<string, Map<string, Exclude<DayState, "available">>>();
    const put = (
      key: string,
      vendorId: string,
      state: Exclude<DayState, "available">,
    ) => {
      let inner = byDate.get(key);
      if (!inner) {
        inner = new Map();
        byDate.set(key, inner);
      }
      const prev = inner.get(vendorId);
      if (!prev || rank[state] > rank[prev]) inner.set(vendorId, state);
    };
    for (const i of inquiries) {
      const d = parseYmd(i.event_date);
      if (!d) continue;
      const key = ymdKey(d);
      if (i.status === "won") put(key, i.vendor_id, "booked");
      else if (i.status === "new" || i.status === "replied" || i.status === "drafted")
        put(key, i.vendor_id, "pending");
    }
    for (const a of appointments) {
      const st = apptDayState(a.status);
      if (!st) continue;
      put(ymdKey(new Date(a.scheduled_at)), a.vendor_id, st);
    }
    // Recurring weekday rules, projected per listing across the month.
    if (recurringListingIds.size > 0) {
      const cursor = new Date(monthBounds.start);
      const end = new Date(monthBounds.end);
      while (cursor < end) {
        const ids = recurringListingIds.get(cursor.getDay());
        if (ids) {
          const key = ymdKey(cursor);
          for (const vid of ids) put(key, vid, "blocked");
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    for (const [date, ids] of blockListingIds) {
      for (const vid of ids) put(date, vid, "blocked");
    }
    // Flatten to sorted entry arrays (ordered by palette index so dots
    // keep a stable left-to-right order per day).
    const orderIndex = new Map<string, number>();
    listings.forEach((l, idx) => orderIndex.set(l.id, idx));
    const out = new Map<string, DayListingEntry[]>();
    for (const [date, inner] of byDate) {
      const entries: DayListingEntry[] = Array.from(inner.entries())
        .map(([vendorId, state]) => ({ vendorId, state }))
        .sort(
          (a, b) =>
            (orderIndex.get(a.vendorId) ?? 0) - (orderIndex.get(b.vendorId) ?? 0),
        );
      out.set(date, entries);
    }
    return out;
  }, [
    inquiries,
    appointments,
    blockListingIds,
    recurringListingIds,
    monthBounds,
    listings,
  ]);

  // Per-day status dots: one dot PER event (appointment / inquiry) plus a
  // single "blocked" dot on blocked days, coloured by status. Unlike
  // dayListingState this does NOT collapse per listing, so a day with three
  // appointments renders three dots. Sorted booked > pending > blocked so the
  // cap keeps the most important ones.
  const dayStatusDots = useMemo(() => {
    const out = new Map<string, Array<Exclude<DayState, "available">>>();
    const add = (key: string, st: Exclude<DayState, "available">) => {
      const arr = out.get(key) ?? [];
      arr.push(st);
      out.set(key, arr);
    };
    for (const i of inquiries) {
      const d = parseYmd(i.event_date);
      if (!d) continue;
      const key = ymdKey(d);
      if (i.status === "won") add(key, "booked");
      else if (i.status === "new" || i.status === "replied" || i.status === "drafted")
        add(key, "pending");
    }
    for (const a of appointments) {
      const st = apptDayState(a.status);
      if (!st) continue;
      add(ymdKey(new Date(a.scheduled_at)), st);
    }
    // One blocked dot per blocked date (recurring weekday + manual blocks).
    const blockedDates = new Set<string>();
    if (recurringListingIds.size > 0) {
      const cursor = new Date(monthBounds.start);
      const end = new Date(monthBounds.end);
      while (cursor < end) {
        if (recurringListingIds.get(cursor.getDay())) blockedDates.add(ymdKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    for (const [date] of blockListingIds) blockedDates.add(date);
    // Only add a blocked dot on days with no real event — a booking or lead
    // already shows the day is occupied, so stacking a grey block dot next
    // to a green/amber one is just noise.
    for (const date of blockedDates) {
      if (!out.has(date)) add(date, "blocked");
    }
    const rank: Record<Exclude<DayState, "available">, number> = {
      booked: 3,
      pending: 2,
      blocked: 1,
    };
    for (const arr of out.values()) arr.sort((a, b) => rank[b] - rank[a]);
    return out;
  }, [inquiries, appointments, blockListingIds, recurringListingIds, monthBounds]);

  // Multi-listing dot view only makes sense when the cockpit is showing
  // more than one listing. Single-listing vendors keep the cleaner
  // full-cell color grid.
  const showListingColors = isAccountMode && listings.length > 1;

  // Whether the vendor has at least one approved (bookable) listing.
  // The embedded calendar renders regardless, but blocking / bookings
  // only have somewhere to live once a listing is approved.
  const hasApprovedListing = listings.some(
    (l) => l.application_status === "approved",
  );

  // Header stats (booked/pending/earnings) were removed — vendors
  // don't transact through the app, so the dollar value is misleading.

  const selectedItems = useMemo(() => {
    if (!selectedYmd) return [];
    // When >1 listing is in view, append the listing name to each
    // row's subtitle so the vendor knows which listing a booking
    // belongs to. Single-listing view stays clean (no redundant label).
    const listingNameById = new Map(
      listings.map((l) => [
        l.id,
        l.business_name?.trim() || l.category || "Listing",
      ]),
    );
    const labelFor = (vid: string) =>
      showListingColors ? ` · ${listingNameById.get(vid) ?? "Listing"}` : "";
    const out: Array<{
      kind: "inquiry" | "busy" | "appointment";
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
      // Only show live pipeline + confirmed leads — same statuses the
      // calendar dots use. Dead leads (lost / expired) shouldn't appear
      // as active "pending" rows on a day they no longer occupy.
      if (
        i.status !== "won" &&
        i.status !== "new" &&
        i.status !== "replied" &&
        i.status !== "drafted"
      ) {
        continue;
      }
      out.push({
        kind: "inquiry",
        inquiryId: i.id,
        title: i.event_type
          ? i.event_type[0].toUpperCase() + i.event_type.slice(1)
          : "Booking",
        subtitle:
          (i.host?.display_name ?? "Host") +
          " · " +
          statusLabel(i.status) +
          labelFor(i.vendor_id),
        amountCents: i.budget_min_cents ?? i.budget_max_cents,
        accent: i.status === "won" ? "booked" : "pending",
        timeLabel: null,
      });
    }
    // Appointments scheduled on the selected day — show the meeting
    // (time, kind/title, host, Confirmed/Proposed) so the day panel
    // isn't empty just because there's no inquiry *event* that day.
    for (const a of appointments) {
      const st = apptDayState(a.status);
      if (!st) continue;
      if (ymdKey(new Date(a.scheduled_at)) !== selectedYmd) continue;
      const statusWord = a.status === "accepted"
        ? "Confirmed"
        : a.status === "completed"
          ? "Completed"
          : "Proposed";
      out.push({
        kind: "appointment",
        inquiryId: a.inquiry_id ?? null,
        title: a.title?.trim() || APPT_KIND_LABEL[a.kind] || "Meeting",
        subtitle:
          // Host-less rows are off-platform/personal entries.
          (a.host_id
            ? (a.host_name ?? "Client") + " · " + statusWord
            : "Off-platform · personal") +
          (a.vendor_id ? labelFor(a.vendor_id) : ""),
        amountCents: null,
        accent: st,
        timeLabel: fmtApptTime(a.scheduled_at),
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
  }, [selectedYmd, inquiries, appointments, manualBlocks, listings, showListingColors]);

  const isSelectedBlocked =
    !!selectedYmd && manualBlocks.has(selectedYmd);
  // A day with an accepted appointment is already unavailable to hosts
  // (matches the public vendor_booked_dates RPC), so manually blocking
  // it is redundant — we disable Block and say so.
  const isSelectedBooked = useMemo(
    () =>
      !!selectedYmd &&
      appointments.some(
        (a) =>
          a.status === "accepted" &&
          ymdKey(new Date(a.scheduled_at)) === selectedYmd,
      ),
    [selectedYmd, appointments],
  );
  // Title input state for the block dialog. Reset to blank on each
  // open; if the vendor is opening a date that's already blocked
  // (i.e. they're about to unblock) we don't show the input.
  const [blockTitle, setBlockTitle] = useState("");

  async function commitSelectedDayBlock() {
    if (!selectedYmd || blocking) return;
    const willBlock = !isSelectedBlocked;
    const verb = willBlock ? "Block" : "Unblock";
    setConfirmOpen(false);
    setBlocking(true);
    // Target resolves from the block-target picker in account mode
    // ("all" listings, or one specific listing); standalone mode
    // always targets the single picked listing. Unblock deletes the
    // date row from each targeted listing.
    const targetIds = writeTargetIds();
    if (targetIds.length === 0) {
      setBlocking(false);
      return;
    }
    if (willBlock) {
      const trimmedTitle = blockTitle.trim();
      const reason = trimmedTitle.length > 0 ? trimmedTitle : "Blocked manually";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_unavailable_dates")
        .upsert(
          targetIds.map((vid) => ({
            vendor_id: vid,
            date: selectedYmd,
            reason,
          })),
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
        .in("vendor_id", targetIds)
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
    const trimmed = newTitle.trim();
    const reasonForDb = trimmed.length > 0 ? trimmed : "Blocked manually";
    setManualBlocks((prev) => {
      const next = new Map(prev);
      next.set(ymd, reasonForDb);
      return next;
    });
    // Update the reason on whichever listings actually have this date
    // blocked (from the loaded attribution map) so the title edit lands
    // regardless of the current block-target selection. Falls back to
    // all queried listings if attribution isn't loaded yet.
    const blockedOn = blockListingIds.get(ymd);
    const targetIds =
      blockedOn && blockedOn.size > 0 ? Array.from(blockedOn) : queryListingIds;
    if (targetIds.length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_unavailable_dates")
      .update({ reason: reasonForDb })
      .in("vendor_id", targetIds)
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

  // Whether the Add-personal-entry selection (grid day + time) is
  // already in the past. Drives the disabled Add button + inline hint
  // so vendors can't schedule entries behind the current moment.
  const addIsPast = selectedYmd
    ? new Date(`${selectedYmd}T${aTime || "09:00"}:00`).getTime() < Date.now()
    : false;

  // Embedded in the cockpit (which already has a <main>), render a plain
  // wrapper to avoid nested <main> landmarks / a duplicate id.
  const Shell = embedded ? "div" : "main";
  const body = (
    <>
      <Shell id={embedded ? undefined : "main-content"} className="flex-1 pb-24 lg:pb-0">
        {!embedded && (
          <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40">
            <div className="flex items-start justify-between gap-4">
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
          </div>
        )}

        <div className="p-4 md:p-8 max-w-4xl space-y-6">
          {/* Account-level calendar: always renders the grid (aggregating
              every listing on the account) with no per-listing picker.
              Vendors can add personal appointments even with zero
              listings — those attach to the account, not a listing. */}
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
                  dayListingState={dayListingState}
                  dayStatusDots={dayStatusDots}
                  listingColorById={listingColorById}
                  showListingColors={showListingColors}
                  selectedYmd={selectedYmd}
                  onSelect={(k) => {
                    setSelectedYmd(k);
                    setDayModalOpen(true);
                  }}
                />
              )}
              {hideLegend ? null : showListingColors ? (
                // Status legend (account view): each calendar dot is one event,
                // coloured by status. Matches STATUS_DOT in DayCell.
                <div className="mt-4 pt-3 border-t border-border flex justify-around text-xs font-bold">
                  {([
                    ["#059669", "Booked"],
                    ["#d97706", "Pending"],
                    ["#a1a1aa", "Blocked"],
                  ] as const).map(([color, label]) => (
                    <span key={label} className="inline-flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-full inline-block"
                        style={{ background: color }}
                      />
                      {label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-4 pt-3 border-t border-border flex justify-around text-xs font-bold">
                  <LegendDot swatchClass="bg-foreground" label="Booked" />
                  <LegendDot swatchClass="bg-zinc-200" label="Pending" />
                  <LegendDot swatchClass="hatch" label="Blocked" />
                </div>
              )}
            </div>
          </div>

          {/* Day preview — opens on day click, shows that day's schedule. */}
          <Dialog
            open={dayModalOpen && !!selectedYmd}
            onOpenChange={setDayModalOpen}
          >
            <DialogContent className="rounded-2xl max-w-md max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-editorial text-2xl text-left">
                  {selectedYmd ? prettyDay(selectedYmd) : ""}
                </DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                  {/* Per-listing block target — account view with >1
                      listing only. Lets the vendor block a date for ONE
                      listing or all of them. "All" preserves the prior
                      account-wide behavior. */}
                  {showListingColors ? (
                    <select
                      value={blockTarget}
                      onChange={(e) =>
                        setBlockTarget(e.target.value as BlockTarget)
                      }
                      disabled={blocking}
                      aria-label="Block applies to"
                      className="rounded-full bg-secondary text-foreground text-xs font-medium px-3 py-2 outline-none disabled:opacity-60"
                    >
                      <option value="all">All listings</option>
                      {listings.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.business_name?.trim() || l.category || "Listing"}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {/* Manually add a vendor-side appointment to this day. */}
                  <button
                    onClick={() => {
                      setAListingId(selectedListingId);
                      setAddOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-foreground/15 text-foreground px-3.5 py-2 text-xs font-bold disabled:opacity-60 hover:bg-secondary/50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                  <button
                    onClick={() => setConfirmOpen(true)}
                    disabled={
                      blocking ||
                      writeTargetIds().length === 0 ||
                      (isSelectedBooked && !isSelectedBlocked)
                    }
                    title={
                      isSelectedBooked && !isSelectedBlocked
                        ? "Already booked — unavailable to hosts"
                        : undefined
                    }
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

              {isSelectedBooked && !isSelectedBlocked ? (
                <p className="text-[12px] text-muted-foreground mb-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground inline-block" />
                  Already booked — this day is automatically unavailable to hosts.
                </p>
              ) : null}

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
            </DialogContent>
          </Dialog>

          {/* Recurring blocks — vendor sets "I never work Sundays"
              once and every Sunday on every future month is marked
              blocked automatically. Lives under the day-info panel
              and above Upcoming appointments. Free + paid vendors
              both get this; storage is keyed per-listing so a
              vendor with two listings can have different recurring
              schedules. */}
          {selectedListingId || (embedded && hasApprovedListing) ? (
            <RecurringBlocksSection
              recurringOff={recurringOff}
              savingDow={savingRecurring}
              onToggle={toggleRecurring}
            />
          ) : null}

          {!hideUpcoming ? (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-lg">Appointments</h2>
                <button
                  onClick={() => {
                    // Default to today so the entry has a day even if the
                    // vendor hasn't tapped one on the grid yet.
                    if (!selectedYmd) setSelectedYmd(ymdKey(new Date()));
                    setAListingId(selectedListingId);
                    setAddOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-foreground text-background px-3.5 py-2 text-xs font-bold hover:bg-foreground/90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add appointment
                </button>
              </div>
              {appointmentsLoading ? (
                <Skeleton className="h-24 w-full rounded-md" />
              ) : appointments.length === 0 ? (
                <div className="card-soft p-6 text-center text-sm text-muted-foreground">
                  No appointments yet. Calls, consultations, and tastings you
                  schedule show up here.
                </div>
              ) : (
                <AppointmentsList
                  appointments={appointments}
                  onMutate={loadAppointments}
                />
              )}
            </section>
          ) : null}
            </>
        </div>
      </Shell>

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
                isAccountMode ? (
                  isSelectedBlocked ? (
                    <>
                      {prettyDay(selectedYmd)} will be bookable again on every
                      listing on your account ({queryListingIds.length}).
                    </>
                  ) : (
                    <>
                      Hosts won&apos;t see any of your listings (
                      {queryListingIds.length}) as bookable on{" "}
                      {prettyDay(selectedYmd)}.
                    </>
                  )
                ) : isSelectedBlocked ? (
                  <>
                    {prettyDay(selectedYmd)} will be bookable again on{" "}
                    {selectedListing?.business_name?.trim() || "this listing"}.
                  </>
                ) : (
                  <>
                    Hosts won&apos;t see{" "}
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

      {/* Manual "add appointment" form — vendor-side calendar entry. */}
      <AlertDialog open={addOpen} onOpenChange={setAddOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-editorial text-2xl">
              Add personal entry
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {selectedYmd ? prettyDay(selectedYmd) : ""} · block off-platform
              time — vacation, an external booking, a personal appointment.
              Private to you; no host is involved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            {showListingColors ? (
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Listing</span>
                <select
                  value={aListingId ?? ""}
                  onChange={(e) => setAListingId(e.target.value || null)}
                  className="mt-1 w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
                >
                  {listings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.business_name?.trim() || l.category || "Listing"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Type</span>
              {/* Free text — type anything, or pick a suggestion. */}
              <Input
                value={aTitle}
                onChange={(e) => setATitle(e.target.value)}
                list="vendora-entry-types"
                placeholder="Type or pick — e.g. Vacation, External shoot"
                className="mt-1"
              />
              <datalist id="vendora-entry-types">
                <option value="Personal" />
                <option value="Vacation" />
                <option value="External shoot" />
                <option value="Consultation" />
                <option value="Walkthrough" />
                <option value="Tasting" />
                <option value="Fitting" />
                <option value="Phone call" />
                <option value="Errand" />
                <option value="Other" />
              </datalist>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Time</span>
                <Input
                  type="time"
                  value={aTime}
                  onChange={(e) => setATime(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Duration</span>
                <select
                  value={aDuration}
                  onChange={(e) => setADuration(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
                >
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                  <option value="240">Half day</option>
                  <option value="480">Full day</option>
                </select>
              </label>
            </div>
            {addIsPast ? (
              <p className="text-xs text-destructive">
                That date &amp; time is in the past. Pick today or a future
                date and time.
              </p>
            ) : null}
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Location (optional)</span>
              <Input
                value={aLocation}
                onChange={(e) => setALocation(e.target.value)}
                placeholder="e.g. address, Zoom"
                className="mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Notes (optional)</span>
              <textarea
                value={aNotes}
                onChange={(e) => setANotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm resize-none"
              />
            </label>
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={addSaving} className="rounded-full">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void addManualAppointment();
              }}
              disabled={addSaving || addIsPast}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {addSaving ? "Adding…" : "Add"}
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
            <line x1="0" y1="0" x2="0" y2="6" stroke="#d4d4d8" strokeWidth="2" />
          </pattern>
          <pattern
            id="hatch-cell"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#d4d4d8" strokeWidth="1.6" />
          </pattern>
        </defs>
      </svg>
    </>
  );

  if (embedded) return body;

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      {body}
      <MobileNav items={navItems} />
    </div>
  );
}

// StatsRow + StatCard removed — bookings/pending/earnings tiles were
// dropped from the calendar header because transactions are handled
// outside the app. The calendar grid is the only signal vendors need
// here (booked / pending / blocked dots).

// statusBadge + ListingPicker now live in @/components/vendor/ListingPicker
// so the Leads page can share the same picker UI.


function MonthGrid({
  month,
  dayState,
  dayListingState,
  dayStatusDots,
  listingColorById,
  showListingColors,
  selectedYmd,
  onSelect,
}: {
  month: Date;
  dayState: Map<string, DayState>;
  dayListingState: Map<string, DayListingEntry[]>;
  dayStatusDots: Map<string, Array<Exclude<DayState, "available">>>;
  listingColorById: Map<string, string>;
  showListingColors: boolean;
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
              entries={showListingColors ? dayListingState.get(key) ?? [] : []}
              statusDots={dayStatusDots.get(key) ?? []}
              listingColorById={listingColorById}
              showListingColors={showListingColors}
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

// Status dot colours for the calendar: one dot per event, coloured by status.
const STATUS_DOT: Record<Exclude<DayState, "available">, string> = {
  booked: "#059669", // emerald-600
  pending: "#d97706", // amber-600
  blocked: "#a1a1aa", // zinc-400
};

function DayCell({
  day,
  inMonth,
  state,
  statusDots,
  showListingColors,
  selected,
  onClick,
}: {
  day: number;
  inMonth: boolean;
  state: DayState;
  entries: DayListingEntry[];
  statusDots: Array<Exclude<DayState, "available">>;
  listingColorById: Map<string, string>;
  showListingColors: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const dimmed = !inMonth ? "text-muted-foreground/50" : "";

  // Account view: the day number with one dot PER event below it, coloured by
  // status (booked / pending / blocked). A day with several appointments shows
  // several dots. Cap at 6 + "+N" so a very busy day doesn't overflow.
  if (showListingColors) {
    const MAX_DOTS = 6;
    const shown = statusDots.slice(0, MAX_DOTS);
    const extra = statusDots.length - shown.length;
    return (
      <div className="flex items-center justify-center py-1">
        <button
          onClick={onClick}
          className={`relative w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 text-sm font-medium transition hover:bg-secondary/60 ${
            selected ? "ring-2 ring-foreground" : ""
          } ${dimmed}`}
        >
          <span className="leading-none">{day}</span>
          {statusDots.length > 0 ? (
            <span className="flex items-center justify-center gap-[2px] h-1.5">
              {shown.map((st, i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ background: STATUS_DOT[st] }}
                />
              ))}
              {extra > 0 ? (
                <span className="text-[8px] leading-none text-muted-foreground">
                  +{extra}
                </span>
              ) : null}
            </span>
          ) : null}
        </button>
      </div>
    );
  }

  // Single-listing (or standalone) view: original full-cell color grid.
  const baseClass =
    state === "booked"
      ? "bg-foreground text-background"
      : state === "pending"
        ? "bg-zinc-200 text-zinc-800"
        : state === "blocked"
          ? "text-foreground"
          : "text-foreground";
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
            style={{ background: "#f4f4f5" }}
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
            style={{ background: "#f4f4f5" }}
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
    kind: "inquiry" | "busy" | "appointment";
    inquiryId: string | null;
    title: string;
    subtitle: string;
    amountCents: number | null;
    accent: "booked" | "pending" | "muted";
    timeLabel: string | null;
  };
}) {
  // Status bar colour — matches the calendar dots (STATUS_DOT): booked green,
  // pending amber, blocked/other gray.
  const accentColor =
    item.accent === "booked"
      ? STATUS_DOT.booked
      : item.accent === "pending"
        ? STATUS_DOT.pending
        : STATUS_DOT.blocked;
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
      <span
        className="w-1.5 h-10 rounded-full"
        style={{ background: accentColor }}
      />
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
