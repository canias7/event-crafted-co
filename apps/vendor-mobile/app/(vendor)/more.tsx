// More tab — overflow menu for everything that isn't one of the four
// main tabs (Inbox · Gallery · Profile · Calendar). Home feed, Studio
// and Dashboard moved here when the tab bar was restructured; Settings
// opens the same account sheet as the Profile tab's ☰ button.

import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useAuth } from "@/lib/auth";
import { SettingsSheet } from "@/components/SettingsSheet";

const INK = "#14161a";
const INK_DIM = "#5e636e";

export default function MoreScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const version = Constants.expoConfig?.version ?? "";

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pb-32 pt-6">
        <Text className="text-4xl font-bold text-foreground">More</Text>
        <Text className="mt-2 mb-7 text-base text-muted-foreground">
          Everything else, one tap away
        </Text>

        <View
          style={{
            backgroundColor: "#f5f5f5",
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          <MenuRow
            icon="grid"
            label="Studio"
            body="AI Superagents, content tools"
            onPress={() => router.push("/(vendor)/studio" as never)}
          />
          <MenuDivider />
          <MenuRow
            icon="bar-chart-2"
            label="Dashboard"
            body="Inquiries, response rate, revenue"
            onPress={() => router.push("/(vendor)/dashboard" as never)}
          />
          <MenuDivider />
          <MenuRow
            icon="edit-3"
            label="Edit brand profile"
            body="Name, logo, bio"
            onPress={() => router.push("/(vendor)/edit-profile" as never)}
          />
        </View>

        <View
          style={{
            marginTop: 16,
            backgroundColor: "#f5f5f5",
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
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
          width: 40,
          height: 40,
          borderRadius: 13,
          backgroundColor: "#e9e9e9",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={18} color={INK} />
      </View>
      <View style={{ flex: 1, marginLeft: 13 }}>
        <Text style={{ color: INK, fontSize: 16, fontWeight: "700" }}>
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

function MenuDivider() {
  return (
    <View style={{ height: 1, backgroundColor: "#e9e9e9", marginLeft: 69 }} />
  );
}
