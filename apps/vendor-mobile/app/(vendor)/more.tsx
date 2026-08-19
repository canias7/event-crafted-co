// More tab — overflow menu for everything that isn't one of the four
// main tabs (Inbox · Gallery · Profile · Calendar). Holds Edit brand
// profile and Settings; Settings opens the same account sheet as the
// Profile tab's ☰ button.

import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useAuth } from "@/lib/auth";
import { SettingsSheet } from "@/components/SettingsSheet";
import { Wordmark } from "@/components/Wordmark";

const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const SURFACE = "#ece7db";
const BORDER = "#e6e1d5";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

export default function MoreScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const version = Constants.expoConfig?.version ?? "";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 130 }}
      >
        <Wordmark />
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
          More
        </Text>
        <Text style={{ marginTop: 4, marginBottom: 24, fontSize: 14.5, color: INK_DIM }}>
          Everything else, one tap away.
        </Text>

        <View style={cardStyle}>
          <MenuRow
            icon="edit-3"
            label="Edit brand profile"
            body="Name, logo, bio"
            onPress={() => router.push("/(vendor)/edit-profile" as never)}
          />
        </View>

        <View style={[cardStyle, { marginTop: 14 }]}>
          <MenuRow
            icon="zap"
            label="Subscription"
            body="Plan & billing"
            onPress={() => router.push("/(vendor)/subscription" as never)}
          />
        </View>

        <View style={[cardStyle, { marginTop: 14 }]}>
          <MenuRow
            icon="settings"
            label="Settings"
            body="Account, password, notifications"
            onPress={() => setSettingsOpen(true)}
          />
        </View>

        {version ? (
          <Text
            style={{
              marginTop: 24,
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
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  body: string;
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
          width: 42,
          height: 42,
          borderRadius: 13,
          backgroundColor: SURFACE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={18} color={INK} />
      </View>
      <View style={{ flex: 1, marginLeft: 13 }}>
        <Text style={{ fontFamily: SERIF, color: INK, fontSize: 17, fontWeight: "700" }}>
          {label}
        </Text>
        <Text style={{ marginTop: 2, color: INK_DIM, fontSize: 13 }}>
          {body}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={INK_DIM} />
    </Pressable>
  );
}
