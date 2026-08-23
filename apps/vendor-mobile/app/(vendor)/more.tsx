// More tab — overflow hub, per the cream reference mock: brand rows
// (Edit profile / Subscription / Settings), Upcoming updates with a
// "New" badge, Help & support, About, and the "Love Vendora?" rate-us
// banner. Settings opens the same account sheet as before.

import { useEffect, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { SettingsSheet } from "@/components/SettingsSheet";
import { Wordmark } from "@/components/Wordmark";
import { useBrandDialog } from "@/components/listing/WizardKit";
import { hasFreshUpdate } from "./updates";

const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const SURFACE = "#ece7db";
const BORDER = "#e6e1d5";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const GOLD = "#c9a86a";
const GOLD_SOFT = "#eadfc6";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

const SUPPORT_EMAIL = "hello@eventvendora.com";
const PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.eventvendora.forVendors";
const APP_STORE_URL = "https://apps.apple.com/app/id6767470298";

export default function MoreScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const dialog = useBrandDialog();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Pro+ vendors are eligible to apply for the verified badge.
  const [verifyEligible, setVerifyEligible] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_tier, unlimited_listings")
        .eq("id", user.id)
        .maybeSingle();
      if (!alive) return;
      const p = data as { subscription_tier?: string; unlimited_listings?: boolean } | null;
      const tier = p?.subscription_tier ?? "free";
      setVerifyEligible(tier === "pro" || tier === "studio" || !!p?.unlimited_listings);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const version = Constants.expoConfig?.version ?? "";

  function openSupport() {
    dialog.show({
      icon: "help-circle",
      title: "Help & support",
      message:
        "Questions, issues, or feedback? Email us and a real person will get back to you within one business day.",
      confirmLabel: "Email support",
      cancelLabel: "Close",
      onConfirm: () => {
        Linking.openURL(
          `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Vendora support")}`,
        ).catch(() => {});
      },
    });
  }

  function openAbout() {
    dialog.show({
      icon: "info",
      title: "About Vendora",
      message: `Vendora for Vendors${version ? ` · v${version}` : ""}\n\nThe premium marketplace connecting event vendors with hosts.\n\nTerms of service and privacy policy live at eventvendora.com.`,
      confirmLabel: "View terms & privacy",
      cancelLabel: "Close",
      onConfirm: () => {
        Linking.openURL("https://eventvendora.com/terms").catch(() => {});
      },
    });
  }

  function rateUs() {
    const url = Platform.OS === "ios" ? APP_STORE_URL : PLAY_URL;
    Linking.openURL(url).catch(() => {});
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        {/* Decorative sparkles, echoing the mock's top-right corner. */}
        <View pointerEvents="none" style={{ position: "absolute", top: 44, right: 26 }}>
          <Text style={{ color: GOLD, fontSize: 26, opacity: 0.85 }}>✦</Text>
        </View>
        <View pointerEvents="none" style={{ position: "absolute", top: 24, right: 64 }}>
          <Text style={{ color: GOLD, fontSize: 13, opacity: 0.6 }}>✦</Text>
        </View>
        <View pointerEvents="none" style={{ position: "absolute", top: 92, right: 46 }}>
          <Text style={{ color: GOLD, fontSize: 11, opacity: 0.5 }}>✦</Text>
        </View>

        <Text
          style={{
            marginTop: 14,
            fontFamily: SERIF,
            fontSize: 38,
            fontWeight: "700",
            letterSpacing: -0.5,
            color: INK,
          }}
        >
          More <Text style={{ color: GOLD, fontSize: 20 }}>✦</Text>
        </Text>
        <Text style={{ marginTop: 4, marginBottom: 24, fontSize: 13.5, lineHeight: 19, color: INK_DIM }}>
          Everything else, one tap away.
        </Text>

        <View style={cardStyle}>
          <MenuRow
            icon={<Feather name="edit-3" size={19} color={INK} />}
            label="Edit brand profile"
            body="Name, logo, bio, and more"
            onPress={() => router.push("/(vendor)/edit-profile" as never)}
          />
        </View>

        <View style={[cardStyle, { marginTop: 14 }]}>
          <MenuRow
            icon={<MaterialCommunityIcons name="crown-outline" size={21} color={INK} />}
            label="Subscription"
            body="Plan, billing, and usage"
            onPress={() => router.push("/(vendor)/subscription" as never)}
          />
        </View>

        <View
          style={[
            cardStyle,
            { marginTop: 14 },
            verifyEligible ? { backgroundColor: "#f3ecdd", borderColor: GOLD_SOFT } : null,
          ]}
        >
          <MenuRow
            icon={<MaterialCommunityIcons name="shield-check-outline" size={20} color={INK} />}
            label="Verification"
            body="Get your verified badge"
            badge={verifyEligible ? "Eligible" : "Pro"}
            onPress={() => router.push("/(vendor)/verification" as never)}
          />
        </View>

        <View style={[cardStyle, { marginTop: 14 }]}>
          <MenuRow
            icon={<Feather name="zap" size={19} color={INK} />}
            label="Smart Scheduling"
            body="Working hours, services, and automations"
            badge="New"
            onPress={() => router.push("/(vendor)/scheduling" as never)}
          />
        </View>

        <View style={[cardStyle, { marginTop: 14 }]}>
          <MenuRow
            icon={<Feather name="users" size={19} color={INK} />}
            label="Vendora CRM"
            body="Your clients, notes, and follow-ups"
            badge="Pro"
            onPress={() => router.push("/(vendor)/crm" as never)}
          />
        </View>

        <View style={[cardStyle, { marginTop: 14 }]}>
          <MenuRow
            icon={<Feather name="settings" size={19} color={INK} />}
            label="Settings"
            body="Account, password, notifications, privacy"
            onPress={() => setSettingsOpen(true)}
          />
        </View>

        <View
          style={[
            cardStyle,
            { marginTop: 14 },
            hasFreshUpdate() ? { backgroundColor: "#f3ecdd", borderColor: GOLD_SOFT } : null,
          ]}
        >
          <MenuRow
            icon={
              <MaterialCommunityIcons
                name="file-document-edit-outline"
                size={20}
                color={INK}
              />
            }
            label="Upcoming updates"
            body="See what's new and what's coming next"
            badge={hasFreshUpdate() ? "New" : undefined}
            onPress={() => router.push("/(vendor)/updates" as never)}
          />
        </View>

        <View style={[cardStyle, { marginTop: 14 }]}>
          <MenuRow
            icon={<Feather name="users" size={19} color={INK} />}
            label="Meet the Team"
            body="Introduce the people behind your business"
            badge="Optional"
            onPress={() => router.push("/(vendor)/team" as never)}
          />
        </View>

        <View style={[cardStyle, { marginTop: 14 }]}>
          <MenuRow
            icon={<Feather name="help-circle" size={19} color={INK} />}
            label="Help & support"
            body="FAQs, guides, and contact us"
            onPress={openSupport}
          />
        </View>

        <View style={[cardStyle, { marginTop: 14 }]}>
          <MenuRow
            icon={<Feather name="info" size={19} color={INK} />}
            label="About Vendora"
            body="App info, terms, and policies"
            onPress={openAbout}
          />
        </View>

        {/* Love Vendora? */}
        <View
          style={[
            cardStyle,
            {
              marginTop: 14,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 16,
            },
          ]}
        >
          <MaterialCommunityIcons name="star-four-points-outline" size={26} color={GOLD} />
          <View style={{ flex: 1, marginLeft: 13 }}>
            <Text style={{ fontFamily: SERIF, color: INK, fontSize: 17, fontWeight: "700" }}>
              Love Vendora?
            </Text>
            <Text style={{ marginTop: 2, color: INK_DIM, fontSize: 13 }}>
              Leave us a review and help other vendors.
            </Text>
          </View>
          <Pressable
            onPress={rateUs}
            style={{
              marginLeft: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              borderWidth: 1,
              borderColor: INK,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 9,
            }}
          >
            <Feather name="star" size={13} color={INK} />
            <Text style={{ fontFamily: SERIF, fontSize: 14, fontWeight: "700", color: INK }}>
              Rate us
            </Text>
          </Pressable>
        </View>

        {version ? (
          <Text
            style={{
              marginTop: 22,
              textAlign: "center",
              color: INK_DIM,
              fontSize: 12,
            }}
          >
            Vendora for Vendors · v{version}
          </Text>
        ) : null}
      </ScrollView>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        email={user?.email ?? ""}
        onSignOut={signOut}
      />
      {dialog.element}
    </SafeAreaView>
  );
}

const cardStyle = {
  backgroundColor: CARD,
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 20,
  overflow: "hidden" as const,
};

function MenuRow({
  icon,
  label,
  body,
  badge,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  body: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 16,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 13,
          backgroundColor: SURFACE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, marginLeft: 13 }}>
        <Text style={{ fontFamily: SERIF, color: INK, fontSize: 17, fontWeight: "700" }}>
          {label}
        </Text>
        <Text style={{ marginTop: 2, color: INK_DIM, fontSize: 13 }}>
          {body}
        </Text>
      </View>
      {badge ? (
        <View
          style={{
            marginRight: 8,
            backgroundColor: GOLD_SOFT,
            borderRadius: 999,
            paddingHorizontal: 11,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#8a6f3e" }}>
            {badge}
          </Text>
        </View>
      ) : null}
      <Feather name="chevron-right" size={20} color={INK_DIM} />
    </Pressable>
  );
}
