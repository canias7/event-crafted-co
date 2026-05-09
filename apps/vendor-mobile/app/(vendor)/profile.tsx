// Profile tab — public listing preview + account settings.
//
// Replaces the older /listing tab. Vendors see what their listing looks
// like (read-only quick glance; the full editor lives on web), then a
// section to change their password and sign out.

import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatCents } from "@vendora/core";
import type { VendorProfile } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Password change UI
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

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
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-4 pb-12 pt-4">
        <Text className="mb-1 text-2xl font-semibold text-foreground">
          Profile
        </Text>
        <Text className="mb-6 text-sm text-muted-foreground">
          {loading ? "Loading…" : profile ? "Public listing preview" : "No listing yet"}
        </Text>

        {profile ? (
          <View className="gap-3">
            <Field label="Business name" value={profile.business_name} />
            <Field label="Category" value={profile.category} />
            <Field label="Location" value={profile.location ?? "—"} />
            <Field
              label="Starting price"
              value={formatCents(profile.base_price_cents)}
            />
            <Field
              label="Verification"
              value={profile.verified_at ? "Verified" : "Unverified"}
            />
            <Field
              label="Application status"
              value={profile.application_status ?? "draft"}
            />
            {profile.bio ? (
              <View className="rounded-xl border border-border bg-background p-4">
                <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Bio
                </Text>
                <Text className="text-sm text-foreground">{profile.bio}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text className="mt-8 mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Account
        </Text>

        <View className="gap-2">
          <View className="rounded-xl border border-border bg-background px-4 py-3">
            <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </Text>
            <Text className="mt-1 text-base text-foreground">
              {user?.email ?? "—"}
            </Text>
          </View>

          {pwdOpen ? (
            <View className="rounded-xl border border-border bg-background p-4 gap-3">
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
              className="rounded-xl border border-border bg-background px-4 py-3 active:opacity-70"
            >
              <Text className="text-sm text-foreground">Change password</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => {
            Alert.alert("Sign out", "Are you sure?", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: signOut },
            ]);
          }}
          className="mt-8 rounded-lg border border-border bg-background py-3 active:opacity-70"
        >
          <Text className="text-center text-sm font-medium text-foreground">
            Log out
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
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
