// Events tab. An "event" in our model is derived: any unique
// (event_type, event_date, location) triple that this host has at
// least one inquiry against. We group inquiries into that shape,
// pick the next upcoming one as the "Up next" hero card, then list
// the rest grouped by month.
//
// When a real public.events table eventually lands, this screen
// swaps its data source over without touching the layout.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const CREAM = "#faf5ec";
const CREAM_DEEP = "#f5efe5";
const INK = "#1a1410";
const INK_DIM = "#776c5f";
const BORDER = "#e8dfcf";
const GREEN = "#22c55e";
const AMBER = "#d99e2b";
const GREEN_BG = "#e3f5e8";
const AMBER_BG = "#fbeed1";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

// Same hue palette as inbox so a vendor's avatar color is consistent
// everywhere they appear in the app.
const HUES = [
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#fbbf24",
  "#34d399",
  "#60a5fa",
  "#22d3ee",
  "#f87171",
];

function hueFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return HUES[Math.abs(h) % HUES.length];
}

function initialsOf(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function titleCase(s: string | null | undefined): string {
  if (!s) return "Event";
  return s
    .split(/[ _-]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

interface RawInquiry {
  id: string;
  vendor_id: string;
  status: string;
  event_type: string | null;
  event_date: string | null;
  location: string | null;
  vendor: { business_name: string; category: string | null } | null;
}

interface VendorChip {
  inquiry_id: string;
  vendor_id: string;
  name: string;
  status: string;
}

interface HostEvent {
  key: string;
  title: string;
  eventDate: Date | null;
  location: string | null;
  vendors: VendorChip[];
}

function asDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  // PostgREST returns dates as YYYY-MM-DD; parse in local time so the
  // "May 16" the host sees matches the date they typed.
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function groupIntoEvents(rows: RawInquiry[]): HostEvent[] {
  const map = new Map<string, HostEvent>();
  for (const r of rows) {
    const dateStr = r.event_date ?? "tbd";
    const key = [r.event_type ?? "_", dateStr, r.location ?? "_"].join("|");
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: titleCase(r.event_type),
        eventDate: asDate(r.event_date),
        location: r.location,
        vendors: [],
      });
    }
    map.get(key)!.vendors.push({
      inquiry_id: r.id,
      vendor_id: r.vendor_id,
      name: r.vendor?.business_name ?? "Vendor",
      status: r.status,
    });
  }
  return [...map.values()].sort((a, b) => {
    const aT = a.eventDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bT = b.eventDate?.getTime() ?? Number.POSITIVE_INFINITY;
    return aT - bT;
  });
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(date);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86_400_000);
}

