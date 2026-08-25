// Vendor calendar tab — full parity with the web vendor Calendar
// (apps/web/src/pages/vendor/VendorAppointmentsPage.tsx). One shared,
// account-level availability calendar that aggregates EVERY listing the
// vendor owns (never scoped to a single listing).
//
// Four data streams render onto a 6-week month grid:
//   • inquiries (status = 'won')          → BOOKED   (ink fill / green dot)
//   • inquiries (new/replied/drafted)     → PENDING  (amber fill / dot)
//   • appointments (accepted/completed)   → BOOKED
//   • appointments (proposed)             → PENDING
//   • vendor_unavailable_dates (manual)   → BLOCKED  (diagonal hatch)
//   • vendor_availability_rules (weekday) → BLOCKED  (recurring "never
//                                           work Sundays" projection)
//
// Parity surfaces (matches web feature-for-feature):
//   - Month grid with single-listing full-cell colors OR, when the vendor
//     has >1 listing, one status dot per event ("account" multi-dot view).
//   - Tap a day → day panel: bookings, appointments, and the manual block
//     (with inline title edit). Block / unblock with optional title; an
//     already-booked day can't be blocked (it's auto-unavailable).
//   - Per-listing block target ("All listings" vs one) when >1 listing.
//   - Recurring weekly blocks: 7-day toggle strip → vendor_availability_rules.
//   - Add personal entry: vendor-side appointment (type/time/duration/
//     location/notes) for vacations, external bookings, calls, tastings.
//   - Appointments list: Upcoming / Needs response / Past / All with
//     accept / decline / mark-complete / cancel / open-inquiry.
//
// The header stats row (Booked/Pending/Earnings) was intentionally REMOVED
// to match web — vendors don't transact in-app, so the dollar figure was
// misleading. Deferred (web-only, needs a native dep): ICS "Add to
// calendar" export.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Line } from "react-native-svg";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Wordmark } from "@/components/Wordmark";

const CREAM = "#f4f1ea";
const CREAM_DEEP = "#ece7db";
const INK = "#14161a";
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = "#14161a";
const BORDER = "#e6e1d5";
const GOLD = "#c9a86a";
const PENDING_BG = "#f2e7cb";
const PENDING_FG = "#8a6f3e";
const HATCH = "#d6d1c6";
const HATCH_BG = "#ece7db";
// Champagne bronze — gold deep enough to stay legible as small text.
const BRONZE = "#8a6f3e";
// Solid stand-in for INK on a disabled control.
const INK_MUTED = "#7b7973";
// Soft champagne fill for the days between the two ends of a pending
// multi-day range — reads as "included" without competing with the
// solid ink ends or the booked/blocked states.
const RANGE_FILL = "#eadfc6";
const GREEN = "#16a34a";
const AMBER = "#d97706";
// Status dots for the multi-listing account view (match web STATUS_DOT).
const DOT_BOOKED = "#14161a";
const DOT_PENDING = "#c9a86a";
const DOT_BLOCKED = "#b3aed6";
// Stable per-listing palette (mirrors apps/web/src/lib/listingColors).
const LISTING_PALETTE = [
  "#1b3654",
  "#7c3aed",
  "#0891b2",
  "#b45309",
  "#be123c",
  "#15803d",
  "#a21caf",
  "#4338ca",
];
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

const DAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DayState = "available" | "booked" | "pending" | "blocked";
type EventState = Exclude<DayState, "available">;
type BlockTarget = string | "all";

interface ListingOpt {
  id: string;
  business_name: string | null;
  category: string | null;
  application_status: string | null;
}

interface InquiryRow {
  id: string;
  status: string;
  event_date: string | null;
  event_type: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  host_id: string;
  vendor_id: string;
  host: { display_name: string | null } | null;
}

interface AppointmentRow {
  id: string;
  inquiry_id: string | null;
  vendor_id: string | null;
  host_id: string | null;
  owner_user_id: string | null;
  kind: string;
  title: string | null;
  location: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: "proposed" | "accepted" | "declined" | "cancelled" | "completed";
  proposed_by: "host" | "vendor";
  notes: string | null;
  host: { display_name: string | null } | null;
}

const KIND_LABEL: Record<string, string> = {
  consultation: "Consultation",
  walkthrough: "Walkthrough",
  tasting: "Tasting",
  fitting: "Fitting",
  phone_call: "Phone call",
  other: "Meeting",
};

const DURATION_OPTS: Array<{ value: number; label: string }> = [
  { value: 30, label: "30m" },
  { value: 45, label: "45m" },
  { value: 60, label: "1h" },
  { value: 90, label: "1.5h" },
  { value: 120, label: "2h" },
  { value: 240, label: "Half day" },
  { value: 480, label: "Full day" },
];

const TIME_QUICK = ["09:00", "12:00", "14:00", "17:00", "19:00"];

const ENTRY_TYPE_SUGGESTIONS = [
  "Personal",
  "Vacation",
  "External shoot",
  "Consultation",
  "Walkthrough",
  "Tasting",
  "Phone call",
];

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

// A vendor blocking a season shouldn't be able to write an unbounded
// number of rows from two taps, so ranges cap at a year.
const MAX_RANGE_DAYS = 366;

