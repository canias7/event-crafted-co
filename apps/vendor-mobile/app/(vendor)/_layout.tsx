// Vendor mobile tab layout — 5 tabs with a custom floating pill tab bar.
//
// Tabs: Inbox · Gallery · My Profile · Calendar · More. Settings opens
// from the More menu.
//
// Style spec: pill floats ~16px above the bottom safe area, cream bg,
// soft shadow. Inactive tabs are line icons (Feather), active tab is a
// solid ink circle with a white icon, and every tab carries a label.
//
// The labels are not only for legibility. Without them each tab was a
// fixed 48pt box spread by space-between, so the icons floated with
// uneven gaps; as flex items with labels they distribute evenly. Five
// tabs at a 412pt screen gives ~70pt each — a sixth would drop that to
// ~58pt, which "Calendar" very nearly fills on its own.
//
// Inbox carries a count of inquiries still at status 'new'. It is the
// only place in the app that can say "someone is waiting on you":
// push reaches almost no one (two tokens, both iOS) and an inquiry sent
// from the host mobile app triggers no email at all. The count matches
// Inbox's own "New" filter exactly, and clears by replying — not by
// opening the tab, which would hide work rather than finish it.

import { useCallback, useEffect, useState } from "react";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { usePushNotificationTapHandler } from "@/lib/pushNotifications";

// route name → Feather icon name
const ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  inbox: "inbox",
  gallery: "image",
  profile: "user",
  calendar: "calendar",
  more: "more-horizontal",
};

const LABELS: Record<string, string> = {
  inbox: "Inbox",
  gallery: "Gallery",
  profile: "Profile",
  calendar: "Calendar",
  more: "More",
};

const ORDER = ["inbox", "gallery", "profile", "calendar", "more"];