function relativeLabel(date: Date): string {
  const d = daysUntil(date);
  if (d < 0) return `${Math.abs(d)} ${Math.abs(d) === 1 ? "day" : "days"} ago`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 7) return `In ${d} days`;
  if (d < 14) return "Next week";
  if (d < 30) return `In ${Math.round(d / 7)} weeks`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function fmtFullDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function EventsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<HostEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  // Filter pill cycles "upcoming only" (default) -> "all" (includes past).
  // The hero "Up next" card stays bound to the next future event either way.
  const [showPast, setShowPast] = useState(false);

  // Tap an event card -> drop into the matching conversation. Single
  // vendor goes straight to that thread via ensure_inquiry_thread.
  // Multi-vendor events bounce to the inbox so the host can pick.
  const openEvent = useCallback(
    async (event: HostEvent) => {
      if (event.vendors.length === 0) return;
      if (event.vendors.length === 1) {
        const inquiryId = event.vendors[0].inquiry_id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc(
          "ensure_inquiry_thread",
          { p_inquiry_id: inquiryId },
        );
        if (error || !data) {
          Alert.alert("Couldn't open this thread", error?.message ?? "Try again from the inbox.");
          return;
        }
        router.push(`/(host)/thread/${data as string}` as never);
        return;
      }
      // 2+ vendors on the same event date: jump to inbox.
      router.push("/(host)/inbox" as never);
    },
    [router],
  );

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("inquiries")
      .select(
        "id, vendor_id, status, event_type, event_date, location, vendor:vendor_profiles!inquiries_vendor_id_fkey(business_name, category)",
      )
      .eq("host_id", user.id)
      .order("event_date", { ascending: true, nullsFirst: false });
    setEvents(groupIntoEvents((data ?? []) as RawInquiry[]));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // The 14-day strip starts on today and walks forward two weeks.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dayStrip = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, [today]);

  const eventsByDayKey = useMemo(() => {
    const m = new Map<string, HostEvent[]>();
    for (const e of events) {
      if (!e.eventDate) continue;
      const key = e.eventDate.toDateString();
      const list = m.get(key) ?? [];
      list.push(e);
      m.set(key, list);
    }
    return m;
  }, [events]);

  const upcoming = useMemo(
    () => events.filter((e) => e.eventDate && e.eventDate.getTime() >= today.getTime()),
    [events, today],
  );

  // The "Up next" hero ALWAYS targets the next future event. The
  // showPast toggle only widens what the "This month" list renders.
  const upNext = upcoming[0] ?? null;
  const upNextKey = upNext?.key ?? null;

  const thisMonthCount = useMemo(() => {
    const monthStart = new Date(today);
    monthStart.setDate(1);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthStart.getMonth() + 1);
    return events.filter(
      (e) =>
        e.eventDate &&
        e.eventDate.getTime() >= monthStart.getTime() &&
        e.eventDate.getTime() < monthEnd.getTime(),
    ).length;
  }, [events, today]);

  const thisMonthList = useMemo(() => {
    const source = showPast ? events : upcoming;
    return source.filter(
      (e) =>
        e.key !== upNextKey &&
        e.eventDate &&
        e.eventDate.getMonth() === today.getMonth() &&
        e.eventDate.getFullYear() === today.getFullYear(),
    );
  }, [showPast, events, upcoming, upNextKey, today]);

  const filteredByDay = useMemo(() => {
    if (!selectedDayKey) return null;
    return eventsByDayKey.get(selectedDayKey) ?? [];
  }, [selectedDayKey, eventsByDayKey]);

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ paddingTop: 6, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View
            style={{
              paddingHorizontal: 22,
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
                Events
              </Text>
              <Text style={{ marginTop: 2, color: INK_DIM, fontSize: 13 }}>
                {upcoming.length} upcoming · {fmtMonthYear(today)}
              </Text>
            </View>
            <Pressable
              onPress={() => setShowPast((v) => !v)}
              hitSlop={6}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 999,
                backgroundColor: showPast ? INK : CREAM_DEEP,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Feather
                name="filter"
                size={18}
                color={showPast ? CREAM : INK}
              />
            </Pressable>
          </View>

          {/* 14-day strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 18,
              paddingBottom: 4,
              gap: 8,
            }}
          >
            {dayStrip.map((d) => {
              const key = d.toDateString();
              const isSelected = selectedDayKey === key;
              const hasEvent = (eventsByDayKey.get(key) ?? []).length > 0;
              return (
                <DayPill
                  key={key}
                  date={d}
                  isSelected={isSelected}
                  hasEvent={hasEvent}
                  onPress={() => setSelectedDayKey(isSelected ? null : key)}
                />
              );
            })}
          </ScrollView>

          {/* Selected-day list (shown when a day is picked) */}
          {filteredByDay !== null ? (
            <View style={{ paddingHorizontal: 18, marginTop: 18 }}>
              <Text
                style={{
                  fontFamily: SERIF,
                  fontStyle: "italic",
                  fontSize: 20,
                  color: INK,
                  marginBottom: 10,
                }}
              >
                {filteredByDay.length === 0 ? "Nothing on this day" : "On this day"}
              </Text>
              {filteredByDay.map((e) => (
                <EventRow key={e.key} event={e} onOpen={() => openEvent(e)} />
              ))}
            </View>
          ) : (
            <>
              {/* Up next */}
              {upNext ? (
                <>
                  <View
                    style={{
                      paddingHorizontal: 22,
                      marginTop: 22,
                      marginBottom: 8,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: GREEN,
                        marginRight: 8,
                      }}
                    />
                    <Text
                      style={{
                        color: INK,
                        fontFamily: SERIF,
                        fontStyle: "italic",
                        fontSize: 17,
                      }}
                    >
                      Up next
                    </Text>
                  </View>
                  <UpNextCard event={upNext} onOpen={() => openEvent(upNext)} />
                </>
              ) : null}

              {/* This month */}
              {thisMonthList.length > 0 ? (
                <View style={{ paddingHorizontal: 22, marginTop: 28 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: SERIF,
                        fontStyle: "italic",
                        fontSize: 20,
                        color: INK,
                      }}
                    >
                      This month
                    </Text>
                    <Pressable
                      onPress={() => router.push("/(host)/inbox" as never)}
                      hitSlop={6}
                    >
                      <Text style={{ color: INK_DIM, fontSize: 13 }}>
                        See all
                      </Text>
                    </Pressable>
                  </View>
                  {thisMonthList.map((e) => (
                    <EventRow key={e.key} event={e} onOpen={() => openEvent(e)} />
                  ))}
                </View>
              ) : null}

              {/* Empty state */}
              {!loading && events.length === 0 ? (
                <View
                  style={{
                    alignItems: "center",
                    paddingHorizontal: 22,
                    paddingVertical: 64,
                  }}
                >
                  <Feather name="calendar" size={28} color={INK_DIM} />
                  <Text
                    style={{
                      color: INK_DIM,
                      fontSize: 14,
                      textAlign: "center",
                      marginTop: 12,
                    }}
                  >
                    No events yet. When you book a vendor, the event lands here.
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DayPill({
  date,
  isSelected,
  hasEvent,
  onPress,
}: {
  date: Date;
  isSelected: boolean;
  hasEvent: boolean;
  onPress: () => void;
}) {
  const dow = date
    .toLocaleDateString(undefined, { weekday: "short" })
    .slice(0, 3)
    .toUpperCase();
  const day = date.getDate();

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 64,
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 18,
        backgroundColor: isSelected ? INK : CREAM_DEEP,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: isSelected ? CREAM : INK_DIM,
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.6,
        }}
      >
        {dow}
      </Text>
      <Text
        style={{
          marginTop: 2,
          color: isSelected ? CREAM : INK,
          fontSize: 22,
          fontWeight: "700",
          fontFamily: SERIF,
        }}
      >
        {day}
      </Text>
      <View
        style={{
          marginTop: 6,
          width: 4,
          height: 4,
          borderRadius: 999,
          backgroundColor: hasEvent
            ? isSelected
              ? CREAM
              : INK
            : "transparent",
        }}
      />
    </Pressable>
  );
}

function VendorBubbles({
  vendors,
  small,
}: {
  vendors: VendorChip[];
  small?: boolean;
}) {
  const size = small ? 22 : 28;
  const visible = vendors.slice(0, 3);
  const overflow = vendors.length - visible.length;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {visible.map((v, i) => (
        <View
          key={v.vendor_id}
          style={{
            width: size,
            height: size,
            borderRadius: 999,
            backgroundColor: hueFor(v.vendor_id),
            alignItems: "center",
            justifyContent: "center",
            marginLeft: i === 0 ? 0 : -8,
            borderWidth: 2,
            borderColor: CREAM,
          }}
        >
          <Text
            style={{
              color: "#ffffff",
              fontSize: small ? 9 : 10,
              fontWeight: "700",
            }}
          >
            {initialsOf(v.name)}
          </Text>
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={{
            paddingHorizontal: 6,
            height: size,
            borderRadius: 999,
            backgroundColor: CREAM_DEEP,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: -8,
            borderWidth: 2,
            borderColor: CREAM,
            minWidth: size,
          }}
        >
          <Text
            style={{ color: INK, fontSize: small ? 10 : 11, fontWeight: "700" }}
          >
            +{overflow}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function statusOf(vendors: VendorChip[]): {
  text: string;
  fg: string;
  bg: string;
} {
  const won = vendors.filter((v) => v.status === "won").length;
  const pending = vendors.filter(
    (v) => v.status === "new" || v.status === "replied" || v.status === "drafted",
  ).length;
  if (vendors.length > 0 && won === vendors.length) {
    return { text: "Confirmed", fg: GREEN, bg: GREEN_BG };
  }
  if (pending > 0) {
    return {
      text: `Awaiting ${pending}`,
      fg: AMBER,
      bg: AMBER_BG,
    };
  }
  return {
    text: `${vendors.length} ${vendors.length === 1 ? "inquiry" : "inquiries"}`,
    fg: INK_DIM,
    bg: CREAM_DEEP,
  };
}

function UpNextCard({ event, onOpen }: { event: HostEvent; onOpen: () => void }) {
  const confirmed = event.vendors.filter((v) => v.status === "won").length;
  const summary =
    confirmed > 0
      ? `${confirmed} ${confirmed === 1 ? "vendor" : "vendors"} confirmed`
      : `${event.vendors.length} ${event.vendors.length === 1 ? "vendor" : "vendors"} pending`;

  return (
    <View style={{ paddingHorizontal: 22 }}>
      <View
        style={{
          backgroundColor: INK,
          borderRadius: 28,
          paddingHorizontal: 22,
          paddingTop: 20,
          paddingBottom: 18,
        }}
      >
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          {event.eventDate ? (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: "rgba(250,245,236,0.10)",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: GREEN,
                  marginRight: 6,
                }}
              />
              <Text style={{ color: CREAM, fontSize: 12, fontWeight: "600" }}>
                {relativeLabel(event.eventDate)}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <Pressable hitSlop={6} onPress={onOpen}>
            <Feather name="more-horizontal" size={20} color={CREAM} />
          </Pressable>
        </View>

        <Text
          style={{
            marginTop: 18,
            color: CREAM,
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: 28,
            fontWeight: "500",
          }}
        >
          {event.title}
        </Text>
        <Text
          style={{
            marginTop: 6,
            color: "rgba(250,245,236,0.65)",
            fontSize: 14,
          }}
        >
          {[
            event.eventDate ? fmtFullDate(event.eventDate) : null,
            event.location,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </Text>

        <View
          style={{
            height: 1,
            backgroundColor: "rgba(250,245,236,0.15)",
            marginTop: 18,
            marginBottom: 14,
          }}
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flex: 1,
              marginRight: 12,
            }}
          >
            <VendorBubbles vendors={event.vendors} />
            <Text
              style={{
                marginLeft: 10,
                color: CREAM,
                fontSize: 14,
                fontWeight: "600",
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {summary}
            </Text>
          </View>
          <Pressable
            onPress={onOpen}
            style={({ pressed }) => ({
              backgroundColor: CREAM_DEEP,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: INK, fontSize: 13, fontWeight: "700" }}>
              View
            </Text>
            <Feather
              name="chevron-right"
              size={14}
              color={INK}
              style={{ marginLeft: 2 }}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function EventRow({ event, onOpen }: { event: HostEvent; onOpen: () => void }) {
  const status = statusOf(event.vendors);
  const month = event.eventDate
    ? event.eventDate.toLocaleDateString(undefined, { month: "short" }).toUpperCase()
    : null;
  const day = event.eventDate ? event.eventDate.getDate() : null;
  const dow = event.eventDate
    ? event.eventDate.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()
    : null;

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => ({
        backgroundColor: "#ffffff",
        borderRadius: 20,
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        marginBottom: 10,
        shadowColor: INK,
        shadowOpacity: 0.04,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 1,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* Date block */}
      <View
        style={{
          width: 64,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: CREAM_DEEP,
          alignItems: "center",
        }}
      >
        <Text
          style={{ color: INK_DIM, fontSize: 10, fontWeight: "600", letterSpacing: 0.6 }}
        >
          {month ?? "TBD"}
        </Text>
        <Text
          style={{
            color: INK,
            fontFamily: SERIF,
            fontSize: 24,
            fontWeight: "700",
            marginTop: 2,
          }}
        >
          {day ?? "—"}
        </Text>
        <Text
          style={{
            color: INK_DIM,
            fontSize: 10,
            fontWeight: "600",
            letterSpacing: 0.6,
            marginTop: 2,
          }}
        >
          {dow ?? ""}
        </Text>
      </View>

      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          style={{
            color: INK,
            fontSize: 15,
            fontWeight: "700",
          }}
          numberOfLines={1}
        >
          {event.title}
        </Text>
        <Text
          style={{ marginTop: 2, color: INK_DIM, fontSize: 12 }}
          numberOfLines={1}
        >
          {event.location ?? "Location TBD"}
        </Text>
        <View
          style={{
            marginTop: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <VendorBubbles vendors={event.vendors} small />
            <Text
              style={{ marginLeft: 8, color: INK_DIM, fontSize: 12, fontWeight: "600" }}
            >
              {event.vendors.length}{" "}
              {event.vendors.length === 1 ? "vendor" : "vendors"}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: status.bg,
            }}
          >
            <Text style={{ color: status.fg, fontSize: 11, fontWeight: "700" }}>
              {status.text}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
