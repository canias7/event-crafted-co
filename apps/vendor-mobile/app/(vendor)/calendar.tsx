// Vendor calendar tab.
//
// Three data streams render onto a month grid:
//   • inquiries (status = 'won')       → BOOKED   (ink fill, cream digit)
//   • inquiries (new/replied)          → PENDING  (soft amber fill)
//   • vendor_unavailable_dates         → BLOCKED  (diagonal hatch)
//
// The stat row up top counts won / pending / estimated earnings for the
// currently-viewed month. Earnings = sum of budget_min_cents (a
// conservative floor — inquiries don't carry a firm price field yet).
//
// Tapping a day filters the list at the bottom to that day; "+ Block"
// is wired as a UI hook for the upcoming manual-block sheet.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Svg, { Line } from "react-native-svg";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const CREAM = "#fdfbf7";
const CREAM_DEEP = "#f7f3ec";
const INK = "#1a1410";
const INK_DIM = "#776c5f";
const BORDER = "#ebe3d3";
const PENDING_BG = "#fbeed1";
const PENDING_FG = "#9c6a1a";
const HATCH = "#cbbfac";
const HATCH_BG = "#efe6d6";
const GREEN = "#16a34a";
const AMBER = "#d99e2b";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

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
  if (cents >= 1_000_000) return `$${(cents / 100_000_000).toFixed(1)}M`;
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

