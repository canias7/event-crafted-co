// Bell icon with unread count badge. Tap → slide-up sheet with the
// most recent notifications. Reads from public.notifications, which
// is populated by DB triggers on new inquiries / direct_messages.
//
// Real-time refresh: re-fetches every time the sheet opens. Doesn't
// subscribe to Supabase realtime yet — the bell badge updates on
// the next foreground / re-render. Good enough for v1.

import { useCallback, useEffect, useState } from "react";
import {
  Image,
  Modal,
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
import { useT } from "@/lib/i18n";
import { C, IS_DARK } from "@/lib/theme";

// Unread rows: a faint wash (bg-muted at 40% in light).
const UNREAD_BG = IS_DARK ? "rgba(255,255,255,0.05)" : "rgba(236,231,219,0.4)";
const EMPTY_ICON = IS_DARK ? C.placeholder : "#6f6a60";

// Translate a notification's web-style link into the matching vendor
// native route. Mirrors lib/pushNotifications.ts so tap-routing is
// consistent whether the user came in via push or via the bell sheet.
function routeFromLink(link: string | null | undefined): string | null {
  if (!link) return "/(vendor)/inbox";
  let m = link.match(/\/thread\/([0-9a-f-]{36})/i);
  if (m) return `/(vendor)/thread/${m[1]}`;
  m = link.match(/[?&]thread=([0-9a-f-]{36})/i);
  if (m) return `/(vendor)/thread/${m[1]}`;
  if (/\/inquir(y|ies)\//i.test(link)) return "/(vendor)/inbox";
  return "/(vendor)/inbox";
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  actor_image_url: string | null;
}

export function NotificationsBell({
  iconColor = C.text,
}: { iconColor?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const { t, locale } = useT("notificationsBell");
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
          .then(({ error }) => {
            if (error) {
              // eslint-disable-next-line no-console
              console.warn(
                "[NotificationsBell] mark-read failed",
                error.message,
              );
              // Roll the optimistic read back so the badge count stays
              // honest when the write didn't land.
              setRows((prev) =>
                prev.map((r) =>
                  r.id === n.id ? { ...r, read_at: null } : r,
                ),
              );
            }
          });
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
      .select("id, type, title, body, link, read_at, created_at, actor_image_url")
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
    // Optimistic first so the bell badge drops to 0 immediately.
    const now = new Date().toISOString();
    const wasUnread = new Set(
      rows.filter((r) => r.read_at == null).map((r) => r.id),
    );
    if (wasUnread.size === 0) return;
    setRows((prev) =>
      prev.map((r) => ({ ...r, read_at: r.read_at ?? now })),
    );
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[NotificationsBell] mark-all-read failed", error.message);
      // Restore exactly the rows we optimistically flipped.
      setRows((prev) =>
        prev.map((r) => (wasUnread.has(r.id) ? { ...r, read_at: null } : r)),
      );
    }
  }

  const unread = rows.filter((r) => r.read_at == null).length;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        className="active:opacity-60"
        accessibilityRole="button"
        accessibilityLabel={t("title")}
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
                // Unread count: champagne with an ink number, per the brand.
                backgroundColor: C.gold,
                paddingHorizontal: 4,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ fontFamily: "LibreBaskerville-Bold", color: C.onGold, fontSize: 10}}
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
          className="flex-1"
          style={{ backgroundColor: C.page }}
          edges={["top", "bottom"]}
        >
          <View className="flex-row items-center justify-between px-5 py-3 border-b" style={{ borderColor: C.border }}>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text className="text-sm" style={{ color: C.textDim, fontFamily: "LibreBaskerville" }}>{t("close")}</Text>
            </Pressable>
            <Text className="text-base" style={{ color: C.text, fontFamily: "LibreBaskerville-Bold" }}>
              {t("title")}
            </Text>
            <Pressable
              onPress={markAllRead}
              hitSlop={8}
              disabled={unread === 0}
            >
              <Text
                className="text-sm"
                style={{ fontFamily: "LibreBaskerville", color: unread > 0 ? C.text : C.placeholder }}
              >
                {t("markRead")}
              </Text>
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="pb-12">
            {loading ? (
              <View className="items-center pt-16">
                <Text className="text-sm" style={{ color: C.textDim, fontFamily: "LibreBaskerville" }}>{t("loading")}</Text>
              </View>
            ) : rows.length === 0 ? (
              <View className="items-center pt-16 px-6">
                <Feather name="bell-off" size={28} color={EMPTY_ICON} />
                <Text className="mt-3 text-sm text-center" style={{ color: C.textDim, fontFamily: "LibreBaskerville" }}>
                  {t("empty")}
                </Text>
              </View>
            ) : (
              rows.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => openNotification(r)}
                  className="px-5 py-4 border-b active:opacity-70"
                  style={{
                    borderColor: C.border,
                    backgroundColor: r.read_at == null ? UNREAD_BG : undefined,
                  }}
                >
                  <View className="flex-row items-start gap-3">
                    {r.read_at == null ? (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          backgroundColor: C.gold,
                          marginTop: 7,
                        }}
                      />
                    ) : null}
                    {r.actor_image_url ? (
                      <Image
                        source={{ uri: r.actor_image_url }}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: C.surface,
                        }}
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      // Default avatar when the sender hasn't uploaded
                      // a logo / photo yet. Mirrors the styled initial
                      // tile pattern used everywhere else in the app
                      // (profile screens, host-mobile bell, etc).
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: C.selected,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "LibreBaskerville-Bold",
                            color: C.onSelected,
                            fontSize: 16,
                          }}
                        >
                          {(r.title?.trim()[0] ?? "?").toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View className="flex-1">
                      <Text className="text-base" style={{ color: C.text, fontFamily: "LibreBaskerville-Bold" }}>
                        {r.title}
                      </Text>
                      {r.body ? (
                        <Text
                          className="mt-0.5 text-sm"
                          numberOfLines={2}
                          style={{ color: C.text, fontFamily: "LibreBaskerville" }}
                        >
                          {r.body}
                        </Text>
                      ) : null}
                      <Text className="mt-1 text-xs" style={{ color: C.textDim, fontFamily: "LibreBaskerville" }}>
                        {new Date(r.created_at).toLocaleString(locale)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
