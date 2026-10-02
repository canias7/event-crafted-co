// More tab — overflow hub. Ten destinations in four labelled groups
// (Your business / Tools / Account / Vendora), then the "Love Vendora?"
// rate-us card. Settings opens the same account sheet as before.
//
// Each destination used to be its own bordered card: eleven boxes, eleven
// icon tiles, and a gap between every one, which is what made the page
// read as crowded. Rows now share a card per group, separated by an inset
// hairline, the way a settings list is usually laid out — and the group
// headings make it scannable rather than one long column of equals.

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
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = "#14161a";
const GOLD = "#c9a86a";
const GOLD_SOFT = "#eadfc6";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

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
        <Text
          style={{
            marginTop: 14,
            fontFamily: SERIF_BOLD,
            fontSize: 38,
            letterSpacing: -0.5,
            color: INK,
          }}
        >
          More
        </Text>
        <Text style={{ fontFamily: SERIF, marginTop: 4, marginBottom: 24, fontSize: 13, lineHeight: 19, color: INK_DIM }}>
          Everything else, one tap away.
        </Text>

        <MenuSection title="YOUR BUSINESS" first>
          <GroupRow
            icon={<Feather name="edit-3" size={18} color={INK} />}
            label="Edit brand profile"
            body="Name, logo, bio, and more"
            onPress={() => router.push("/(vendor)/edit-profile" as never)}
          />
          <GroupRow
            divider
            // Its own icon — it used to share "users" with Vendora CRM.
            icon={<Feather name="user-plus" size={18} color={INK} />}
            label="Meet the Team"
            body="Introduce the people behind your business"
            badge="Optional"
            onPress={() => router.push("/(vendor)/team" as never)}
          />
          <GroupRow
            divider
            icon={<MaterialCommunityIcons name="shield-check-outline" size={19} color={INK} />}
            label="Verification"
            body="Get your verified badge"
            // The card used to turn gold when the vendor was eligible. A
            // single tinted row inside a shared card reads as a glitch, so
            // the "Eligible" badge carries that signal on its own.
            badge={verifyEligible ? "Eligible" : "Pro"}
            onPress={() => router.push("/(vendor)/verification" as never)}
          />
        </MenuSection>

        <MenuSection title="TOOLS">
          <GroupRow
            icon={<Feather name="zap" size={18} color={INK} />}
            label="Smart Scheduling"
            body="Hours, services, and automations"
            badge="New"
            onPress={() => router.push("/(vendor)/scheduling" as never)}
          />
          <GroupRow
            divider
            icon={<Feather name="users" size={18} color={INK} />}
            label="Vendora CRM"
            body="Clients, notes, and follow-ups"
            badge="Pro"
            onPress={() => router.push("/(vendor)/crm" as never)}
          />
        </MenuSection>

        <MenuSection title="ACCOUNT">
          <GroupRow
            icon={<MaterialCommunityIcons name="crown-outline" size={20} color={INK} />}
            label="Subscription"
            body="Plan, billing, and usage"
            onPress={() => router.push("/(vendor)/subscription" as never)}
          />
          <GroupRow
            divider
            icon={<Feather name="settings" size={18} color={INK} />}
            label="Settings"
            body="Account, password, and privacy"
            onPress={() => setSettingsOpen(true)}
          />
        </MenuSection>

        <MenuSection title="VENDORA">
          <GroupRow
            icon={
              <MaterialCommunityIcons name="file-document-edit-outline" size={19} color={INK} />
            }
            label="Upcoming updates"
            body="What's new and what's next"
            // Same as Verification: the badge replaces the gold card tint.
            badge={hasFreshUpdate() ? "New" : undefined}
            onPress={() => router.push("/(vendor)/updates" as never)}
          />
          <GroupRow
            divider
            icon={<Feather name="help-circle" size={18} color={INK} />}
            label="Help & support"
            body="FAQs, guides, and contact us"
            onPress={openSupport}
          />
          <GroupRow
            divider
            icon={<Feather name="info" size={18} color={INK} />}
            label="About Vendora"
            body="App info, terms, and policies"
            onPress={openAbout}
          />
        </MenuSection>

        {/* Love Vendora? */}
        <View
          style={[
            cardStyle,
            {
              marginTop: 22,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 16,
            },
          ]}
        >
          <MaterialCommunityIcons name="heart-outline" size={26} color={GOLD} />
          <View style={{ flex: 1, marginLeft: 13 }}>
            <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 16 }}>
              Love Vendora?
            </Text>
            <Text style={{ fontFamily: SERIF, marginTop: 2, color: INK_DIM, fontSize: 13 }}>
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
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>
              Rate us
            </Text>
          </Pressable>
        </View>

        {version ? (
          <Text
            style={{
              fontFamily: SERIF,
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

// A labelled group of rows sharing one card.
function MenuSection({
  title,
  first,
  children,
}: {
  title: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={{ marginTop: first ? 0 : 22 }}>
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: 10,
          letterSpacing: 1,
          color: INK_DIM,
          marginBottom: 8,
          marginLeft: 4,
        }}
      >
        {title}
      </Text>
      <View style={cardStyle}>{children}</View>
    </View>
  );
}

// One row inside a MenuSection. The hairline above it is inset to line up
// with the text, not the icon. The badge sits right after the title rather
// than in a column on the right, so it no longer squeezes the description
// onto a second line.
function GroupRow({
  icon,
  label,
  body,
  badge,
  onPress,
  divider,
}: {
  icon: ReactNode;
  label: string;
  body: string;
  badge?: string;
  onPress: () => void;
  divider?: boolean;
}) {
  return (
    <Pressable onPress={onPress}>
      {divider ? (
        // 16 padding + 38 icon + 13 gap = where the text starts.
        <View style={{ height: 1, backgroundColor: BORDER, marginLeft: 67 }} />
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 13,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            backgroundColor: SURFACE,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1, marginLeft: 13 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 15, flexShrink: 1 }}
            >
              {label}
            </Text>
            {badge ? (
              <View
                style={{
                  backgroundColor: GOLD_SOFT,
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 10, color: "#8a6f3e" }}>
                  {badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontFamily: SERIF, marginTop: 2, color: INK_DIM, fontSize: 13 }}>
            {body}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={INK_DIM} />
      </View>
    </Pressable>
  );
}