// Inclusive list of YYYY-MM-DD keys between two days, in either order.
function datesBetween(a: string, b: string): string[] {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const cursor = parseYmd(lo);
  const end = parseYmd(hi);
  const out: string[] = [];
  if (!cursor || !end) return out;
  while (cursor <= end && out.length < MAX_RANGE_DAYS) {
    out.push(ymdKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// "Jun 3 – Jun 10" / "Jun 3 – Jul 2, 2027" for the range header.
function prettyRange(a: string, b: string): string {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const d1 = parseYmd(lo);
  const d2 = parseYmd(hi);
  if (!d1 || !d2) return "";
  const sameYear = d1.getFullYear() === d2.getFullYear();
  const left = d1.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const right = d2.toLocaleDateString(
    undefined,
    sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
  return `${left} – ${right}`;
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

// Confirmed/completed appointments occupy the day as booked; a proposed
// one is pending. Declined/cancelled are dead and don't show.
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

function fmtApptTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isValidHHMM(s: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return false;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const router = useRouter();

  // Every vendor_profiles row this user owns. The calendar is ALWAYS
  // account-level: it aggregates bookings / appointments / blocks across
  // all listings. Writes target the block-target picker (all vs one).
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  // date → optional reason/title the vendor typed.
  const [manualBlocks, setManualBlocks] = useState<Map<string, string | null>>(
    () => new Map(),
  );
  // date → set of listing ids that have it blocked (dot attribution).
  const [blockListingIds, setBlockListingIds] = useState<
    Map<string, Set<string>>
  >(() => new Map());
  // weekday (0=Sun..6=Sat) the vendor is recurringly unavailable.
  const [recurringOff, setRecurringOff] = useState<Set<number>>(
    () => new Set(),
  );
  const [recurringListingIds, setRecurringListingIds] = useState<
    Map<number, Set<string>>
  >(() => new Map());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [savingRecurring, setSavingRecurring] = useState<number | null>(null);
  const [blockTarget, setBlockTarget] = useState<BlockTarget>("all");

  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedYmd, setSelectedYmd] = useState<string | null>(() =>
    ymdKey(new Date()),
  );

  const vendorIds = useMemo(() => listings.map((l) => l.id), [listings]);
  const vendorIdKey = vendorIds.join(",");
  const accountPrimaryId = vendorIds.length > 0 ? vendorIds[0] : null;
  const showListingColors = listings.length > 1;
  const hasListings = vendorIds.length > 0;

  // Load this user's listings up front.
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select("id, business_name, category, application_status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      setListings((data ?? []) as ListingOpt[]);
    })();
  }, [user?.id]);

  // Keep block-target valid if a listing leaves the set.
  useEffect(() => {
    if (blockTarget !== "all" && !vendorIdKey.split(",").includes(blockTarget)) {
      setBlockTarget("all");
    }
  }, [blockTarget, vendorIdKey]);

  // The grid always draws a full 6 weeks (42 cells). Bound every fetched
  // stream + the recurring projection to that SAME visible window so edge
  // cells don't render inconsistent dots between months.
  const monthBounds = useMemo(() => {
    const firstOfMonth = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth(),
      1,
    );
    const start = new Date(firstOfMonth);
    start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 42); // exclusive
    return { start, end };
  }, [viewMonth]);

  const reqRef = useRef(0);
  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!user?.id) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const reqId = ++reqRef.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        if (vendorIds.length === 0) {
          // A vendor with no listings still has personal (owner-owned)
          // appointments — fetch those so a brand-new vendor sees them.
          setInquiries([]);
          setManualBlocks(new Map());
          setBlockListingIds(new Map());
          setRecurringOff(new Set());
          setRecurringListingIds(new Map());
        }

        const startYmd = ymdKey(monthBounds.start);
        const endYmd = ymdKey(monthBounds.end);
        // Appointments reach ~90 days back (or to the viewed month,
        // whichever is earlier) so the list + dots cover history without a
        // huge payload.
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const apptLower =
          monthBounds.start < cutoff ? monthBounds.start : cutoff;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let apptQuery = (supabase as any)
          .from("appointments")
          .select(
            "id, inquiry_id, vendor_id, host_id, owner_user_id, kind, title, location, scheduled_at, duration_minutes, status, proposed_by, notes, host:profiles!appointments_host_id_fkey(display_name)",
          )
          .gte("scheduled_at", apptLower.toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(1000);
        apptQuery =
          vendorIds.length > 0
            ? apptQuery.or(
                `vendor_id.in.(${vendorIds.join(",")}),owner_user_id.eq.${user.id}`,
              )
            : apptQuery.eq("owner_user_id", user.id);

        const promises: PromiseLike<unknown>[] = [apptQuery];
        if (vendorIds.length > 0) {
          promises.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any)
              .from("inquiries")
              .select(
                "id, status, event_date, event_type, budget_min_cents, budget_max_cents, host_id, vendor_id, host:profiles!inquiries_host_id_fkey(display_name)",
              )
              .in("vendor_id", vendorIds)
              .gte("event_date", startYmd)
              .lt("event_date", endYmd),
            supabase
              .from("vendor_unavailable_dates")
              .select("date, reason, vendor_id")
              .in("vendor_id", vendorIds)
              .gte("date", startYmd)
              .lt("date", endYmd),
            supabase
              .from("vendor_availability_rules")
              .select("day_of_week, is_unavailable, vendor_id")
              .in("vendor_id", vendorIds),
          );
        }

        const results = (await Promise.all(promises)) as Array<{
          data: unknown;
          error: { message?: string } | null;
        }>;
        // A newer load (month flip / focus / refresh) superseded this one —
        // drop its results so it can't paint stale data. The finally below
        // skips clearing the spinner too (the current request owns it).
        if (reqId !== reqRef.current) return;

        const apptRes = results[0];
        const firstErr =
          apptRes.error ??
          results[1]?.error ??
          results[2]?.error ??
          results[3]?.error ??
          null;
        if (firstErr)
          setError(firstErr.message ?? "Couldn't load the calendar.");

        setAppointments((apptRes.data ?? []) as AppointmentRow[]);

        if (vendorIds.length > 0) {
          setInquiries((results[1]?.data ?? []) as InquiryRow[]);

          const blockRows = (results[2]?.data ?? []) as Array<{
            date: string;
            reason: string | null;
            vendor_id: string;
          }>;
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

          const recurringRows = (
            (results[3]?.data ?? []) as Array<{
              day_of_week: number;
              is_unavailable: boolean;
              vendor_id: string;
            }>
          ).filter((r) => r.is_unavailable);
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
        }
      } catch (err) {
        if (reqId === reqRef.current) {
          setError(
            (err as { message?: string })?.message ??
              "Couldn't load the calendar.",
          );
        }
      } finally {
        // Only the latest request clears the spinners — a superseded
        // request must not flip them off while a newer fetch is mid-flight
        // (that was the bug that left the grid stuck on a spinner forever).
        if (reqId === reqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, vendorIdKey, monthBounds],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // Reload when the tab regains focus so changes made elsewhere (inbox,
  // web) appear without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  // ---- write-target resolution ----
  const writeTargetIds = useCallback((): string[] => {
    if (blockTarget === "all") return vendorIds;
    return vendorIds.includes(blockTarget) ? [blockTarget] : [];
  }, [blockTarget, vendorIds]);

  // ---- aggregate day state (single-listing full-cell grid) ----
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
    for (const a of appointments) {
      const st = apptDayState(a.status);
      if (!st) continue;
      const k = ymdKey(new Date(a.scheduled_at));
      const prev = m.get(k);
      if (st === "booked") m.set(k, "booked");
      else if (prev !== "booked") m.set(k, "pending");
    }
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
    for (const ymd of manualBlocks.keys()) {
      const prev = m.get(ymd);
      if (prev !== "booked" && prev !== "pending") m.set(ymd, "blocked");
    }
    return m;
  }, [inquiries, appointments, manualBlocks, recurringOff, monthBounds]);

  // ---- per-day status dots (multi-listing account view) ----
  const dayStatusDots = useMemo(() => {
    const out = new Map<string, EventState[]>();
    const add = (key: string, st: EventState) => {
      const arr = out.get(key) ?? [];
      arr.push(st);
      out.set(key, arr);
    };
    for (const i of inquiries) {
      const d = parseYmd(i.event_date);
      if (!d) continue;
      const key = ymdKey(d);
      if (i.status === "won") add(key, "booked");
      else if (
        i.status === "new" ||
        i.status === "replied" ||
        i.status === "drafted"
      )
        add(key, "pending");
    }
    for (const a of appointments) {
      const st = apptDayState(a.status);
      if (!st) continue;
      add(ymdKey(new Date(a.scheduled_at)), st);
    }
    const blockedDates = new Set<string>();
    if (recurringListingIds.size > 0) {
      const cursor = new Date(monthBounds.start);
      const end = new Date(monthBounds.end);
      while (cursor < end) {
        if (recurringListingIds.get(cursor.getDay()))
          blockedDates.add(ymdKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    for (const [date] of blockListingIds) blockedDates.add(date);
    for (const date of blockedDates) {
      if (!out.has(date)) add(date, "blocked");
    }
    const rank: Record<EventState, number> = {
      booked: 3,
      pending: 2,
      blocked: 1,
    };
    for (const arr of out.values()) arr.sort((a, b) => rank[b] - rank[a]);
    return out;
  }, [inquiries, appointments, blockListingIds, recurringListingIds, monthBounds]);

  // ---- day panel items for the selected date ----
  const selectedItems = useMemo(() => {
    if (!selectedYmd) return [];
    const listingNameById = new Map(
      listings.map((l) => [
        l.id,
        l.business_name?.trim() || l.category || "Listing",
      ]),
    );
    const labelFor = (vid: string | null) =>
      showListingColors && vid ? ` · ${listingNameById.get(vid) ?? "Listing"}` : "";
    const out: Array<{
      kind: "inquiry" | "busy" | "appointment";
      inquiryId: string | null;
      title: string;
      subtitle: string;
      amountCents: number | null;
      accent: EventState;
      timeLabel: string | null;
    }> = [];
    for (const i of inquiries) {
      const d = parseYmd(i.event_date);
      if (!d || ymdKey(d) !== selectedYmd) continue;
      if (
        i.status !== "won" &&
        i.status !== "new" &&
        i.status !== "replied" &&
        i.status !== "drafted"
      )
        continue;
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
    for (const a of appointments) {
      const st = apptDayState(a.status);
      if (!st) continue;
      if (ymdKey(new Date(a.scheduled_at)) !== selectedYmd) continue;
      const statusWord =
        a.status === "accepted"
          ? "Confirmed"
          : a.status === "completed"
            ? "Completed"
            : "Proposed";
      out.push({
        kind: "appointment",
        inquiryId: a.inquiry_id ?? null,
        title: a.title?.trim() || KIND_LABEL[a.kind] || "Meeting",
        subtitle:
          (a.host_id
            ? (a.host?.display_name ?? "Client") + " · " + statusWord
            : "Off-platform · personal") + labelFor(a.vendor_id),
        amountCents: null,
        accent: st,
        timeLabel: fmtApptTime(a.scheduled_at),
      });
    }
    if (manualBlocks.has(selectedYmd)) {
      const reason = (manualBlocks.get(selectedYmd) ?? "").trim();
      const isLegacyFallback = reason === "Blocked manually";
      out.push({
        kind: "busy",
        inquiryId: null,
        title: reason && !isLegacyFallback ? reason : "Blocked",
        subtitle: "Marked unavailable",
        amountCents: null,
        accent: "blocked",
        timeLabel: "All day",
      });
    }
    return out;
  }, [selectedYmd, inquiries, appointments, manualBlocks, listings, showListingColors]);

  const isSelectedBlocked = !!selectedYmd && manualBlocks.has(selectedYmd);
  // A day with an accepted appointment is already unavailable to hosts, so
  // manually blocking it is redundant — disable Block and say so.
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

  // ---- tap a booking → open the host conversation ----
  const openBooking = useCallback(
    async (inquiryId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: err } = await (supabase as any).rpc(
        "ensure_inquiry_thread",
        { p_inquiry_id: inquiryId },
      );
      if (err || !data) {
        Alert.alert("Couldn't open thread", err?.message ?? "Try the inbox.");
        return;
      }
      router.push(`/(vendor)/thread/${data as string}` as never);
    },
    [router],
  );

  // ---- block / unblock the selected day ----
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockTitleInput, setBlockTitleInput] = useState("");
  const [editingBlockDate, setEditingBlockDate] = useState<string | null>(null);

  // ---- multi-day range ----
  // Opt-in: single-day tapping is untouched until the vendor turns this
  // on, because blocking one day is still the common case. In range
  // mode the first tap sets one end and the second sets the other (any
  // order); a third tap starts over.
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  const exitRangeMode = useCallback(() => {
    setRangeMode(false);
    setRangeStart(null);
    setRangeEnd(null);
  }, []);

  const rangeDates = useMemo(() => {
    if (rangeStart && rangeEnd) return datesBetween(rangeStart, rangeEnd);
    return rangeStart ? [rangeStart] : [];
  }, [rangeStart, rangeEnd]);

  const rangeKeys = useMemo(() => new Set(rangeDates), [rangeDates]);

  // Booked and pending days are already unavailable to hosts and the
  // single-day path refuses to block them, so they drop out of the
  // write set rather than making the whole range un-blockable.
  const rangeWritable = useMemo(
    () =>
      rangeDates.filter((d) => {
        const s = dayState.get(d);
        return s !== "booked" && s !== "pending";
      }),
    [rangeDates, dayState],
  );

  const rangeAllBlocked =
    rangeWritable.length > 0 && rangeWritable.every((d) => manualBlocks.has(d));

  const commitBlock = useCallback(async () => {
    const targetDate = editingBlockDate ?? selectedYmd;
    const rangeWrite = rangeMode && !editingBlockDate && rangeWritable.length > 0;
    if ((!targetDate && !rangeWrite) || blocking) return;
    setBlocking(true);
    const trimmed = blockTitleInput.trim();
    const reason = trimmed.length > 0 ? trimmed : "Blocked manually";
    let err: { message?: string } | null = null;
    if (rangeWrite) {
      const targetIds = writeTargetIds();
      if (targetIds.length === 0) {
        setBlocking(false);
        return;
      }
      const rows = targetIds.flatMap((vid) =>
        rangeWritable.map((date) => ({ vendor_id: vid, date, reason })),
      );
      // A year-long range across several listings is a few thousand
      // rows; chunk so one oversized request can't fail the whole write.
      for (let i = 0; i < rows.length && !err; i += 400) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (supabase as any)
          .from("vendor_unavailable_dates")
          .upsert(rows.slice(i, i + 400), { onConflict: "vendor_id,date" });
        err = res.error;
      }
    } else if (editingBlockDate) {
      // Edit: UPDATE reason on whichever listings actually have this date.
      const blockedOn = blockListingIds.get(editingBlockDate);
      const targetIds =
        blockedOn && blockedOn.size > 0 ? Array.from(blockedOn) : vendorIds;
      if (targetIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (supabase as any)
          .from("vendor_unavailable_dates")
          .update({ reason })
          .in("vendor_id", targetIds)
          .eq("date", editingBlockDate);
        err = res.error;
      }
    } else {
      const targetIds = writeTargetIds();
      if (targetIds.length === 0) {
        setBlocking(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (supabase as any)
        .from("vendor_unavailable_dates")
        .upsert(
          targetIds.map((vid) => ({ vendor_id: vid, date: targetDate, reason })),
          { onConflict: "vendor_id,date" },
        );
      err = res.error;
    }
    setBlocking(false);
    setBlockModalOpen(false);
    setBlockTitleInput("");
    setEditingBlockDate(null);
    if (err) {
      Alert.alert(
        editingBlockDate ? "Couldn't update title" : "Couldn't block",
        err.message ?? "Try again.",
      );
      return;
    }
    if (rangeWrite) {
      const skipped = rangeDates.length - rangeWritable.length;
      exitRangeMode();
      if (skipped > 0) {
        Alert.alert(
          "Days blocked",
          `${rangeWritable.length} day${rangeWritable.length === 1 ? "" : "s"} marked unavailable. ${skipped} day${
            skipped === 1 ? " was" : "s were"
          } skipped — already booked, so already unavailable to hosts.`,
        );
      }
    }
    load(false);
  }, [
    selectedYmd,
    blocking,
    blockTitleInput,
    editingBlockDate,
    blockListingIds,
    vendorIds,
    writeTargetIds,
    rangeMode,
    rangeDates,
    rangeWritable,
    exitRangeMode,
    load,
  ]);

  // Unblock every day in the range in one delete.
  const commitUnblockRange = useCallback(async () => {
    if (blocking || rangeWritable.length === 0) return;
    const targetIds = writeTargetIds();
    if (targetIds.length === 0) return;
    setBlocking(true);
    const { error: err } = await supabase
      .from("vendor_unavailable_dates")
      .delete()
      .in("vendor_id", targetIds)
      .in("date", rangeWritable);
    setBlocking(false);
    if (err) {
      Alert.alert("Couldn't unblock", err.message);
      return;
    }
    exitRangeMode();
    load(false);
  }, [blocking, rangeWritable, writeTargetIds, exitRangeMode, load]);

  function openEditBlock(date: string) {
    const current = manualBlocks.get(date) ?? "";
    setBlockTitleInput(current === "Blocked manually" ? "" : current);
    setEditingBlockDate(date);
    setBlockModalOpen(true);
  }

  const commitUnblock = useCallback(async () => {
    if (!selectedYmd || blocking) return;
    const targetIds = writeTargetIds();
    if (targetIds.length === 0) return;
    setBlocking(true);
    const { error: err } = await supabase
      .from("vendor_unavailable_dates")
      .delete()
      .in("vendor_id", targetIds)
      .eq("date", selectedYmd);
    setBlocking(false);
    if (err) {
      Alert.alert("Couldn't unblock", err.message);
      return;
    }
    load(false);
  }, [selectedYmd, blocking, writeTargetIds, load]);

  // A brand-new vendor has no listing to mark unavailable. Greying the
  // button out just left them staring at a dead control with no reason
  // given, so it stays tappable and explains itself instead.
  const needsListing = writeTargetIds().length === 0;
  const explainNeedsListing = useCallback(() => {
    Alert.alert(
      "Publish a listing first",
      "Blocking days marks your listing unavailable to hosts. Once you have a listing, this unlocks.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Finish setup",
          onPress: () => router.push("/(vendor)/setup" as never),
        },
      ],
    );
  }, [router]);

  const toggleSelectedDayBlock = useCallback(() => {
    if (!selectedYmd || blocking) return;
    if (writeTargetIds().length === 0) {
      explainNeedsListing();
      return;
    }
    if (isSelectedBlocked) {
      Alert.alert(
        "Re-open this day?",
        `${prettyDay(selectedYmd)} becomes bookable again on ${
          blockTarget === "all"
            ? vendorIds.length === 1
              ? "your listing"
              : `your ${vendorIds.length} listings`
            : "the selected listing"
        }.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Unblock", onPress: commitUnblock },
        ],
      );
    } else {
      setBlockTitleInput("");
      setEditingBlockDate(null);
      setBlockModalOpen(true);
    }
  }, [
    explainNeedsListing,
    selectedYmd,
    blocking,
    writeTargetIds,
    isSelectedBlocked,
    blockTarget,
    vendorIds,
    commitUnblock,
  ]);

  // ---- recurring weekly blocks ----
  const toggleRecurring = useCallback(
    async (dow: number, willBeOff: boolean) => {
      if (savingRecurring !== null) return;
      const targetIds = writeTargetIds();
      if (targetIds.length === 0) return;
      setSavingRecurring(dow);
      setRecurringOff((prev) => {
        const next = new Set(prev);
        if (willBeOff) next.add(dow);
        else next.delete(dow);
        return next;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: err } = await (supabase as any)
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
      if (err) {
        setRecurringOff((prev) => {
          const next = new Set(prev);
          if (willBeOff) next.delete(dow);
          else next.add(dow);
          return next;
        });
        Alert.alert("Couldn't update", err.message);
        return;
      }
      load(false);
    },
    [savingRecurring, writeTargetIds, load],
  );

  // ---- add personal entry (vendor-side appointment) ----
  const [addOpen, setAddOpen] = useState(false);
  // Appointment types configured in Smart Scheduling — one tap fills
  // both the entry title and its duration.
  const [myTypes, setMyTypes] = useState<
    { id: string; name: string; duration_minutes: number }[]
  >([]);
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_appointment_types")
        .select("id, name, duration_minutes")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("display_order", { ascending: true });
      if (alive) setMyTypes(data ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);
  const [addSaving, setAddSaving] = useState(false);
  const [aTitle, setATitle] = useState("");
  const [aTime, setATime] = useState("09:00");
  const [aDuration, setADuration] = useState(60);
  const [aLocation, setALocation] = useState("");
  const [aNotes, setANotes] = useState("");
  const [aListingId, setAListingId] = useState<string | null>(null);

  const addIsPast = useMemo(() => {
    if (!selectedYmd || !isValidHHMM(aTime)) return false;
    return new Date(`${selectedYmd}T${aTime}:00`).getTime() < Date.now();
  }, [selectedYmd, aTime]);

  const addManualAppointment = useCallback(async () => {
    if (!user?.id || !selectedYmd || addSaving) return;
    if (!isValidHHMM(aTime)) {
      Alert.alert("Pick a valid time", "Use 24-hour HH:MM, e.g. 14:30.");
      return;
    }
    const vid = aListingId ?? accountPrimaryId;
    const scheduledAt = new Date(`${selectedYmd}T${aTime}:00`);
    if (scheduledAt.getTime() < Date.now()) {
      Alert.alert("Can't add in the past", "Pick today or a future time.");
      return;
    }
    setAddSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from("appointments").insert({
      vendor_id: vid,
      owner_user_id: vid ? null : user.id,
      inquiry_id: null,
      host_id: null,
      kind: "other",
      title: aTitle.trim() || null,
      location: aLocation.trim() || null,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: aDuration,
      status: "accepted",
      proposed_by: "vendor",
      notes: aNotes.trim() || null,
    });
    setAddSaving(false);
    if (err) {
      Alert.alert("Couldn't add to calendar", err.message ?? "Try again.");
      return;
    }
    setAddOpen(false);
    setATitle("");
    setALocation("");
    setANotes("");
    load(false);
  }, [
    user?.id,
    selectedYmd,
    addSaving,
    aTime,
    aListingId,
    accountPrimaryId,
    aTitle,
    aLocation,
    aDuration,
    aNotes,
    load,
  ]);

  // ---- appointment status mutations (accept/decline/complete/cancel) ----
  const [apptPendingId, setApptPendingId] = useState<string | null>(null);
  const setApptStatus = useCallback(
    async (appt: AppointmentRow, status: AppointmentRow["status"]) => {
      setApptPendingId(appt.id);
      const { error: err } = await supabase
        .from("appointments")
        .update({ status })
        .eq("id", appt.id);
      setApptPendingId(null);
      if (err) {
        Alert.alert("Couldn't update", err.message);
        return;
      }
      load(false);
    },
    [load],
  );

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

  const [calView, setCalView] = useState<"month" | "list">("month");
  // Serif is wider than the sans this used to be, and "September 2026"
  // was ellipsising against the Month / List toggle. The year is only
  // informative once you leave the current one, so drop it otherwise.
  const monthLabel = viewMonth.toLocaleDateString(
    undefined,
    viewMonth.getFullYear() === new Date().getFullYear()
      ? { month: "long" }
      : { month: "long", year: "numeric" },
  );

  const listingColorById = useMemo(() => {
    const m = new Map<string, string>();
    listings.forEach((l, idx) => {
      m.set(l.id, LISTING_PALETTE[idx % LISTING_PALETTE.length]);
    });
    return m;
  }, [listings]);

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 8,
            paddingBottom: 140,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={INK}
            />
          }
        >
          {error ? (
            <View
              style={{
                marginBottom: 12,
                borderRadius: 12,
                backgroundColor: "#fef2f2",
                borderWidth: 1,
                borderColor: "#fecaca",
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Text style={{ fontFamily: SERIF, color: "#dc2828", fontSize: 13 }}>{error}</Text>
              <Pressable onPress={() => load(false)} style={{ marginTop: 8 }}>
                <Text style={{ fontFamily: SERIF_BOLD, color: "#dc2828", fontSize: 13}}>
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Header */}
          <Wordmark />
          <View
            style={{
              marginTop: 14,
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: INK,
                  fontFamily: SERIF_BOLD,
                  fontSize: 38,
                  letterSpacing: -0.5,
                }}
              >
                Calendar
              </Text>
              <Text style={{ fontFamily: SERIF, marginTop: 2, fontSize: 13.5, lineHeight: 19, color: INK_DIM }}>
                Manage your bookings & availability
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => router.push("/(vendor)/scheduling" as never)}
                hitSlop={6}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      backgroundColor: CREAM_DEEP,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.85 : 1,
                    }}
                  >
                    <Feather name="zap" size={18} color={INK} />
                  </View>
                )}
              </Pressable>
              <Pressable onPress={jumpToToday} hitSlop={6}>
                {({ pressed }) => (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      backgroundColor: CREAM_DEEP,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.85 : 1,
                    }}
                  >
                    <Feather name="calendar" size={18} color={INK} />
                  </View>
                )}
              </Pressable>
            </View>
          </View>

          {/* Month nav + view toggle */}
          <View
            style={{
              marginTop: 22,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
              <ChevButton dir="left" onPress={() => shiftMonth(-1)} />
              <Text
                numberOfLines={1}
                style={{
                  color: INK,
                  fontFamily: SERIF_ITALIC,
                  // Serif runs wider than the sans this used to be, and
                  // "September 2026" was ellipsising against the Month /
                  // List toggle. 20 fits the longest month.
                  fontSize: 20,
                  flexShrink: 1,
                }}
              >
                {monthLabel}
              </Text>
              <ChevButton dir="right" onPress={() => shiftMonth(1)} />
            </View>
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "#ffffff",
                borderRadius: 999,
                padding: 3,
              }}
            >
              <Pressable
                onPress={() => setCalView("month")}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: calView === "month" ? CREAM_DEEP : "transparent",
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>Month</Text>
              </Pressable>
              <Pressable
                onPress={() => setCalView("list")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: calView === "list" ? CREAM_DEEP : "transparent",
                }}
              >
                <Feather name="list" size={14} color={INK} />
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>List</Text>
              </Pressable>
            </View>
          </View>

          {calView === "month" ? (
          <>
          {/* Calendar card */}
          <View
            style={{
              marginTop: 12,
              backgroundColor: "#ffffff",
              borderRadius: 24,
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 14,
              shadowColor: INK,
              shadowOpacity: 0.1,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 6 },
              elevation: 2,
            }}
          >
            {loading ? (
              <View style={{ paddingVertical: 70, alignItems: "center" }}>
                <ActivityIndicator color={INK} />
              </View>
            ) : (
              <MonthGrid
                month={viewMonth}
                dayState={dayState}
                dayStatusDots={dayStatusDots}
                showListingColors={showListingColors}
                selectedYmd={rangeMode ? null : selectedYmd}
                rangeKeys={rangeMode ? rangeKeys : null}
                rangeEdges={
                  rangeMode
                    ? [rangeStart, rangeEnd].filter(Boolean) as string[]
                    : []
                }
                onSelect={(k) => {
                  if (!rangeMode) {
                    setSelectedYmd(k);
                    return;
                  }
                  // Third tap starts a new range rather than extending
                  // a finished one — less surprising than growing it.
                  if (!rangeStart || rangeEnd) {
                    setRangeStart(k);
                    setRangeEnd(null);
                  } else if (k < rangeStart) {
                    setRangeEnd(rangeStart);
                    setRangeStart(k);
                  } else {
                    setRangeEnd(k);
                  }
                }}
              />
            )}

            {/* Legend */}
            <View
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: BORDER,
                flexDirection: "row",
                justifyContent: "space-around",
              }}
            >
              {showListingColors ? (
                <>
                  <LegendDot swatch={<Dot color={DOT_BOOKED} />} label="Booked" />
                  <LegendDot swatch={<Dot color={DOT_PENDING} />} label="Pending" />
                  <LegendDot swatch={<Dot color={DOT_BLOCKED} />} label="Blocked" />
                </>
              ) : (
                <>
                  <LegendDot
                    swatch={
                      <View
                        style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: INK }}
                      />
                    }
                    label="Booked"
                  />
                  <LegendDot
                    swatch={
                      <View
                        style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: PENDING_BG }}
                      />
                    }
                    label="Pending"
                  />
                  <LegendDot
                    swatch={
                      <View
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 4,
                          backgroundColor: HATCH_BG,
                          overflow: "hidden",
                        }}
                      >
                        <Hatch size={12} />
                      </View>
                    }
                    label="Blocked"
                  />
                </>
              )}
            </View>
          </View>

          {/* Selected-day header + actions */}
          {rangeMode ? (
            <View style={{ marginTop: 18 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text
                    style={{
                      color: INK,
                      fontFamily: SERIF_ITALIC,
                      fontSize: 20,
                    }}
                    numberOfLines={1}
                  >
                    {rangeStart && rangeEnd
                      ? prettyRange(rangeStart, rangeEnd)
                      : rangeStart
                        ? prettyDay(rangeStart)
                        : "Pick a range"}
                  </Text>
                  <Text style={{ fontFamily: SERIF, marginTop: 2, color: INK_DIM, fontSize: 12.5 }}>
                    {!rangeStart
                      ? "Tap the first day"
                      : !rangeEnd
                        ? "Now tap the last day"
                        : `${rangeDates.length} day${rangeDates.length === 1 ? "" : "s"}${
                            rangeWritable.length !== rangeDates.length
                              ? ` · ${rangeDates.length - rangeWritable.length} already booked`
                              : ""
                          }`}
                  </Text>
                </View>
                <Pressable onPress={exitRangeMode} hitSlop={10}>
                  <Text style={{ fontFamily: SERIF_BOLD, color: INK_DIM, fontSize: 13.5}}>
                    Cancel
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  if (needsListing) {
                    explainNeedsListing();
                    return;
                  }
                  if (rangeAllBlocked) {
                    Alert.alert(
                      "Re-open these days?",
                      `${rangeWritable.length} day${
                        rangeWritable.length === 1 ? "" : "s"
                      } become bookable again.`,
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Unblock", style: "destructive", onPress: commitUnblockRange },
                      ],
                    );
                    return;
                  }
                  setBlockTitleInput("");
                  setEditingBlockDate(null);
                  setBlockModalOpen(true);
                }}
                disabled={blocking || rangeWritable.length === 0}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      marginTop: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor:
                        blocking || rangeWritable.length === 0 ? INK_MUTED : INK,
                      paddingVertical: 13,
                      borderRadius: 999,
                      // Press feedback only — the disabled look is carried
                      // by the fill above, not by fading the whole pill.
                      opacity: pressed ? 0.7 : 1,
                    }}
                  >
                    <Feather
                      name={rangeAllBlocked ? "x" : "calendar"}
                      size={15}
                      color="#ffffff"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={{ fontFamily: SERIF_BOLD, color: "#ffffff", fontSize: 14.5}}>
                      {blocking
                        ? "Saving…"
                        : rangeWritable.length === 0
                          ? "Pick a range"
                          : `${rangeAllBlocked ? "Unblock" : "Block"} ${rangeWritable.length} day${
                              rangeWritable.length === 1 ? "" : "s"
                            }`}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          ) : selectedYmd ? (
            <View
              style={{
                marginTop: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                <Text
                  style={{
                    color: INK,
                    fontFamily: SERIF_ITALIC,
                    fontSize: 20,
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                >
                  {prettyDay(selectedYmd)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => {
                    setAListingId(accountPrimaryId);
                    setAddOpen(true);
                  }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: BORDER,
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        borderRadius: 999,
                        opacity: pressed ? 0.6 : 1,
                      }}
                    >
                      <Feather name="plus" size={14} color={INK} style={{ marginRight: 4 }} />
                      <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 13}}>
                        Add booking
                      </Text>
                    </View>
                  )}
                </Pressable>
                <Pressable
                  onPress={toggleSelectedDayBlock}
                  disabled={blocking || (isSelectedBooked && !isSelectedBlocked)}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor:
                          blocking || (isSelectedBooked && !isSelectedBlocked)
                            ? INK_MUTED
                            : INK,
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: 999,
                        opacity: pressed ? 0.7 : 1,
                      }}
                    >
                      <Feather
                        name={isSelectedBlocked ? "x" : "calendar"}
                        size={14}
                        color="#ffffff"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={{ fontFamily: SERIF_BOLD, color: "#ffffff", fontSize: 13}}>
                        {blocking ? "Saving…" : isSelectedBlocked ? "Unblock" : "Block time"}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Opt in to multi-day. Kept as a low-weight text link rather
              than a third button so the action row doesn't crowd. */}
          {!rangeMode ? (
            <Pressable
              onPress={() => {
                setRangeMode(true);
                setRangeStart(null);
                setRangeEnd(null);
              }}
              hitSlop={8}
              style={{ alignSelf: "flex-start", marginTop: 12, paddingVertical: 4 }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: BRONZE, fontSize: 13}}>
                Block several days at once
              </Text>
            </Pressable>
          ) : null}

          {/* Per-listing block target (account view, >1 listing) */}
          {(selectedYmd || rangeMode) && showListingColors ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 10 }}
              contentContainerStyle={{ gap: 8, alignItems: "center" }}
            >
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  fontSize: 10,
                  letterSpacing: 1,
                  color: INK_DIM,
                }}
              >
                BLOCK APPLIES TO
              </Text>
              <TargetChip
                label="All listings"
                active={blockTarget === "all"}
                onPress={() => setBlockTarget("all")}
              />
              {listings.map((l) => (
                <TargetChip
                  key={l.id}
                  label={l.business_name?.trim() || l.category || "Listing"}
                  color={listingColorById.get(l.id)}
                  active={blockTarget === l.id}
                  onPress={() => setBlockTarget(l.id)}
                />
              ))}
            </ScrollView>
          ) : null}

          {isSelectedBooked && !isSelectedBlocked && !rangeMode ? (
            <Text style={{ fontFamily: SERIF, marginTop: 8, fontSize: 12, color: INK_DIM }}>
              Already booked — this day is automatically unavailable to hosts.
            </Text>
          ) : null}

          {/* Day panel. Hidden while picking a range — it describes one
              day, so leaving it up next to a ten-day selection reads as
              stale. */}
          {selectedYmd && !rangeMode ? (
            <View style={{ marginTop: 12 }}>
              {selectedItems.length === 0 ? (
                <View
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: 20,
                    paddingVertical: 34,
                    paddingHorizontal: 20,
                    alignItems: "center",
                  }}
                >
                  <MaterialCommunityIcons
                    name="calendar-check-outline"
                    size={48}
                    color="#d9c9a6"
                  />
                  <Text
                    style={{
                      fontFamily: SERIF_BOLD,
                      marginTop: 12,
                      color: INK,
                      fontSize: 14.5,
                    }}
                  >
                    Nothing on the books for this day.
                  </Text>
                  <Text style={{ fontFamily: SERIF, marginTop: 3, color: INK_DIM, fontSize: 13 }}>
                    Add a booking or block off time.
                  </Text>
                </View>
              ) : (
                selectedItems.map((it, idx) =>
                  it.kind === "busy" && selectedYmd ? (
                    <BlockedDayCard
                      key={idx}
                      title={it.title}
                      onPress={() => openEditBlock(selectedYmd)}
                    />
                  ) : (
                    <BookingRow
                      key={idx}
                      item={it}
                      onPress={
                        it.kind === "inquiry" && it.inquiryId
                          ? () => openBooking(it.inquiryId as string)
                          : it.kind === "appointment" && it.inquiryId
                            ? () => openBooking(it.inquiryId as string)
                            : undefined
                      }
                    />
                  ),
                )
              )}
            </View>
          ) : null}

          {/* Recurring weekly blocks */}
          {hasListings ? (
            <RecurringBlocksSection
              recurringOff={recurringOff}
              savingDow={savingRecurring}
              onToggle={toggleRecurring}
            />
          ) : null}

          </>
          ) : null}

          {/* Appointments list */}
          <AppointmentsSection
            appointments={appointments}
            pendingId={apptPendingId}
            onSetStatus={setApptStatus}
            onOpenInquiry={openBooking}
            onAdd={() => {
              if (!selectedYmd) setSelectedYmd(ymdKey(new Date()));
              setAListingId(accountPrimaryId);
              setAddOpen(true);
            }}
          />
        </ScrollView>
      </SafeAreaView>

      {/* Block-title modal */}
      <CenterModal
        visible={blockModalOpen}
        onClose={() => {
          setBlockModalOpen(false);
          setBlockTitleInput("");
          setEditingBlockDate(null);
        }}
        title={
          editingBlockDate
            ? `Edit title — ${prettyDay(editingBlockDate)}`
            : rangeMode && rangeStart && rangeEnd
              ? `Block ${prettyRange(rangeStart, rangeEnd)}?`
              : `Block ${selectedYmd ? prettyDay(selectedYmd) : "this day"}?`
        }
      >
        <Text style={{ fontFamily: SERIF, fontSize: 13, color: INK_DIM, lineHeight: 18, marginTop: 6 }}>
          {editingBlockDate
            ? "Change the title for this blocked day. Leave blank to clear it."
            : rangeMode
              ? `${rangeWritable.length} day${
                  rangeWritable.length === 1 ? "" : "s"
                } will be marked unavailable. Add an optional title so you remember why (“Vacation”). Only you see it — hosts just see the days as unavailable.`
              : "Add an optional title so you remember why (“Christian’s birthday”). Only you see it — hosts just see the day as unavailable."}
        </Text>
        <TextInput
          value={blockTitleInput}
          onChangeText={setBlockTitleInput}
          placeholder="What is it? (optional)"
          placeholderTextColor={INK_DIM}
          autoFocus
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={commitBlock}
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: BORDER,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 15,
            color: INK,
          }}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <SmallBtn
            label="Cancel"
            onPress={() => {
              setBlockModalOpen(false);
              setBlockTitleInput("");
              setEditingBlockDate(null);
            }}
          />
          <SmallBtn
            label={blocking ? "Saving…" : editingBlockDate ? "Save" : "Block"}
            primary
            onPress={commitBlock}
          />
        </View>
      </CenterModal>

      {/* Add personal entry modal */}
      <CenterModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add personal entry"
      >
        <Text style={{ fontFamily: SERIF, fontSize: 13, color: INK_DIM, marginTop: 6, lineHeight: 18 }}>
          {selectedYmd ? prettyDay(selectedYmd) : ""} · block off-platform time —
          vacation, an external booking, a personal appointment. Private to you.
        </Text>

        <ScrollView style={{ marginTop: 12 }} keyboardShouldPersistTaps="handled">
          {showListingColors ? (
            <>
              <FieldLabel text="Listing" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
              >
                {listings.map((l) => (
                  <TargetChip
                    key={l.id}
                    label={l.business_name?.trim() || l.category || "Listing"}
                    color={listingColorById.get(l.id)}
                    active={aListingId === l.id}
                    onPress={() => setAListingId(l.id)}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {myTypes.length > 0 ? (
            <>
              <FieldLabel text="Your services" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingVertical: 2, paddingBottom: 8 }}
              >
                {myTypes.map((t) => {
                  const active =
                    aTitle === t.name && aDuration === t.duration_minutes;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => {
                        setATitle(t.name);
                        setADuration(t.duration_minutes);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        paddingHorizontal: 12,
                        height: 32,
                        borderRadius: 999,
                        backgroundColor: active ? INK : "#eadfc6",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: SERIF_BOLD,
                          color: active ? CREAM : INK,
                          fontSize: 12,
                        }}
                      >
                        {t.name} · {t.duration_minutes >= 60
                          ? `${t.duration_minutes / 60}h`
                          : `${t.duration_minutes}m`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <FieldLabel text="Type" />
          <TextInput
            value={aTitle}
            onChangeText={setATitle}
            placeholder="Vacation, External shoot…"
            placeholderTextColor={INK_DIM}
            style={inputStyle}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 8 }}
          >
            {ENTRY_TYPE_SUGGESTIONS.map((t) => (
              <Pressable
                key={t}
                onPress={() => setATitle(t)}
                style={{
                  paddingHorizontal: 12,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: aTitle === t ? INK : CREAM_DEEP,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, color: aTitle === t ? CREAM : INK, fontSize: 12}}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <FieldLabel text="Time (24h)" />
          <TextInput
            value={aTime}
            onChangeText={setATime}
            placeholder="09:00"
            placeholderTextColor={INK_DIM}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            style={inputStyle}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 8 }}
          >
            {TIME_QUICK.map((t) => (
              <Pressable
                key={t}
                onPress={() => setATime(t)}
                style={{
                  paddingHorizontal: 12,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: aTime === t ? INK : CREAM_DEEP,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, color: aTime === t ? CREAM : INK, fontSize: 12}}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <FieldLabel text="Duration" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
          >
            {DURATION_OPTS.map((d) => (
              <Pressable
                key={d.value}
                onPress={() => setADuration(d.value)}
                style={{
                  paddingHorizontal: 12,
                  height: 32,
                  borderRadius: 999,
                  backgroundColor: aDuration === d.value ? INK : CREAM_DEEP,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: SERIF_BOLD,
                    color: aDuration === d.value ? CREAM : INK,
                    fontSize: 12,
                  }}
                >
                  {d.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {addIsPast ? (
            <Text style={{ fontFamily: SERIF, color: "#dc2828", fontSize: 12, marginTop: 8 }}>
              That date & time is in the past. Pick today or later.
            </Text>
          ) : null}

          <FieldLabel text="Location (optional)" />
          <TextInput
            value={aLocation}
            onChangeText={setALocation}
            placeholder="Address, Zoom…"
            placeholderTextColor={INK_DIM}
            style={inputStyle}
          />

          <FieldLabel text="Notes (optional)" />
          <TextInput
            value={aNotes}
            onChangeText={setANotes}
            placeholder="Anything to remember"
            placeholderTextColor={INK_DIM}
            multiline
            style={[inputStyle, { height: 70, textAlignVertical: "top" }]}
          />
        </ScrollView>

        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <SmallBtn label="Cancel" onPress={() => setAddOpen(false)} />
          <SmallBtn
            label={addSaving ? "Adding…" : "Add"}
            primary
            disabled={addSaving || addIsPast}
            onPress={addManualAppointment}
          />
        </View>
      </CenterModal>
    </View>
  );
}

// ---------------- sub-components ----------------

function Dot({ color }: { color: string }) {
  return <View style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: color }} />;
}

function ChevButton({ dir, onPress }: { dir: "left" | "right"; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        backgroundColor: CREAM_DEEP,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Feather name={dir === "left" ? "chevron-left" : "chevron-right"} size={18} color={INK} />
    </Pressable>
  );
}

function LegendDot({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {swatch}
      <Text style={{ fontFamily: SERIF_BOLD, marginLeft: 6, color: INK, fontSize: 12}}>{label}</Text>
    </View>
  );
}

function TargetChip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: active ? INK : CREAM_DEEP,
      }}
    >
      {color ? (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: color,
            marginRight: 6,
          }}
        />
      ) : null}
      <Text style={{ fontFamily: SERIF_BOLD, color: active ? CREAM : INK, fontSize: 12}}>{label}</Text>
    </Pressable>
  );
}

function Hatch({ size }: { size: number }) {
  const lines: React.ReactNode[] = [];
  const step = size <= 16 ? 3 : 6;
  for (let offset = -size; offset <= size * 2; offset += step) {
    lines.push(
      <Line
        key={offset}
        x1={offset}
        y1={0}
        x2={offset + size}
        y2={size}
        stroke={HATCH}
        strokeWidth={1.2}
      />,
    );
  }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {lines}
    </Svg>
  );
}

function MonthGrid({
  month,
  dayState,
  dayStatusDots,
  showListingColors,
  selectedYmd,
  rangeKeys,
  rangeEdges,
  onSelect,
}: {
  month: Date;
  dayState: Map<string, DayState>;
  dayStatusDots: Map<string, EventState[]>;
  showListingColors: boolean;
  selectedYmd: string | null;
  /** Every day in the pending range, or null when not in range mode. */
  rangeKeys: Set<string> | null;
  /** The one or two days the vendor actually tapped. */
  rangeEdges: string[];
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
    <View>
      <View style={{ flexDirection: "row", marginBottom: 8 }}>
        {DAY_HEADERS.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text
              style={{ fontFamily: SERIF_BOLD, color: INK_DIM, fontSize: 11, letterSpacing: 0.5 }}
            >
              {d}
            </Text>
          </View>
        ))}
      </View>
      {Array.from({ length: 6 }).map((_, row) => (
        <View key={row} style={{ flexDirection: "row" }}>
          {cells.slice(row * 7, row * 7 + 7).map((d) => {
            const inMonth = d.getMonth() === month.getMonth();
            const key = ymdKey(d);
            const state = dayState.get(key) ?? "available";
            // The tapped ends of a range get the same solid treatment
            // as a normal selection; the days between get a soft fill.
            const isEdge = rangeEdges.includes(key);
            const selected = selectedYmd === key || isEdge;
            return (
              <DayCell
                key={key}
                day={d.getDate()}
                inMonth={inMonth}
                state={state}
                dots={showListingColors ? dayStatusDots.get(key) ?? [] : []}
                showDots={showListingColors}
                selected={selected}
                inRange={!!rangeKeys?.has(key) && !isEdge}
                onPress={() => onSelect(key)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const DOT_COLOR: Record<EventState, string> = {
  booked: DOT_BOOKED,
  pending: DOT_PENDING,
  blocked: DOT_BLOCKED,
};

function DayCell({
  day,
  inMonth,
  state,
  dots,
  showDots,
  selected,
  inRange,
  onPress,
}: {
  day: number;
  inMonth: boolean;
  state: DayState;
  dots: EventState[];
  showDots: boolean;
  selected: boolean;
  /** Between the two tapped ends of a pending range. */
  inRange: boolean;
  onPress: () => void;
}) {
  // Account view: number + one status dot per event (cap 4 + "+N").
  if (showDots) {
    const MAX = 4;
    const shown = dots.slice(0, MAX);
    const extra = dots.length - shown.length;
    return (
      <View style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}>
        <Pressable
          onPress={onPress}
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: selected ? INK : inRange ? RANGE_FILL : "transparent",
          }}
        >
          <Text
            style={{
              fontFamily: SERIF_BOLD,
              color: selected ? "#ffffff" : inMonth ? INK : "#c9c4b6",
              fontSize: 14,
            }}
          >
            {day}
          </Text>
          {dots.length > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 6, marginTop: 1 }}>
              {shown.map((st, i) => (
                <View
                  key={i}
                  style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: DOT_COLOR[st] }}
                />
              ))}
              {extra > 0 ? (
                <Text style={{ fontFamily: SERIF, fontSize: 7, color: INK_DIM }}>+{extra}</Text>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </View>
    );
  }

  // Single-listing full-cell color grid.
  const baseBg =
    state === "booked"
      ? INK
      : state === "pending"
        ? PENDING_BG
        : state === "blocked"
          ? HATCH_BG
          : selected
            ? INK
            : inRange
              ? RANGE_FILL
              : "transparent";
  const digitColor = !inMonth
    ? "#c9c4b6"
    : state === "booked"
      ? CREAM
      : state === "pending"
        ? PENDING_FG
        : selected
          ? "#ffffff"
          : INK;

  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}>
      <Pressable
        onPress={onPress}
        style={{
          width: 38,
          height: 38,
          borderRadius: selected && state === "available" ? 999 : 12,
          backgroundColor: baseBg,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderWidth: selected && state !== "available" ? 2 : 0,
          borderColor: INK,
        }}
      >
        {state === "blocked" ? (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
            <Hatch size={38} />
          </View>
        ) : null}
        <Text
          style={{
            color: digitColor,
            fontSize: 14,
            // Same Android trap as everywhere else: naming a custom
            // family AND a fontWeight makes it hunt for a bold cut of
            // that family, miss, and fall back to the system sans. Pick
            // the face; only the plain-sans digits carry a weight.
            fontFamily:
              state === "booked"
                ? SERIF_BOLD
                : state === "pending"
                  ? SERIF
                  : undefined,
            fontWeight:
              state === "booked" || state === "pending" ? undefined : "600",
          }}
        >
          {day}
        </Text>
        {state === "booked" || state === "pending" ? (
          <View
            style={{
              position: "absolute",
              bottom: 4,
              width: 3,
              height: 3,
              borderRadius: 999,
              backgroundColor: state === "booked" ? CREAM : PENDING_FG,
            }}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

function BlockedDayCard({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 18,
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 10,
            paddingVertical: 14,
            paddingHorizontal: 14,
            shadowColor: INK,
            shadowOpacity: 0.1,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 4 },
            opacity: pressed ? 0.85 : 1,
          }}
        >
          <View style={{ width: 4, height: 36, borderRadius: 999, backgroundColor: DOT_BLOCKED }} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 15}} numberOfLines={1}>
                {title}
              </Text>
              <Feather name="edit-2" size={11} color={INK_DIM} style={{ marginLeft: 6 }} />
            </View>
            <Text style={{ fontFamily: SERIF, marginTop: 2, color: INK_DIM, fontSize: 12 }}>Marked unavailable</Text>
          </View>
          <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 12 }}>All day</Text>
        </View>
      )}
    </Pressable>
  );
}

function BookingRow({
  item,
  onPress,
}: {
  item: {
    kind: "inquiry" | "busy" | "appointment";
    inquiryId: string | null;
    title: string;
    subtitle: string;
    amountCents: number | null;
    accent: EventState;
    timeLabel: string | null;
  };
  onPress?: () => void;
}) {
  const tappable = !!onPress;
  const accentColor = DOT_COLOR[item.accent];
  return (
    <Pressable onPress={onPress} disabled={!tappable}>
      {({ pressed }) => (
        <View
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 18,
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 10,
            overflow: "hidden",
            shadowColor: INK,
            shadowOpacity: 0.1,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 4 },
            opacity: pressed && tappable ? 0.85 : 1,
          }}
        >
          <View style={{ width: 4, alignSelf: "stretch", backgroundColor: accentColor }} />
          {item.timeLabel && item.timeLabel !== "All day" ? (
            <View style={{ paddingHorizontal: 12, paddingVertical: 14, alignItems: "center", width: 70 }}>
              <Text style={{ color: INK, fontSize: 14, fontFamily: SERIF_BOLD }} numberOfLines={1}>
                {item.timeLabel}
              </Text>
            </View>
          ) : (
            <View style={{ width: 12 }} />
          )}
          <View style={{ flex: 1, paddingVertical: 14, paddingRight: 14 }}>
            <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 15}} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={{ fontFamily: SERIF, marginTop: 2, color: INK_DIM, fontSize: 12 }} numberOfLines={1}>
              {item.subtitle}
            </Text>
          </View>
          {item.amountCents != null ? (
            <Text
              style={{ color: INK, fontSize: 15, marginRight: 14, fontFamily: SERIF_BOLD }}
            >
              {fmtMoneyShort(item.amountCents)}
            </Text>
          ) : item.timeLabel === "All day" ? (
            <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 12, marginRight: 14 }}>All day</Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

// 7-day toggle strip for recurring weekly off-days.
function RecurringBlocksSection({
  recurringOff,
  savingDow,
  onToggle,
}: {
  recurringOff: Set<number>;
  savingDow: number | null;
  onToggle: (dow: number, willBeOff: boolean) => void;
}) {
  return (
    <View
      style={{
        marginTop: 24,
        backgroundColor: "#ffffff",
        borderRadius: 18,
        padding: 16,
        shadowColor: INK,
        shadowOpacity: 0.06,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: SERIF_BOLD, fontSize: 17, color: INK }}>Recurring blocks</Text>
        <Text style={{ fontFamily: SERIF, fontSize: 12, color: INK_DIM }}>
          {recurringOff.size > 0 ? `${recurringOff.size}× weekly` : "Repeat every week"}
        </Text>
      </View>
      <Text style={{ fontFamily: SERIF, marginTop: 4, fontSize: 12, color: INK_DIM, lineHeight: 17 }}>
        Tap a day to mark it permanently unavailable every future week. Hosts won't see you as
        bookable on that weekday.
      </Text>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        {DAY_HEADERS.map((short, dow) => {
          const isOff = recurringOff.has(dow);
          const saving = savingDow === dow;
          return (
            <Pressable
              key={dow}
              onPress={() => onToggle(dow, !isOff)}
              disabled={savingDow !== null}
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  savingDow !== null && !saving
                    ? isOff
                      ? INK_MUTED
                      : "#f0ede4"
                    : isOff
                      ? INK
                      : CREAM_DEEP,
              }}
              accessibilityLabel={`${DAY_FULL[dow]} ${isOff ? "off" : "on"}`}
            >
              {saving ? (
                <ActivityIndicator size="small" color={isOff ? CREAM : INK} />
              ) : (
                <Text style={{ fontFamily: SERIF_BOLD, color: isOff ? CREAM : INK_DIM, fontSize: 13}}>
                  {short}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Appointments list with Upcoming / Needs response / Past / All filters
// plus per-card accept / decline / mark-complete / cancel / open-inquiry.
function AppointmentsSection({
  appointments,
  pendingId,
  onSetStatus,
  onOpenInquiry,
  onAdd,
}: {
  appointments: AppointmentRow[];
  pendingId: string | null;
  onSetStatus: (a: AppointmentRow, s: AppointmentRow["status"]) => void;
  onOpenInquiry: (inquiryId: string) => void;
  onAdd: () => void;
}) {
  const [filter, setFilter] = useState<"upcoming" | "needs_response" | "past" | "all">(
    "upcoming",
  );

  const counts = useMemo(() => {
    const now = Date.now();
    const c = { upcoming: 0, needs_response: 0, past: 0, all: appointments.length };
    for (const a of appointments) {
      const t = new Date(a.scheduled_at).getTime();
      if (a.status === "proposed" && a.proposed_by === "host") c.needs_response++;
      if ((a.status === "accepted" || a.status === "proposed") && t >= now) c.upcoming++;
      if (t < now) c.past++;
    }
    return c;
  }, [appointments]);

  const visible = useMemo(() => {
    const now = Date.now();
    return appointments.filter((a) => {
      const t = new Date(a.scheduled_at).getTime();
      switch (filter) {
        case "upcoming":
          return (a.status === "accepted" || a.status === "proposed") && t >= now;
        case "past":
          return t < now;
        case "needs_response":
          return a.status === "proposed" && a.proposed_by === "host";
        case "all":
          return true;
      }
    });
  }, [appointments, filter]);

  const filterOpts: Array<{ value: typeof filter; label: string; count: number }> = [
    { value: "upcoming", label: "Upcoming", count: counts.upcoming },
    { value: "needs_response", label: "Needs response", count: counts.needs_response },
    { value: "past", label: "Past", count: counts.past },
    { value: "all", label: "All", count: counts.all },
  ];

  return (
    <View style={{ marginTop: 24 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Text style={{ fontFamily: SERIF_BOLD, fontSize: 17, color: INK }}>Appointments</Text>
        <Pressable onPress={onAdd}>
          {({ pressed }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: INK,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                opacity: pressed ? 0.6 : 1,
              }}
            >
              <Feather name="plus" size={13} color={CREAM} style={{ marginRight: 4 }} />
              <Text style={{ fontFamily: SERIF_BOLD, color: CREAM, fontSize: 12}}>Add appointment</Text>
            </View>
          )}
        </Pressable>
      </View>

      {appointments.length === 0 ? (
        <View
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 18,
            paddingVertical: 24,
            paddingHorizontal: 16,
            alignItems: "center",
          }}
        >
          <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 13, textAlign: "center", lineHeight: 19 }}>
            No appointments yet. Calls, consultations, and tastings you schedule show up here.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
          >
            {filterOpts.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setFilter(opt.value)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  height: 32,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: filter === opt.value ? INK : CREAM_DEEP,
                }}
              >
                <Text
                  style={{
                    fontFamily: SERIF_BOLD,
                    color: filter === opt.value ? CREAM : INK_DIM,
                    fontSize: 12,
                  }}
                >
                  {opt.label}
                </Text>
                <Text
                  style={{
                    fontFamily: SERIF,
                    marginLeft: 6,
                    color: filter === opt.value ? "rgba(255,255,255,0.7)" : INK_DIM,
                    fontSize: 12,
                  }}
                >
                  {opt.count}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {visible.length === 0 ? (
            <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 13, textAlign: "center", paddingVertical: 20 }}>
              Nothing matches that filter.
            </Text>
          ) : (
            visible.map((appt) => (
              <AppointmentCard
                key={appt.id}
                appt={appt}
                pending={pendingId === appt.id}
                onSetStatus={onSetStatus}
                onOpenInquiry={onOpenInquiry}
              />
            ))
          )}
        </>
      )}
    </View>
  );
}

function AppointmentCard({
  appt,
  pending,
  onSetStatus,
  onOpenInquiry,
}: {
  appt: AppointmentRow;
  pending: boolean;
  onSetStatus: (a: AppointmentRow, s: AppointmentRow["status"]) => void;
  onOpenInquiry: (inquiryId: string) => void;
}) {
  const when = new Date(appt.scheduled_at);
  const inPast = when.getTime() < Date.now();
  const isPersonal = !appt.host_id;
  const heading = appt.title?.trim() || KIND_LABEL[appt.kind] || "Meeting";
  const needsMyResponse = appt.status === "proposed" && appt.proposed_by === "host";
  const canCancel = appt.status === "accepted" || appt.status === "proposed";
  const canMarkComplete = appt.status === "accepted" && inPast;

  const statusText = isPersonal
    ? "Personal"
    : appt.status === "accepted"
      ? "Confirmed"
      : appt.status === "completed"
        ? "Completed"
        : appt.status === "proposed"
          ? "Proposed"
          : appt.status === "declined"
            ? "Declined"
            : "Cancelled";

  function confirmCancel() {
    Alert.alert("Cancel this appointment?", "The other party will be notified.", [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel appointment", style: "destructive", onPress: () => onSetStatus(appt, "cancelled") },
    ]);
  }

  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 18,
        padding: 16,
        marginBottom: 10,
        shadowColor: INK,
        shadowOpacity: 0.06,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }} numberOfLines={1}>
            {heading}
            {appt.host?.display_name ? (
              <Text style={{ fontFamily: SERIF, color: INK_DIM}}> with {appt.host.display_name}</Text>
            ) : null}
          </Text>
          <Text style={{ fontFamily: SERIF, marginTop: 2, fontSize: 12, color: INK_DIM }}>
            {isPersonal
              ? "Off-platform · personal"
              : appt.proposed_by === "vendor"
                ? "Proposed by you"
                : "Proposed by the host"}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: CREAM_DEEP,
          }}
        >
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 11, color: INK_DIM }}>{statusText}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
        <Meta icon="calendar" text={when.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} />
        <Meta icon="clock" text={`${fmtApptTime(appt.scheduled_at)} · ${appt.duration_minutes} min`} />
        {appt.location ? <Meta icon="map-pin" text={appt.location} /> : null}
      </View>

      {appt.notes ? (
        <Text
          style={{
            fontFamily: SERIF,
            marginTop: 10,
            fontSize: 13,
            color: "rgba(20,22,26,0.8)",
            lineHeight: 18,
            borderLeftWidth: 2,
            borderLeftColor: BORDER,
            paddingLeft: 10,
          }}
        >
          {appt.notes}
        </Text>
      ) : null}

      {needsMyResponse || canCancel || canMarkComplete || appt.inquiry_id ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
          {needsMyResponse ? (
            <>
              <ActionBtn label="Accept" icon="check" primary disabled={pending} onPress={() => onSetStatus(appt, "accepted")} />
              <ActionBtn label="Decline" icon="x" disabled={pending} onPress={() => onSetStatus(appt, "declined")} />
            </>
          ) : null}
          {canMarkComplete ? (
            <ActionBtn label="Mark complete" icon="check-circle" disabled={pending} onPress={() => onSetStatus(appt, "completed")} />
          ) : null}
          {canCancel && !needsMyResponse ? (
            <ActionBtn label="Cancel" icon="x-circle" muted disabled={pending} onPress={confirmCancel} />
          ) : null}
          {appt.inquiry_id ? (
            <Pressable
              onPress={() => onOpenInquiry(appt.inquiry_id as string)}
              style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center" }}
              hitSlop={6}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 12}}>Open inquiry</Text>
              <Feather name="chevron-right" size={14} color={INK} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Feather name={icon} size={13} color={INK_DIM} style={{ marginRight: 5 }} />
      <Text style={{ fontFamily: SERIF, fontSize: 12, color: INK_DIM }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function ActionBtn({
  label,
  icon,
  primary,
  muted,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  primary?: boolean;
  muted?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  // Disabled gets solid colours rather than a blanket 50% opacity, which
  // fades fill and label together and reads as broken.
  const fg = disabled
    ? primary
      ? "#e4e2dd"
      : "#9a968c"
    : primary
      ? CREAM
      : muted
        ? INK_DIM
        : INK;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: primary
          ? disabled
            ? INK_MUTED
            : INK
          : muted
            ? "transparent"
            : CREAM_DEEP,
        borderWidth: muted ? 1 : 0,
        borderColor: BORDER,
      }}
    >
      <Feather name={icon} size={13} color={fg} style={{ marginRight: 4 }} />
      <Text style={{ fontFamily: SERIF_BOLD, color: fg, fontSize: 12}}>{label}</Text>
    </Pressable>
  );
}

function SmallBtn({
  label,
  onPress,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingHorizontal: 18,
        height: 42,
        borderRadius: 999,
        backgroundColor: primary ? (disabled ? INK_MUTED : INK) : CREAM,
        borderWidth: primary ? 0 : 1,
        borderColor: BORDER,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          color: primary ? CREAM : disabled ? "#9a968c" : INK,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FieldLabel({ text }: { text: string }) {
  return (
    <Text style={{ fontFamily: SERIF_BOLD, marginTop: 12, marginBottom: 6, fontSize: 12, color: INK_DIM }}>
      {text}
    </Text>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 11,
  fontSize: 15,
  color: INK,
} as const;

function CenterModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}
      >
        <Pressable
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" }}
        />
        <View style={{ backgroundColor: CREAM, borderRadius: 20, padding: 20, maxHeight: "82%" }}>
          <Text style={{ fontFamily: SERIF, fontSize: 22, color: INK }}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