// Count of inquiries the vendor has not answered. Re-read whenever the
// focused tab changes and when the app returns to the foreground, which
// covers every way the number can go stale without polling.
function useNewInquiryCount(focusedRoute: string | undefined): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setCount(0);
      return;
    }
    const { data: vps } = await supabase
      .from("vendor_profiles")
      .select("id")
      .eq("user_id", user.id);
    const ids = ((vps ?? []) as { id: string }[]).map((v) => v.id);
    if (ids.length === 0) {
      setCount(0);
      return;
    }
    // head:true — we want the number, not the rows.
    const { count: n } = await supabase
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .in("vendor_id", ids)
      .eq("status", "new");
    setCount(n ?? 0);
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, focusedRoute]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return count;
}

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const focusedRoute = state.routes[state.index]?.name;
  // Called before the early return below — the bar is unmounted on
  // full-bleed screens, and a hook after that branch would run
  // conditionally.
  const newInquiries = useNewInquiryCount(focusedRoute);
  // Hide the floating bar on screens that own the bottom — the listing
  // builder has its own Save / Publish action bar, and the conversation
  // screen has its own composer pinned at the bottom.
  if (
    focusedRoute === "listing" ||
    focusedRoute === "venue-listing" ||
    focusedRoute === "food-listing" ||
    focusedRoute === "entertainment-listing" ||
    focusedRoute === "media-listing" ||
    focusedRoute === "design-listing" ||
    focusedRoute === "beauty-listing" ||
    focusedRoute === "rental-listing" ||
    focusedRoute === "experience-listing" ||
    focusedRoute === "corporate-listing" ||
    focusedRoute === "scheduling" ||
    focusedRoute === "thread/[id]" ||
    focusedRoute === "partner-thread/[id]" ||
    focusedRoute === "edit-profile"
  )
    return null;
  // Filter to only the visible tabs we care about, in our preferred order.
  const visible = ORDER.map((name) =>
    state.routes.find((r) => r.name === name),
  ).filter(Boolean) as typeof state.routes;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 24,
        alignItems: "center",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#fbf9f4",
          borderWidth: 1,
          borderColor: "#e6e1d5",
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 8,
          height: 74,
          width: "100%",
          maxWidth: 420,
          shadowColor: "#000",
          shadowOpacity: 0.10,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        {visible.map((route) => {
          const realIndex = state.routes.findIndex((r) => r.key === route.key);
          const isFocused = state.index === realIndex;
          const iconName = ICONS[route.name] ?? "circle";

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name as never);
                }
              }}
              hitSlop={6}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isFocused ? "#14161a" : "transparent",
                }}
              >
                <Feather
                  name={iconName}
                  size={20}
                  color={isFocused ? "#ffffff" : "#6f6a60"}
                />
                {route.name === "inbox" && newInquiries > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: -2,
                      right: -2,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 999,
                      paddingHorizontal: 5,
                      backgroundColor: "#b23a34",
                      // Ring in the bar's own cream so the badge reads as
                      // sitting on top of the icon rather than merging
                      // with it when the tab is active and dark.
                      borderWidth: 1.5,
                      borderColor: "#fbf9f4",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "LibreBaskerville-Bold",
                        fontSize: 9,
                        lineHeight: 12,
                        color: "#ffffff",
                      }}
                    >
                      {newInquiries > 99 ? "99+" : newInquiries}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: isFocused ? "LibreBaskerville-Bold" : "LibreBaskerville",
                  fontSize: 10,
                  marginTop: 2,
                  color: isFocused ? "#14161a" : "#6f6a60",
                }}
              >
                {LABELS[route.name] ?? route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function VendorLayout() {
  const { loading, user } = useAuth();
  // Wire push-tap → deep-link routing once the tab navigator is mounted.
  // Both cold-start taps (app killed) and warm taps go through here.
  usePushNotificationTapHandler();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      initialRouteName="inbox"
      // Every screen here is a tab route (the editors are just hidden
      // ones), so router.back() follows the TAB navigator's back rule.
      // The default is "return to the first route" — which sent every
      // Save / close in edit-profile and the listing builder to Inbox
      // instead of the screen the vendor came from (profile, or the
      // setup checklist). "history" makes back mean "where I just was".
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // The screen content sits behind the floating bar at the bottom.
        // Each screen's ScrollView already has pb-12+ padding; the
        // floating bar is ~76px tall (64 + safe-area), so anything that
        // ends near the bottom should add some extra padding.
        tabBarStyle: { position: "absolute" },
      }}
    >
      <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
      <Tabs.Screen name="gallery" options={{ title: "Gallery" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
      {/* Listing builder — reached from the Profile tab's "Create
          listing" CTA / 4-segment toggle. Hidden from the bottom nav
          because it's a one-and-done flow per vendor. */}
      <Tabs.Screen name="listing" options={{ href: null }} />
      {/* Subscription — reached from More and upgrade prompts, not a
          tab of its own. */}
      <Tabs.Screen name="subscription" options={{ href: null }} />
      <Tabs.Screen name="vendor/[id]" options={{ href: null }} />
      <Tabs.Screen name="thread/[id]" options={{ href: null }} />
      <Tabs.Screen name="partner-thread/[id]" options={{ href: null }} />
      {/* Vendor discovery — pushed from the Inbox's Partners tab, not a
          tab of its own. */}
      <Tabs.Screen name="find-vendor" options={{ href: null }} />
      <Tabs.Screen name="edit-profile" options={{ href: null }} />
      {/* Setup checklist — pushed from the Profile tab's "You're almost
          live!" banner, not a tab of its own. */}
      <Tabs.Screen name="setup" options={{ href: null }} />
      {/* What's-new changelog — pushed from More, not a tab of its own. */}
      <Tabs.Screen name="updates" options={{ href: null }} />
      {/* Meet the Team editor — pushed from More. */}
      <Tabs.Screen name="team" options={{ href: null }} />
      {/* Smart Scheduling & Automations — pushed from More / Calendar.
          Owns the bottom (Save pill), so the floating bar hides. */}
      <Tabs.Screen name="scheduling" options={{ href: null }} />
      {/* Vendora CRM (Clients) — Pro+ perk, pushed from More. */}
      <Tabs.Screen name="crm" options={{ href: null }} />
      {/* Verification — Pro+ verified-badge application, pushed from More. */}
      <Tabs.Screen name="verification" options={{ href: null }} />
      {/* Category-specific listing wizards — listing.tsx redirects each
          group's categories to its own builder. */}
      <Tabs.Screen name="venue-listing" options={{ href: null }} />
      <Tabs.Screen name="food-listing" options={{ href: null }} />
      <Tabs.Screen name="entertainment-listing" options={{ href: null }} />
      <Tabs.Screen name="media-listing" options={{ href: null }} />
      <Tabs.Screen name="design-listing" options={{ href: null }} />
      <Tabs.Screen name="beauty-listing" options={{ href: null }} />
      <Tabs.Screen name="rental-listing" options={{ href: null }} />
      <Tabs.Screen name="experience-listing" options={{ href: null }} />
      <Tabs.Screen name="corporate-listing" options={{ href: null }} />
    </Tabs>
  );
}
