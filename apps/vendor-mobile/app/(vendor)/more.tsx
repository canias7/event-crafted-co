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
import { useT } from "@/lib/i18n";
import { C } from "@/lib/theme";

const PAGE = C.page;
const CARD = C.card;
const SURFACE = C.surface;
const BORDER = C.border;
const INK = C.text;
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = C.textDim;
const GOLD = C.gold;
const GOLD_SOFT = C.pending;
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

const SUPPORT_EMAIL = "hello@eventvendora.com";
const PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.eventvendora.forVendors";
const APP_STORE_URL = "https://apps.apple.com/app/id6767470298";

export default function MoreScreen() {
  const router = useRouter();
  const { t } = useT("more");
  const { user, signOut } = useAuth();
  const dialog = useBrandDialog();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Pro+ vendors (Pro, Premium or unlimited listings, as is_pro_user()):
  // they get the verified badge application, Smart Scheduling and Vendora
  // CRM; Free vendors don't see those rows.
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
      title: t("support.title"),
      message: t("support.message"),
      confirmLabel: t("support.confirm"),
      cancelLabel: t("close"),
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
      title: t("about.title"),
      message: `${t("appName")}${version ? ` · v${version}` : ""}\n\n${t("about.message")}`,
      confirmLabel: t("about.confirm"),
      cancelLabel: t("close"),
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 132 }}
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        <Text
          style={{
            marginTop: 16,
            fontFamily: SERIF_BOLD,
            fontSize: 38,
            letterSpacing: -0.5,
            color: INK,
          }}
        >
          {t("title")}
        </Text>
        <Text style={{ fontFamily: SERIF, marginTop: 4, marginBottom: 24, fontSize: 13, lineHeight: 19, color: INK_DIM }}>
          {t("subtitle")}
        </Text>

        <MenuSection title={t("sections.business")} first>
          <GroupRow
            icon={<Feather name="edit-3" size={18} color={INK} />}
            label={t("rows.editProfile.label")}
            body={t("rows.editProfile.body")}
            onPress={() => router.push("/(vendor)/edit-profile" as never)}
          />
          <GroupRow
            divider
            // Its own icon — it used to share "users" with Vendora CRM.
            icon={<Feather name="user-plus" size={18} color={INK} />}
            label={t("rows.team.label")}
            body={t("rows.team.body")}
            badge={t("badges.optional")}
            onPress={() => router.push("/(vendor)/team" as never)}
          />
          {/* Pro-only rows (Verification, Vendora CRM) show only to vendors
              on Pro or Premium (owner's call, Oct 2026). */}
          {verifyEligible ? (
          <GroupRow
            divider
            icon={<MaterialCommunityIcons name="shield-check-outline" size={19} color={INK} />}
            label={t("rows.verification.label")}
            body={t("rows.verification.body")}
            // The card used to turn gold when the vendor was eligible. A
            // single tinted row inside a shared card reads as a glitch, so
            // the "Eligible" badge carries that signal on its own.
            badge={t("badges.eligible")}
            onPress={() => router.push("/(vendor)/verification" as never)}
          />
          ) : null}
        </MenuSection>

        <MenuSection title={t("sections.tools")}>
          {verifyEligible ? (
          <>
          <GroupRow
            icon={<Feather name="zap" size={18} color={INK} />}
            label={t("rows.scheduling.label")}
            body={t("rows.scheduling.body")}
            badge={t("badges.new")}
            onPress={() => router.push("/(vendor)/scheduling" as never)}
          />
          <GroupRow
            divider
            icon={<Feather name="users" size={18} color={INK} />}
            label={t("rows.crm.label")}
            body={t("rows.crm.body")}
            badge="Pro"
            onPress={() => router.push("/(vendor)/crm" as never)}
          />
          </>
          ) : null}
          <GroupRow
            divider={verifyEligible}
            icon={<Feather name="file-text" size={18} color={INK} />}
            label={t("rows.templates.label")}
            body={t("rows.templates.body")}
            onPress={() => router.push("/(vendor)/templates" as never)}
          />
        </MenuSection>

        <MenuSection title={t("sections.account")}>
          <GroupRow
            icon={<MaterialCommunityIcons name="crown-outline" size={20} color={INK} />}
            label={t("rows.subscription.label")}
            body={t("rows.subscription.body")}
            onPress={() => router.push("/(vendor)/subscription" as never)}
          />
          <GroupRow
            divider
            icon={<Feather name="settings" size={18} color={INK} />}
            label={t("rows.settings.label")}
            body={t("rows.settings.body")}
            onPress={() => setSettingsOpen(true)}
          />
        </MenuSection>

        <MenuSection title={t("sections.vendora")}>
          <GroupRow
            icon={
              <MaterialCommunityIcons name="file-document-edit-outline" size={19} color={INK} />
            }
            label={t("rows.updates.label")}
            body={t("rows.updates.body")}
            // Same as Verification: the badge replaces the gold card tint.
            badge={hasFreshUpdate() ? t("badges.new") : undefined}
            onPress={() => router.push("/(vendor)/updates" as never)}
          />
          <GroupRow
            divider
            icon={<Feather name="help-circle" size={18} color={INK} />}
            label={t("rows.help.label")}
            body={t("rows.help.body")}
            onPress={() => {
              Linking.openURL("https://eventvendora.com/help").catch(() => {});
            }}
          />
          <GroupRow
            divider
            icon={<Feather name="mail" size={18} color={INK} />}
            label={t("rows.contact.label")}
            body={t("rows.contact.body")}
            onPress={openSupport}
          />
          <GroupRow
            divider
            icon={<Feather name="info" size={18} color={INK} />}
            label={t("rows.about.label")}
            body={t("rows.about.body")}
            onPress={openAbout}
          />
        </MenuSection>

        {/* Love Vendora? */}
        <View
          style={[
            cardStyle,
            {
              marginTop: 24,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 16,
            },
          ]}
        >
          <MaterialCommunityIcons name="heart-outline" size={26} color={GOLD} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 16 }}>
              {t("rate.title")}
            </Text>
            <Text style={{ fontFamily: SERIF, marginTop: 2, color: INK_DIM, fontSize: 13 }}>
              {t("rate.body")}
            </Text>
          </View>
          <Pressable
            onPress={rateUs}
            style={{
              marginLeft: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              backgroundColor: C.field,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 999,
              paddingHorizontal: 16,
              height: 36,
            }}
          >
            <Feather name="star" size={13} color={INK} />
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>
              {t("rate.button")}
            </Text>
          </Pressable>
        </View>

        {version ? (
          <Text
            style={{
              fontFamily: SERIF,
              marginTop: 24,
              textAlign: "center",
              color: INK_DIM,
              fontSize: 12,
            }}
          >
            {t("appName")} · v{version}
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
    <View style={{ marginTop: first ? 0 : 24 }}>
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
        // 16 padding + 38 icon + 12 gap = 66, where the text starts;
        // 68 is the nearest value on the 4pt spacing grid.
        <View style={{ height: 1, backgroundColor: BORDER, marginLeft: 68 }} />
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: SURFACE,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
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
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 10, color: C.pendingText }}>
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
