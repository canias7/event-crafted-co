// Host profile — hero card with avatar / name / member-since / quick
// stats, then two square shortcut tiles (inbox, events), then full-
// width actions (verification upsell, account settings, log out).
//
// Stats are derived from public.inquiries for now — host accounts
// don't have a dedicated bookings table yet. Unread inbox badge
// reads public.notifications.

import { useCallback, useEffect, useState } from "react";
import {
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
const GOLD = "#d99e2b";
const GREEN = "#22c55e";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

interface Stats {
  inquiries: number;
  booked: number;
  vendors: number;
  events: number;
}

interface ProfileState {
  name: string;
  email: string;
  memberSince: string;
  unread: number;
  stats: Stats;
}

function initialOf(name: string): string {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<ProfileState | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;

    const [{ data: profile }, { data: inquiries }, { count: unread }, { data: authUser }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("inquiries")
          .select("status, vendor_id, event_type, event_date")
          .eq("host_id", user.id),
        supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null),
        supabase.auth.getUser().then((r) => ({ data: r.data.user })),
      ]);

    const rows = (inquiries ?? []) as Array<{
      status: string;
      vendor_id: string;
      event_type: string | null;
      event_date: string | null;
    }>;
    const vendors = new Set(rows.map((r) => r.vendor_id));
    const events = new Set(
      rows
        .map((r) =>
          r.event_type || r.event_date
            ? `${r.event_type ?? ""}|${r.event_date ?? ""}`
            : null,
        )
        .filter(Boolean) as string[],
    );

    const createdAt = authUser?.created_at;
    const year = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
    const fallbackName =
      (profile as { display_name?: string } | null)?.display_name ??
      user.email?.split("@")[0] ??
      "Host";
    const titleCase = fallbackName
      .split(/[ _-]+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");

    setState({
      name: titleCase,
      email: user.email ?? "",
      memberSince: String(year),
      unread: unread ?? 0,
      stats: {
        inquiries: rows.length,
        booked: rows.filter((r) => r.status === "won").length,
        vendors: vendors.size,
        events: events.size,
      },
    });
  }, [user?.id, user?.email]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header row: title + bell */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <Text
              style={{
                color: INK,
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 34,
                fontWeight: "500",
              }}
            >
              Profile
            </Text>
            <Pressable
              onPress={() => router.push("/(host)/inbox" as never)}
              hitSlop={6}
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                backgroundColor: CREAM_DEEP,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="bell" size={18} color={INK} />
              {state && state.unread > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 9,
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: "#dc2626",
                  }}
                />
              ) : null}
            </Pressable>
          </View>

          <HeroCard
            initial={initialOf(state?.name ?? "")}
            name={state?.name ?? "—"}
            memberSince={state?.memberSince ?? "—"}
            stats={
              state?.stats ?? { inquiries: 0, booked: 0, vendors: 0, events: 0 }
            }
          />

          {/* Two square shortcut tiles */}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <ShortcutTile
              icon="inbox"
              title="Inbox"
              subtitle={state?.unread ? `${state.unread} unread` : "All caught up"}
              badge={state?.unread ? String(state.unread) : null}
              onPress={() => router.push("/(host)/inbox" as never)}
            />
            <ShortcutTile
              icon="calendar"
              title="My Events"
              subtitle={
                state?.stats.events
                  ? `${state.stats.events} planned`
                  : "Plan your first"
              }
              badge={null}
              onPress={() => router.push("/(host)/events" as never)}
            />
          </View>

          {/* Verification upsell — visual only for now */}
          <ActionCard
            iconBgColor={INK}
            iconColor={CREAM}
            icon="award"
            title="Become Verified"
            subtitle="Build trust with vendors. Faster replies, better matches."
            onPress={() => {}}
          />

          {/* Wide actions */}
          <ActionCard
            iconBgColor={CREAM_DEEP}
            iconColor={INK}
            icon="settings"
            title="Account settings"
            subtitle={state?.email ?? ""}
            onPress={() => {}}
          />

          <Pressable
            onPress={signOut}
            style={({ pressed }) => ({
              marginTop: 12,
              paddingVertical: 16,
              borderRadius: 18,
              backgroundColor: pressed ? "#efe6d6" : "transparent",
              alignItems: "center",
            })}
          >
            <Text style={{ color: INK_DIM, fontSize: 15, fontWeight: "500" }}>
              Log out
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function HeroCard({
  initial,
  name,
  memberSince,
  stats,
}: {
  initial: string;
  name: string;
  memberSince: string;
  stats: Stats;
}) {
  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 28,
        paddingTop: 28,
        paddingBottom: 22,
        paddingHorizontal: 22,
        alignItems: "center",
        shadowColor: INK,
        shadowOpacity: 0.06,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      }}
    >
      <View style={{ position: "relative" }}>
        <View
          style={{
            width: 110,
            height: 110,
            borderRadius: 999,
            backgroundColor: INK,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: CREAM,
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 56,
              fontWeight: "500",
            }}
          >
            {initial}
          </Text>
        </View>
        <View
          style={{
            position: "absolute",
            right: -2,
            bottom: 4,
            width: 30,
            height: 30,
            borderRadius: 999,
            backgroundColor: "#ffffff",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: CREAM,
          }}
        >
          <Feather name="check" size={16} color={GREEN} />
        </View>
      </View>

      <Text
        style={{
          marginTop: 14,
          color: INK,
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: 26,
          fontWeight: "500",
        }}
        numberOfLines={1}
      >
        {name}
      </Text>
      <Text style={{ marginTop: 4, color: INK_DIM, fontSize: 13 }}>
        Verified Host{"  •  "}Member since {memberSince}
      </Text>

      <View
        style={{
          height: 1,
          backgroundColor: BORDER,
          alignSelf: "stretch",
          marginTop: 18,
          marginBottom: 16,
        }}
      />

      <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "stretch" }}>
        <StatCol label="Inquiries" value={String(stats.inquiries)} />
        <View style={{ width: 1, height: 38, backgroundColor: BORDER }} />
        <StatCol label="Booked" value={String(stats.booked)} />
        <View style={{ width: 1, height: 38, backgroundColor: BORDER }} />
        <StatCol
          label="Vendors"
          value={String(stats.vendors)}
          trailingIcon={
            <Feather name="star" size={16} color={GOLD} style={{ marginLeft: 4 }} />
          }
        />
      </View>
    </View>
  );
}

