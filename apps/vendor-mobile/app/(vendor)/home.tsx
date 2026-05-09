// Home tab — 3-segment content browser (grid · play · listings).
//
// The dashboard stats moved to a hidden /dashboard page reachable from
// the Profile tab's "Dashboard" chip. Home now just shows the vendor's
// public-facing content the way a host would browse it: grid of posts,
// reels, listing details. Empty states placeholder until the upload
// flows ship.

import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Pressable } from "react-native";

type ViewKind = "grid" | "reels" | "buzz" | "listing";

export default function HomeScreen() {
  const [view, setView] = useState<ViewKind>("grid");

  function openCreatePost() {
    Alert.alert(
      "New post",
      "Add a photo from your library or take one with your camera.",
      [
        { text: "Take photo", onPress: () => pickFromCamera() },
        { text: "Choose from library", onPress: () => pickFromLibrary() },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera access needed",
        "Enable camera access in Settings to take a photo.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      Alert.alert(
        "Got your photo",
        "Posting to your grid lands in the next update — we'll save what you captured.",
      );
    }
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo access needed",
        "Enable photo library access in Settings to pick a photo.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      Alert.alert(
        "Got your photo",
        "Posting to your grid lands in the next update — we'll save what you picked.",
      );
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 pt-4">
        <Text className="text-2xl font-semibold text-foreground">Home</Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Your posts, reels, and listings
        </Text>
      </View>

      {/* View switcher */}
      <View className="mt-6 flex-row border-t border-border">
        <ViewTab
          active={view === "grid"}
          onPress={() => setView("grid")}
          iconName="grid"
        />
        <ViewTab
          active={view === "reels"}
          onPress={() => setView("reels")}
          iconName="play"
        />
        <ViewTab
          active={view === "buzz"}
          onPress={() => setView("buzz")}
          iconName="align-left"
        />
        <ViewTab
          active={view === "listing"}
          onPress={() => setView("listing")}
          iconName="shopping-bag"
        />
      </View>

      <ScrollView contentContainerClassName="px-6 pb-32 pt-12 items-center">
        {view === "grid" ? (
          <EmptyState
            icon="grid"
            title="No posts yet"
            body="Share photos from past events to build trust with hosts."
            ctaLabel="Create"
            onCta={openCreatePost}
          />
        ) : view === "reels" ? (
          <EmptyState
            icon="play"
            title="No reels yet"
            body="Short videos help your listing convert. Coming soon."
            ctaLabel="Create"
            onCta={() =>
              Alert.alert("Create reel", "Reels come in a future update.")
            }
          />
        ) : view === "buzz" ? (
          <EmptyState
            icon="align-left"
            title="No buzz yet"
            body="Post quick updates, behind-the-scenes notes, or news for your followers."
            ctaLabel="Create"
            onCta={() =>
              Alert.alert("Buzz", "Buzz posts come in a future update.")
            }
          />
        ) : (
          <EmptyState
            icon="shopping-bag"
            title="No listings yet"
            body="Once your application is approved, your listing will show up here."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ViewTab({
  active,
  onPress,
  iconName,
}: {
  active: boolean;
  onPress: () => void;
  iconName: keyof typeof Feather.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center justify-center py-3 active:opacity-60"
      style={{
        borderBottomWidth: active ? 1.5 : 0,
        borderBottomColor: "#0a0a0a",
      }}
    >
      <Feather name={iconName} size={22} color={active ? "#0a0a0a" : "#737373"} />
    </Pressable>
  );
}

function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <View className="items-center">
      <View className="h-16 w-16 items-center justify-center rounded-full border border-border">
        <Feather name={icon} size={24} color="#737373" />
      </View>
      <Text className="mt-4 text-lg font-semibold text-foreground">{title}</Text>
      <Text className="mt-1 text-center text-base text-muted-foreground">
        {body}
      </Text>
      {ctaLabel && onCta ? (
        <Pressable
          onPress={onCta}
          className="mt-5 rounded-full bg-foreground px-6 py-2.5 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-background">
            {ctaLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
