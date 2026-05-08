// Listing tab — read-only summary of the vendor's public profile. Edit
// flows (long-form bio, gallery upload, package pricing) live on web
// for now; native gets quick-glance + status nudges first.

import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatCents } from "@vendora/core";
import type { VendorProfile } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function ListingScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-4 pb-12 pt-4">
        <Text className="mb-1 text-2xl font-semibold text-foreground">
          Your listing
        </Text>
        <Text className="mb-6 text-sm text-muted-foreground">
          {loading ? "Loading…" : profile ? "Public profile preview" : "No listing yet"}
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

        <Pressable
          onPress={signOut}
          className="mt-10 rounded-lg border border-border bg-background py-3 active:opacity-70"
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
