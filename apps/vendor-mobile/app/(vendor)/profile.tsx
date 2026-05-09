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

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
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
import type { VendorProfile } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type ViewKind = "grid" | "reels" | "buzz" | "listing";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewKind>("grid");
  const [menuOpen, setMenuOpen] = useState(false);

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

  const handle = useMemo(() => {
    if (profile?.slug) return profile.slug;
    if (profile?.business_name) {
      return profile.business_name.toLowerCase().replace(/\s+/g, "");
    }
    if (user?.email) return user.email.split("@")[0];
    return "vendora";
  }, [profile, user]);

  const initials = useMemo(() => {
    const src = profile?.business_name ?? user?.email ?? "V";
    return src
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [profile, user]);

  const listingsCount =
    profile && profile.application_status === "approved" ? 1 : 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Top bar */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable hitSlop={8} className="active:opacity-60">
          <Feather name="plus" size={26} color="#0a0a0a" />
        </Pressable>
        <Pressable hitSlop={8} className="flex-row items-center gap-1 active:opacity-60">
          <Text className="text-base font-semibold text-foreground">
            {handle}
          </Text>
          <Feather name="chevron-down" size={16} color="#0a0a0a" />
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={() => setMenuOpen(true)}
          className="active:opacity-60"
        >
          <Feather name="menu" size={26} color="#0a0a0a" />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="pb-32">
        {/* Avatar + stats row, centered */}
        <View className="items-center px-4 pt-2">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-secondary/60">
            <Text className="text-2xl font-semibold text-foreground">
              {initials}
            </Text>
          </View>

          <View className="mt-5 flex-row items-center gap-10">
            <Stat label="posts" value={0} />
            <Stat label="listings" value={listingsCount} />
          </View>

          {/* Bio */}
          {profile?.business_name ? (
            <Text className="mt-5 text-base font-semibold text-foreground">
              {profile.business_name}
            </Text>
          ) : null}
          {profile?.category ? (
            <Text className="text-sm text-muted-foreground">
              {profile.category}
            </Text>
          ) : null}
          {profile?.bio ? (
            <Text className="mt-2 px-6 text-center text-sm text-foreground">
              {profile.bio}
            </Text>
          ) : null}

          {/* Dashboard CTA */}
          <Pressable
            onPress={() => router.push("/(vendor)/dashboard")}
            className="mt-5 rounded-lg border border-border bg-secondary/40 px-5 py-2 active:opacity-70"
          >
            <Text className="text-sm font-medium text-foreground">
              Dashboard
            </Text>
          </Pressable>
        </View>

        {/* View switcher */}
        <View className="mt-8 flex-row border-t border-border">
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

        {/* Content */}
        <View className="mt-12 items-center px-6">
          {view === "grid" ? (
            <EmptyState
              icon="grid"
              title="No posts yet"
              body="Share photos from past events to build trust with hosts."
            />
          ) : view === "reels" ? (
            <EmptyState
              icon="play"
              title="No reels yet"
              body="Short videos help your listing convert. Coming soon."
            />
          ) : view === "buzz" ? (
            <EmptyState
              icon="align-left"
              title="No buzz yet"
              body="Post quick updates, behind-the-scenes notes, or news for your followers."
            />
          ) : (
            <ListingTab
              loading={loading}
              profile={profile}
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
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View className="items-center">
      <Text className="text-lg font-semibold text-foreground">{value}</Text>
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
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
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View className="items-center">
      <View className="h-14 w-14 items-center justify-center rounded-full border border-border">
        <Feather name={icon} size={20} color="#737373" />
      </View>
      <Text className="mt-3 text-base font-medium text-foreground">{title}</Text>
      <Text className="mt-1 text-center text-sm text-muted-foreground">
        {body}
      </Text>
    </View>
  );
}

function ListingTab({
  loading,
  profile,
}: {
  loading: boolean;
  profile: VendorProfile | null;
}) {
  if (loading) {
    return (
      <Text className="text-sm text-muted-foreground">Loading…</Text>
    );
  }
  if (!profile) {
    return (
      <EmptyState
        icon="shopping-bag"
        title="No listing yet"
        body="Apply to become a Vendora vendor to publish your first listing."
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