export default function CalendarScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [blocking, setBlocking] = useState(false);
  // Every vendor_profiles row this user owns. Calendar aggregates
  // bookings + pending inquiries across all of them so a vendor with
  // multiple marketplace listings still sees one unified schedule.
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Manual blocks the vendor has placed on specific dates across any
  // of their listings. Kept separate from `busy` (google-calendar
  // sync) since they're a different model + the rest of the marketplace
  // (e.g. the host explore filter) joins on this table directly.
  const [manualBlocks, setManualBlocks] = useState<string[]>([]);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedYmd, setSelectedYmd] = useState<string | null>(() =>
    ymdKey(new Date()),
  );

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select("id")
        .eq("user_id", user.id);
      setVendorIds(((data ?? []) as { id: string }[]).map((r) => r.id));
    })();
  }, [user?.id]);

  const monthBounds = useMemo(() => {
    const start = new Date(viewMonth);
    const end = new Date(viewMonth);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }, [viewMonth]);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (vendorIds.length === 0 || !user?.id) {
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const startYmd = ymdKey(monthBounds.start);
      const endYmd = ymdKey(monthBounds.end);
      const [inqRes, blockRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("inquiries")
          .select(
            "id, status, event_date, event_type, budget_min_cents, budget_max_cents, host_id, host:profiles!inquiries_host_id_fkey(display_name)",
          )
          .in("vendor_id", vendorIds)
          .gte("event_date", startYmd)
          .lt("event_date", endYmd),
        supabase
          .from("vendor_unavailable_dates")
          .select("date")
          .in("vendor_id", vendorIds)
          .gte("date", startYmd)
          .lt("date", endYmd),
      ]);
      const firstErr = inqRes.error ?? blockRes.error ?? null;
      if (firstErr) setError(firstErr.message);
      else {
        setInquiries((inqRes.data ?? []) as InquiryRow[]);
        setManualBlocks(
          ((blockRes.data ?? []) as { date: string }[]).map((r) => r.date),
        );
      }
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    },
    [vendorIds, user?.id, monthBounds],
  );

  useEffect(() => {
    load(false);
  }, [load]);

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
      )
        m.set(key, "pending");
    }
    for (const key of manualBlocks) {
      const prev = m.get(key);
      if (prev !== "booked" && prev !== "pending") m.set(key, "blocked");
    }
    return m;
  }, [inquiries, manualBlocks]);

  const stats = useMemo(() => {
    let booked = 0;
    let pending = 0;
    let earningsCents = 0;
    for (const i of inquiries) {
      if (i.status === "won") {
        booked++;
        earningsCents += i.budget_min_cents ?? i.budget_max_cents ?? 0;
      } else if (
        i.status === "new" ||
        i.status === "replied" ||
        i.status === "drafted"
      ) {
        pending++;
      }
    }
    return { booked, pending, earningsCents };
  }, [inquiries]);

  const selectedItems = useMemo(() => {
    if (!selectedYmd) return [];
    const out: Array<{
      kind: "inquiry" | "busy";
      inquiryId: string | null;
      title: string;
      subtitle: string;
      amountCents: number | null;
      accent: string;
      timeLabel: string | null;
    }> = [];
    for (const i of inquiries) {
      if (!i.event_date) continue;
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
        accent: i.status === "won" ? GREEN : AMBER,
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
        accent: INK_DIM,
        timeLabel: "All day",
      });
    }
    return out;
  }, [selectedYmd, inquiries, manualBlocks]);

  // Tap a booking → open the host conversation. ensure_inquiry_thread
  // is idempotent so consecutive taps just resolve to the existing
  // direct_thread row.
  const openBooking = useCallback(
    async (inquiryId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "ensure_inquiry_thread",
        { p_inquiry_id: inquiryId },
      );
      if (error || !data) {
        Alert.alert("Couldn't open thread", error?.message ?? "Try the inbox.");
        return;
      }
      router.push(`/(vendor)/thread/${data as string}` as never);
    },
    [router],
  );

  const isSelectedBlocked = !!selectedYmd && manualBlocks.includes(selectedYmd);

  // Block / unblock the selected day across every listing this user
  // owns. Writes one vendor_unavailable_dates row per vendor_profile
  // (or deletes them all if currently blocked).
  const toggleSelectedDayBlock = useCallback(() => {
    if (!selectedYmd || vendorIds.length === 0 || blocking) return;
    const willBlock = !isSelectedBlocked;
    Alert.alert(
      willBlock ? "Block this day?" : "Unblock this day?",
      willBlock
        ? `Mark ${prettyDay(selectedYmd)} unavailable across ${
            vendorIds.length === 1
              ? "your listing"
              : `your ${vendorIds.length} listings`
          }. Hosts won't see you as bookable for that date.`
        : `Re-open ${prettyDay(selectedYmd)} across ${
            vendorIds.length === 1
              ? "your listing"
              : `your ${vendorIds.length} listings`
          }.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: willBlock ? "Block" : "Unblock",
          style: willBlock ? "destructive" : "default",
          onPress: async () => {
            setBlocking(true);
            if (willBlock) {
              const rows = vendorIds.map((vid) => ({
                vendor_id: vid,
                date: selectedYmd,
                reason: "Blocked manually",
              }));
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error } = await (supabase as any)
                .from("vendor_unavailable_dates")
                .upsert(rows, { onConflict: "vendor_id,date" });
              setBlocking(false);
              if (error) {
                Alert.alert("Couldn't block", error.message);
                return;
              }
            } else {
              const { error } = await supabase
                .from("vendor_unavailable_dates")
                .delete()
                .in("vendor_id", vendorIds)
                .eq("date", selectedYmd);
              setBlocking(false);
              if (error) {
                Alert.alert("Couldn't unblock", error.message);
                return;
              }
            }
            load(false);
          },
        },
      ],
    );
  }, [selectedYmd, vendorIds, blocking, isSelectedBlocked, load]);

  function shiftMonth(delta: number) {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + delta);
    setViewMonth(next);
  }

  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

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
                backgroundColor: "#fdecea",
                borderWidth: 1,
                borderColor: "#f5c5c0",
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Text style={{ color: "#9b2c1b", fontSize: 13 }}>{error}</Text>
              <Pressable onPress={() => load(false)} style={{ marginTop: 8 }}>
                <Text
                  style={{
                    color: "#9b2c1b",
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : null}
          {loading ? (
            <View style={{ paddingVertical: 60, alignItems: "center" }}>
              <ActivityIndicator color={INK} />
            </View>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: INK,
                  fontFamily: SERIF,
                  fontStyle: "italic",
                  fontSize: 34,
                  fontWeight: "500",
                }}
              >
                Calendar
              </Text>
              <Text style={{ marginTop: 2, color: INK_DIM, fontSize: 13 }}>
                Manage your bookings & availability
              </Text>
            </View>
            <Pressable
              onPress={() => {
                // Jump the calendar back to today and select today
                // in the day list. The "filter" framing was leftover
                // chrome; this is the action vendors actually want
                // when they tap a header-right icon on a calendar.
                const today = new Date();
                setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelectedYmd(ymdKey(today));
              }}
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
                  <Feather name="calendar" size={18} color={INK} />
                </View>
              )}
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
            <StatCard
              variant="ink"
              value={String(stats.booked)}
              label="Booked"
              footer="this month"
              footerColor={GREEN}
            />
            <StatCard
              variant="paper"
              value={String(stats.pending)}
              label="Pending"
              footer={
                stats.pending === 0
                  ? "all clear"
                  : `${stats.pending} ${stats.pending === 1 ? "inquiry" : "inquiries"}`
              }
              footerColor={AMBER}
            />
            <StatCard
              variant="paper"
              value={
                stats.earningsCents > 0
                  ? fmtMoneyShort(stats.earningsCents)
                  : "$0"
              }
              label="Earnings"
              footer="est."
              footerColor={GREEN}
            />
          </View>

          <View
            style={{
              marginTop: 22,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: INK,
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 22,
                fontWeight: "500",
              }}
            >
              {monthLabel}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <ChevButton dir="left" onPress={() => shiftMonth(-1)} />
              <ChevButton dir="right" onPress={() => shiftMonth(1)} />
            </View>
          </View>

          <View
            style={{
              marginTop: 12,
              backgroundColor: "#ffffff",
              borderRadius: 24,
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 14,
              shadowColor: INK,
              shadowOpacity: 0.10,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 6 },
              elevation: 2,
            }}
          >
            <MonthGrid
              month={viewMonth}
              dayState={dayState}
              selectedYmd={selectedYmd}
              onSelect={(k) => setSelectedYmd(k)}
            />

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
              <LegendDot
                swatch={
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 4,
                      backgroundColor: INK,
                    }}
                  />
                }
                label="Booked"
              />
              <LegendDot
                swatch={
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 4,
                      backgroundColor: PENDING_BG,
                    }}
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
            </View>
          </View>

          {selectedYmd ? (
            <View
              style={{
                marginTop: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  color: INK,
                  fontFamily: SERIF,
                  fontStyle: "italic",
                  fontSize: 20,
                  fontWeight: "500",
                }}
              >
                {prettyDay(selectedYmd)}
              </Text>
              <Pressable
                onPress={toggleSelectedDayBlock}
                disabled={blocking}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: INK,
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 999,
                      opacity: pressed || blocking ? 0.6 : 1,
                    }}
                  >
                    <Feather
                      name={isSelectedBlocked ? "x" : "plus"}
                      size={14}
                      color={CREAM}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={{ color: CREAM, fontSize: 13, fontWeight: "700" }}
                    >
                      {blocking
                        ? "Saving…"
                        : isSelectedBlocked
                          ? "Unblock"
                          : "Block"}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          ) : null}

          {selectedYmd ? (
            <View style={{ marginTop: 12 }}>
              {selectedItems.length === 0 ? (
                <View
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: 18,
                    paddingVertical: 24,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: INK_DIM, fontSize: 13 }}>
                    Nothing on the books for this day.
                  </Text>
                </View>
              ) : (
                selectedItems.map((it, idx) => (
                  <BookingRow
                    key={idx}
                    item={it}
                    onPress={
                      it.kind === "inquiry" && it.inquiryId
                        ? () => openBooking(it.inquiryId as string)
                        : undefined
                    }
                  />
                ))
              )}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StatCard({
  variant,
  value,
  label,
  footer,
  footerColor,
}: {
  variant: "ink" | "paper";
  value: string;
  label: string;
  footer: string;
  footerColor: string;
}) {
  const isInk = variant === "ink";
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: isInk ? INK : "#ffffff",
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 12,
        shadowColor: INK,
        shadowOpacity: isInk ? 0 : 0.04,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <Text
        style={{
          color: isInk ? CREAM : INK,
          fontFamily: SERIF,
          fontSize: 26,
          fontWeight: "700",
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text
        style={{
          marginTop: 4,
          color: isInk ? "rgba(250,245,236,0.7)" : INK_DIM,
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.6,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <Text
        style={{
          marginTop: 6,
          color: footerColor,
          fontSize: 12,
          fontWeight: "600",
        }}
        numberOfLines={1}
      >
        {footer}
      </Text>
    </View>
  );
}

function ChevButton({
  dir,
  onPress,
}: {
  dir: "left" | "right";
  onPress: () => void;
}) {
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
      <Feather
        name={dir === "left" ? "chevron-left" : "chevron-right"}
        size={18}
        color={INK}
      />
    </Pressable>
  );
}

function LegendDot({
  swatch,
  label,
}: {
  swatch: React.ReactNode;
  label: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {swatch}
      <Text
        style={{ marginLeft: 6, color: INK, fontSize: 12, fontWeight: "700" }}
      >
        {label}
      </Text>
    </View>
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
    <View>
      <View style={{ flexDirection: "row", marginBottom: 8 }}>
        {DAY_HEADERS.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text
              style={{
                color: INK_DIM,
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 0.5,
              }}
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
            const selected = selectedYmd === key;
            return (
              <DayCell
                key={key}
                day={d.getDate()}
                inMonth={inMonth}
                state={state}
                selected={selected}
                onPress={() => onSelect(key)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function DayCell({
  day,
  inMonth,
  state,
  selected,
  onPress,
}: {
  day: number;
  inMonth: boolean;
  state: DayState;
  selected: boolean;
  onPress: () => void;
}) {
  const baseBg =
    state === "booked"
      ? INK
      : state === "pending"
        ? PENDING_BG
        : state === "blocked"
          ? HATCH_BG
          : "transparent";

  const digitColor = !inMonth
    ? "#cbbfac"
    : state === "booked"
      ? CREAM
      : state === "pending"
        ? PENDING_FG
        : INK;

  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}>
      <Pressable
        onPress={onPress}
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: baseBg,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderWidth: selected ? 2 : 0,
          borderColor: INK,
        }}
      >
        {state === "blocked" ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            <Hatch size={38} />
          </View>
        ) : null}
        <Text
          style={{
            color: digitColor,
            fontSize: 14,
            fontWeight: state === "booked" ? "700" : "600",
            fontFamily:
              state === "booked" || state === "pending" ? SERIF : undefined,
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

function BookingRow({
  item,
  onPress,
}: {
  item: {
    kind: "inquiry" | "busy";
    inquiryId: string | null;
    title: string;
    subtitle: string;
    amountCents: number | null;
    accent: string;
    timeLabel: string | null;
  };
  onPress?: () => void;
}) {
  const tappable = !!onPress;
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
            shadowOpacity: 0.10,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 4 },
            opacity: pressed && tappable ? 0.85 : 1,
          }}
        >
          <View
            style={{
              width: 4,
              alignSelf: "stretch",
              backgroundColor: item.accent,
            }}
          />
          {item.timeLabel ? (
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 14,
                alignItems: "center",
                width: 76,
              }}
            >
              <Text
                style={{
                  color: INK,
                  fontSize: 16,
                  fontWeight: "700",
                  fontFamily: SERIF,
                }}
              >
                {item.timeLabel.split(" ")[0]}
              </Text>
              <Text
                style={{
                  color: INK_DIM,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 0.6,
                }}
              >
                {item.timeLabel.split(" ").slice(1).join(" ")}
              </Text>
            </View>
          ) : (
            <View style={{ width: 12 }} />
          )}
          <View style={{ flex: 1, paddingVertical: 14, paddingRight: 14 }}>
            <Text
              style={{ color: INK, fontSize: 15, fontWeight: "700" }}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text
              style={{ marginTop: 2, color: INK_DIM, fontSize: 12 }}
              numberOfLines={1}
            >
              {item.subtitle}
            </Text>
          </View>
          {item.amountCents != null ? (
            <Text
              style={{
                color: INK,
                fontSize: 15,
                fontWeight: "700",
                marginRight: 14,
                fontFamily: SERIF,
              }}
            >
              {fmtMoneyShort(item.amountCents)}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
