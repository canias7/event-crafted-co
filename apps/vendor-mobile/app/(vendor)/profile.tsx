// Profile tab — Instagram-style layout for vendors.
//
// Top bar: + (left), business handle with chevron (center), ☰ (right).
// Avatar centered with [posts | listings] stats row beneath. Bio under
// stats, then a "Dashboard" CTA, then a 3-segment view switcher (grid /
// reel / listing). The hamburger menu opens a sheet with email, change
// password, and sign-out controls.
//
// Posts/Reels are placeholder empty states for now — content surfaces
// will land in a future pass.

import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import type { VendorProfile } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { BuzzComposer } from "@/components/BuzzComposer";

type ViewKind = "grid" | "reels" | "buzz" | "listing";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewKind>("grid");
  const [menuOpen, setMenuOpen] = useState(false);
  const [buzzOpen, setBuzzOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, bio, base_price_cents, location, verified_at, application_status, application_review_notes, intro_video_url, weekly_digest_enabled, slug, instagram_handle, tiktok_handle",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setProfile(data as VendorProfile | null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // A bare approved profile is just an empty shell — vendor hasn't
  // actually uploaded a listing yet. Count it as a real listing only
  // once they've filled in at least their location and starting price
  // (the minimum needed for a host to find and contact them).
  const listingsCount =
    profile &&
    profile.application_status === "approved" &&
    profile.location &&
    profile.base_price_cents != null
      ? 1
      : 0;

  function openCreatePost() {
    Alert.alert(
      "New post",
      "Add a photo from your library or take one with your camera.",
      [
        { text: "Take photo", onPress: () => pickMedia("camera", "Images") },
        { text: "Choose from library", onPress: () => pickMedia("library", "Images") },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }

  function openCreateReel() {
    Alert.alert(
      "New reel",
      "Record a short video or pick one from your library.",
      [
        { text: "Record video", onPress: () => pickMedia("camera", "Videos") },
        { text: "Choose from library", onPress: () => pickMedia("library", "Videos") },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }

  async function pickMedia(
    src: "camera" | "library",
    kind: "Images" | "Videos",
  ) {
    const mediaTypes =
      kind === "Videos"
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.Images;
    const noun = kind === "Videos" ? "video" : "photo";

    if (src === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera access needed",
          `Enable camera access in Settings to capture a ${noun}.`,
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes,
        quality: 0.85,
        videoMaxDuration: 60,
      });
      if (!result.canceled && result.assets[0]) {
        Alert.alert(
          `Got your ${noun}`,
          "Posting to your grid lands in the next update — we'll save what you captured.",
        );
      }
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Library access needed",
        `Enable photo library access in Settings to pick a ${noun}.`,
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      Alert.alert(
        `Got your ${noun}`,
        "Posting to your grid lands in the next update — we'll save what you picked.",
      );
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Top bar — email centered, no dropdown */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable hitSlop={8} className="active:opacity-60">
          <Feather name="plus" size={28} color="#0a0a0a" />
        </Pressable>
        <Text
          numberOfLines={1}
          className="flex-1 px-3 text-center text-lg font-bold text-foreground"
        >
          {user?.email ?? ""}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={() => setMenuOpen(true)}
          className="active:opacity-60"
        >
          <Feather name="menu" size={28} color="#0a0a0a" />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="pb-32">
        {/* Avatar + stats row, centered */}
        <View className="items-center px-4 pt-2">
          <View className="h-28 w-28 overflow-hidden rounded-full bg-secondary/60">
            <Image
              source={require("../../assets/icon.png")}
              className="h-full w-full"
              resizeMode="cover"
            />
          </View>

          {/* Business name sits directly under the logo. */}
          {profile?.business_name ? (
            <Text className="mt-4 text-lg font-bold text-foreground">
              {profile.business_name}
            </Text>
          ) : null}
          {profile?.bio ? (
            <Text className="mt-2 px-6 text-center text-base text-foreground">
              {profile.bio}
            </Text>
          ) : null}

          {/* Dashboard CTA */}
          <Pressable
            onPress={() => router.push("/(vendor)/dashboard")}
            className="mt-6 rounded-lg border border-border bg-secondary/40 px-6 py-2.5 active:opacity-70"
          >
            <Text className="text-base font-semibold text-foreground">
              Dashboard
            </Text>
          </Pressable>
        </View>

        {/* View switcher — counts live under each icon */}
        <View className="mt-8 flex-row border-t border-border">
          <ViewTab
            active={view === "grid"}
            onPress={() => setView("grid")}
            iconName="grid"
            count={0}
          />
          <ViewTab
            active={view === "reels"}
            onPress={() => setView("reels")}
            iconName="play"
            count={0}
          />
          <ViewTab
            active={view === "buzz"}
            onPress={() => setView("buzz")}
            iconName="align-left"
            count={0}
          />
          <ViewTab
            active={view === "listing"}
            onPress={() => setView("listing")}
            iconName="shopping-bag"
            count={listingsCount}
          />
        </View>

        {/* Content */}
        <View className="mt-12 items-center px-6">
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
              onCta={openCreateReel}
            />
          ) : view === "buzz" ? (
            <EmptyState
              icon="align-left"
              title="No buzz yet"
              body="Post quick updates, behind-the-scenes notes, or news for your followers."
              ctaLabel="Create"
              onCta={() => setBuzzOpen(true)}
            />
          ) : (
            <ListingTab
              loading={loading}
              profile={profile}
              isComplete={listingsCount === 1}
            />
          )}
        </View>
      </ScrollView>

      <SettingsSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        email={user?.email ?? ""}
        onSignOut={signOut}
      />

      <BuzzComposer
        visible={buzzOpen}
        onClose={() => setBuzzOpen(false)}
      />
    </SafeAreaView>
  );
}

function ViewTab({
  active,
  onPress,
  iconName,
  count,
}: {
  active: boolean;
  onPress: () => void;
  iconName: keyof typeof Feather.glyphMap;
  count: number;
}) {
  // Active tab is a lifted card with subtle shadow + border. Inactive
  // tabs are flat (transparent background, no border).
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center justify-center py-3 active:opacity-60"
      style={{
        backgroundColor: active ? "#ffffff" : "transparent",
        borderRadius: active ? 14 : 0,
        borderWidth: active ? 1 : 0,
        borderColor: "#e5e5e5",
        marginHorizontal: active ? 4 : 0,
        marginVertical: active ? 4 : 0,
        ...(active
          ? {
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }
          : null),
      }}
    >
      <Feather name={iconName} size={22} color={active ? "#0a0a0a" : "#737373"} />
      <Text
        className="mt-1 text-sm font-semibold"
        style={{ color: active ? "#0a0a0a" : "#737373" }}
      >
        {count}
      </Text>
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

function ListingTab({
  loading,
  profile,
  isComplete,
}: {
  loading: boolean;
  profile: VendorProfile | null;
  isComplete: boolean;
}) {
  if (loading) {
    return (
      <Text className="text-sm text-muted-foreground">Loading…</Text>
    );
  }
  // No listing OR an empty/incomplete one — show just the Create CTA.
  // Web is the only editor for now.
  if (!profile || !isComplete) {
    return (
      <EmptyState
        icon="shopping-bag"
        title="No listings yet"
        body="Add your location and starting price to publish your listing to the marketplace."
        ctaLabel="Create listing"
        onCta={() =>
          Linking.openURL("https://eventvendora.com/vendor/listing")
        }
      />
    );
  }
  return (
    <View className="w-full gap-3">
      <Field label="Business name" value={profile.business_name} />
      <Field label="Category" value={profile.category} />
      <Field label="Location" value={profile.location ?? "—"} />
      <Field
        label="Verification"
        value={profile.verified_at ? "Verified" : "Unverified"}
      />
      <Field
        label="Application status"
        value={profile.application_status ?? "draft"}
      />
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="rounded-xl border border-border bg-background px-4 py-3">
      <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text className="mt-1 text-base text-foreground">{value}</Text>
    </View>
  );
}

function SettingsSheet({
  open,
  onClose,
  email,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  onSignOut: () => Promise<void>;
}) {
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  async function changePassword() {
    if (newPwd.length < 8) {
      Alert.alert("Password too short", "Must be at least 8 characters.");
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert("Passwords don't match", "Please re-type the new password.");
      return;
    }
    setPwdSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setPwdSubmitting(false);
    if (error) {
      Alert.alert("Couldn't change password", error.message);
      return;
    }
    setNewPwd("");
    setConfirmPwd("");
    setPwdOpen(false);
    Alert.alert("Password updated", "Your new password is active.");
  }

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(10,10,10,0.45)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 32,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: "rgba(10,10,10,0.18)",
              marginBottom: 16,
            }}
          />

          <Text className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Account
          </Text>

          <View className="rounded-xl border border-border bg-background px-4 py-3">
            <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </Text>
            <Text className="mt-1 text-base text-foreground">{email || "—"}</Text>
          </View>

          {pwdOpen ? (
            <View className="mt-2 rounded-xl border border-border bg-background p-4 gap-3">
              <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Change password
              </Text>
              <TextInput
                secureTextEntry
                value={newPwd}
                onChangeText={setNewPwd}
                placeholder="New password (min 8 chars)"
                placeholderTextColor="#a3a3a3"
                className="rounded-lg border border-border px-3 py-2 text-base text-foreground"
              />
              <TextInput
                secureTextEntry
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                placeholder="Confirm new password"
                placeholderTextColor="#a3a3a3"
                className="rounded-lg border border-border px-3 py-2 text-base text-foreground"
              />
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => {
                    setPwdOpen(false);
                    setNewPwd("");
                    setConfirmPwd("");
                  }}
                  disabled={pwdSubmitting}
                  className="flex-1 rounded-lg border border-border py-2.5 active:opacity-70"
                >
                  <Text className="text-center text-sm font-medium text-foreground">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={changePassword}
                  disabled={pwdSubmitting}
                  className="flex-1 rounded-lg bg-foreground py-2.5 active:opacity-70"
                >
                  <Text className="text-center text-sm font-medium text-background">
                    {pwdSubmitting ? "Saving…" : "Save"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setPwdOpen(true)}
              className="mt-2 rounded-xl border border-border bg-background px-4 py-3 active:opacity-70"
            >
              <Text className="text-sm text-foreground">Change password</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => {
              Alert.alert("Sign out", "Are you sure?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign out",
                  style: "destructive",
                  onPress: () => {
                    onClose();
                    onSignOut();
                  },
                },
              ]);
            }}
            className="mt-6 rounded-lg border border-border bg-background py-3 active:opacity-70"
          >
            <Text className="text-center text-sm font-medium text-foreground">
              Log out
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
