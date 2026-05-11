// Bell icon with unread count badge. Tap → slide-up sheet with the
// most recent notifications. Reads from public.notifications, which
// is populated by DB triggers on new inquiries / direct_messages.
//
// Real-time refresh: re-fetches every time the sheet opens. Doesn't
// subscribe to Supabase realtime yet — the bell badge updates on
// the next foreground / re-render. Good enough for v1.

import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationsBell({
  iconColor = "#0a0a0a",
}: { iconColor?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);

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

  // Refresh when the sheet opens so the user sees the latest.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function markAllRead() {
    if (!user?.id) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        read_at: r.read_at ?? new Date().toISOString(),
      })),
    );
  }

  const unread = rows.filter((r) => r.read_at == null).length;

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
                backgroundColor: "#dc2626",
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
          className="flex-1 bg-background"
          edges={["top", "bottom"]}
        >
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text className="text-sm text-muted-foreground">Close</Text>
            </Pressable>
            <Text className="text-base font-semibold text-foreground">
              Notifications
            </Text>
            <Pressable
              onPress={markAllRead}
              hitSlop={8}
              disabled={unread === 0}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: unread > 0 ? "#1a1410" : "#a89b8a" }}
              >
                Mark read
              </Text>
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="pb-12">
            {loading ? (
              <View className="items-center pt-16">
                <Text className="text-sm text-muted-foreground">Loading…</Text>
              </View>
            ) : rows.length === 0 ? (
              <View className="items-center pt-16 px-6">
                <Feather name="bell-off" size={28} color="#776c5f" />
                <Text className="mt-3 text-sm text-muted-foreground text-center">
                  No notifications yet.
                </Text>
              </View>
            ) : (
              rows.map((r) => (
                <View
                  key={r.id}
                  className={`px-5 py-4 border-b border-border ${
                    r.read_at == null ? "bg-muted/40" : ""
                  }`}
                >
                  <View className="flex-row items-start gap-2">
                    {r.read_at == null ? (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          backgroundColor: "#dc2626",
                          marginTop: 7,
                        }}
                      />
                    ) : null}
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-foreground">
                        {r.title}
                      </Text>
                      {r.body ? (
                        <Text
                          className="mt-0.5 text-sm text-foreground/80"
                          numberOfLines={2}
                        >
                          {r.body}
                        </Text>
                      ) : null}
                      <Text className="mt-1 text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