function StatCol({
  label,
  value,
  trailingIcon,
}: {
  label: string;
  value: string;
  trailingIcon?: React.ReactNode;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text
          style={{
            color: INK,
            fontSize: 22,
            fontWeight: "700",
          }}
        >
          {value}
        </Text>
        {trailingIcon ?? null}
      </View>
      <Text
        style={{
          marginTop: 4,
          color: INK_DIM,
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.6,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function ShortcutTile({
  icon,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  badge: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: "#ffffff",
        borderRadius: 22,
        padding: 16,
        opacity: pressed ? 0.85 : 1,
        shadowColor: INK,
        shadowOpacity: 0.05,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: CREAM_DEEP,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={icon} size={20} color={INK} />
        </View>
        {badge ? (
          <View
            style={{
              backgroundColor: INK,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: CREAM, fontSize: 11, fontWeight: "700" }}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={{
          marginTop: 14,
          color: INK,
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: 18,
          fontWeight: "500",
        }}
      >
        {title}
      </Text>
      <Text style={{ marginTop: 2, color: INK_DIM, fontSize: 13 }}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

function ActionCard({
  iconBgColor,
  iconColor,
  icon,
  title,
  subtitle,
  onPress,
}: {
  iconBgColor: string;
  iconColor: string;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        marginTop: 12,
        backgroundColor: "#ffffff",
        borderRadius: 20,
        paddingVertical: 16,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        opacity: pressed ? 0.85 : 1,
        shadowColor: INK,
        shadowOpacity: 0.05,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: iconBgColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text
          style={{
            color: INK,
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{ marginTop: 2, color: INK_DIM, fontSize: 13 }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={20} color={INK_DIM} />
    </Pressable>
  );
}
