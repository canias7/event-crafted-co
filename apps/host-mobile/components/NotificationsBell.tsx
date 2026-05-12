// Bell icon with unread count badge. Tap → page-sheet with grouped
// notifications. Reads from public.notifications, populated by DB
// triggers on inquiries / direct_messages / bookings.
//
// Design: cream backdrop, white cards grouped by section (TODAY /
// EARLIER) with thin internal dividers. Each row has a rounded-square
// icon tile (green check for bookings, letter avatar for messages,
// bell for system pushes), relative time on the right, red unread
// dot. "You're all caught up." footer in italic serif.

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Modal,
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

const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";
const INK = "#1a1410";
const INK_DIM = "#776c5f";
const CREAM = "#faf5ec";
const RED = "#dc2626";

const CARD_SHADOW = {
  shadowColor: "#1a1410",
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

function routeFromLink(link: string | null | undefined): string | null {
  if (!link) return "/(host)/inbox";
  let m = link.match(/\/thread\/([0-9a-f-]{36})/i);
  if (m) return `/(host)/thread/${m[1]}`;
  m = link.match(/[?&]thread=([0-9a-f-]{36})/i);
  if (m) return `/(host)/thread/${m[1]}`;
  if (/\/inquir(y|ies)\//i.test(link)) return "/(host)/inbox";
  return "/(host)/inbox";
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = Math.max(0, now - t);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

// Classify a notification into one of four icon styles. Booking /
// accepted events get a green check; chat-style events get a letter
// avatar from the title; system pushes get a bell; default to a
// letter avatar so empty types still look intentional.
function NotificationIcon({ row }: { row: NotificationRow }) {
  const box = {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  const type = (row.type ?? "").toLowerCase();
  const title = row.title ?? "";

  const isBooking =
    /booking|accepted|confirmed/.test(type) || /booked|confirmed/i.test(title);
  if (isBooking) {
    return (
      <View style={{ ...box, backgroundColor: "#d4ead8" }}>
        <Feather name="check" size={22} color="#2f7a40" />
      </View>
    );
  }

  const isMessage =
    type === "direct_message" ||
    type === "message_received" ||
    /message|reply|replied/.test(type) ||
    /replied/i.test(title);
  if (isMessage) {
    const initial = (title.trim()[0] ?? "?").toUpperCase();
    return (
      <View style={{ ...box, backgroundColor: "#f5e7da" }}>
        <Text
          style={{
            color: INK,
            fontFamily: SERIF,
            fontSize: 18,
            fontWeight: "700",
          }}
        >
          {initial}
        </Text>
      </View>
    );
  }

  const isSystem =
    /system|push|test/.test(type) || /push test|claude/i.test(title);
  if (isSystem) {
    return (
      <View style={{ ...box, backgroundColor: "#e8e3da" }}>
        <Feather name="bell" size={20} color={INK_DIM} />
      </View>
    );
  }

  const initial = (title.trim()[0] ?? "?").toUpperCase();
  return (
    <View style={{ ...box, backgroundColor: "#f5e7da" }}>
      <Text
        style={{
          color: INK,
          fontFamily: SERIF,
          fontSize: 18,
          fontWeight: "700",
        }}
      >
        {initial}
      </Text>
    </View>
  );
}

function NotificationItem({
  row,
  onPress,
}: {
  row: NotificationRow;
  onPress: () => void;
}) {
  const unread = row.read_at == null;
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 14,
            flexDirection: "row",
            alignItems: "flex-start",
            opacity: pressed ? 0.7 : 1,
          }}
        >
          <NotificationIcon row={row} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  flex: 1,
                  paddingRight: 8,
                  color: INK,
                  fontSize: 15,
                  fontWeight: "700",
                  lineHeight: 20,
                }}
                numberOfLines={2}
              >
                {row.title}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 2,
                }}
              >
                <Text style={{ color: INK_DIM, fontSize: 12 }}>
                  {relativeTime(row.created_at)}
                </Text>
                {unread ? (
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      backgroundColor: RED,
                      marginLeft: 6,
                    }}
                  />
                ) : null}
              </View>
            </View>
            {row.body ? (
              <Text
                style={{
                  marginTop: 3,
                  color: INK,
                  fontSize: 14,
                  lineHeight: 19,
                }}
                numberOfLines={2}
              >
                {row.body}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

function Section({
  label,
  rows,
  onItemPress,
}: {
  label: string;
  rows: NotificationRow[];
  onItemPress: (row: NotificationRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <Text
        style={{
          marginTop: 22,
          marginBottom: 10,
          paddingHorizontal: 4,
          color: INK_DIM,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 1.2,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 18,
          overflow: "hidden",
          ...CARD_SHADOW,
        }}
      >
        {rows.map((r, i) => (
          <Fragment key={r.id}>
            <NotificationItem row={r} onPress={() => onItemPress(r)} />
            {i < rows.length - 1 ? (
              <View
                style={{
                  height: 1,
                  backgroundColor: "#efe5d2",
                  marginLeft: 70,
                }}
              />
            ) : null}
          </Fragment>
        ))}
      </View>
    </>
  );
}

export function NotificationsBell({
  iconColor = "#1a1410",
}: { iconColor?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);

  const openNotification = useCallback(
    async (n: NotificationRow) => {
      if (n.read_at == null && user?.id) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r,
          ),
        );
        supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", n.id)
          .then(() => undefined);
      }
      const route = routeFromLink(n.link);
      setOpen(false);
      if (route) router.push(route as never);
    },
    [user?.id, router],
  );

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data ?? []) as NotificationRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function markAllRead() {
    if (!user?.id) return;
    // Optimistic first so the bell badge drops to 0 immediately —
    // otherwise the await blocks the UI for the network round-trip
    // and the badge looks stale until it returns.
    const now = new Date().toISOString();
    setRows((prev) =>
      prev.map((r) => ({ ...r, read_at: r.read_at ?? now })),
    );
    await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
  }

  const unread = rows.filter((r) => r.read_at == null).length;
  const today = rows.filter((r) => isToday(r.created_at));
  const earlier = rows.filter((r) => !isToday(r.created_at));

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        className="active:opacity-60"
      >
        <View>
          <Feather name="bell" size={22} color={iconColor} />
          {unread > 0 ? (
            <View
              style={{
                position: "absolute",
                top: -4,
                right: -6,
                minWidth: 16,
                height: 16,
                borderRadius: 999,
                backgroundColor: RED,
                paddingHorizontal: 4,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}
              >
                {unread > 9 ? "9+" : unread}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: CREAM }}
          edges={["top", "bottom"]}
        >
          {/* Header — italic serif title centered, Close / Mark read
              flanking. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 14,
            }}
          >
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={{ color: INK, fontSize: 15 }}>Close</Text>
            </Pressable>
            <Text
              style={{
                color: INK,
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 22,
                fontWeight: "700",
              }}
            >
              Notifications
            </Text>
            <Pressable
              onPress={markAllRead}
              hitSlop={8}
              disabled={unread === 0}
            >
              <Text
                style={{
                  color: unread > 0 ? INK : "#a89b8a",
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                Mark read
              </Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 32,
            }}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={{ alignItems: "center", paddingTop: 80 }}>
                <Text style={{ color: INK_DIM, fontSize: 14 }}>Loading…</Text>
              </View>
            ) : rows.length === 0 ? (
              <View
                style={{ alignItems: "center", paddingTop: 80, paddingHorizontal: 24 }}
              >
                <Feather name="bell-off" size={32} color={INK_DIM} />
                <Text
                  style={{
                    marginTop: 14,
                    color: INK_DIM,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  No notifications yet.
                </Text>
              </View>
            ) : (
              <>
                <Section
                  label="TODAY"
                  rows={today}
                  onItemPress={openNotification}
                />
                <Section
                  label="EARLIER"
                  rows={earlier}
                  onItemPress={openNotification}
                />
                <Text
                  style={{
                    marginTop: 28,
                    textAlign: "center",
                    color: INK_DIM,
                    fontFamily: SERIF,
                    fontStyle: "italic",
                    fontSize: 15,
                  }}
                >
                  You&apos;re all caught up.
                </Text>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
