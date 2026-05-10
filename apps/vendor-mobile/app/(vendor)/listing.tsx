// Native listing builder for vendor-mobile. Mirrors the web wizard's
// About / Pricing / More steps with the core fields:
//   - Listing photos (vendor_portfolio_images)
//   - Category, short bio, location (vendor_profiles)
//   - Starting price (vendor_profiles.base_price_cents)
//
// Save persists to draft. Publish flips application_status to
// 'pending' and fires the listing_submitted email. Mirrors web's
// publish-readiness check (category + bio + location + starting
// price required).
//
// Intentionally does NOT include packages, FAQs, policies, team,
// recommendations — those live on web for now and ship to mobile in
// follow-up. The 80/20 here is the core listing fields that gate
// going live in the marketplace.

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
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
import { CATEGORY_GROUPS } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  PackagesSection,
  FaqsSection,
  PoliciesSection,
  TeamSection,
} from "@/components/listing/Sections";
import { DetailsSection } from "@/components/listing/DetailsSection";

type ProfileRow = {
  id: string;
  business_name: string | null;
  category: string | null;
  bio: string | null;
  location: string | null;
  base_price_cents: number | null;
  application_status: "draft" | "pending" | "approved" | "rejected" | null;
};

type PortfolioRow = {
  id: string;
  storage_path: string;
  display_order: number;
  url: string;
};

const PROFILE_COLS =
  "id, business_name, category, bio, base_price_cents, location, application_status";

export default function ListingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [photos, setPhotos] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  // Form state
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [basePrice, setBasePrice] = useState("");

  const [setupError, setSetupError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setSetupError(null);
    let { data: prof, error: selErr } = await supabase
      .from("vendor_profiles")
      .select(PROFILE_COLS)
      .eq("user_id", user.id)
      .maybeSingle();
    if (selErr) {
      setSetupError(`Couldn't load your profile: ${selErr.message}`);
    }
    // No row yet → auto-create a stub draft so the editor doesn't
    // block on a "still being set up" message. Mirrors the web's
    // first-time signup flow that inserts a draft row when the
    // vendor lands on /vendor/listing.
    if (!prof) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: created, error: insErr } = await (supabase as any)
        .from("vendor_profiles")
        .insert({ user_id: user.id, application_status: "draft" })
        .select(PROFILE_COLS)
        .single();
      if (insErr) {
        setSetupError(`Couldn't set up your profile: ${insErr.message}`);
      }
      prof = created;
    }
    const row = (prof as ProfileRow | null) ?? null;
    setProfile(row);
    if (row) {
      setBusinessName(row.business_name ?? "");
      setCategory(row.category ?? "");
      setBio(row.bio ?? "");
      setLocation(row.location ?? "");
      setBasePrice(
        row.base_price_cents != null
          ? (row.base_price_cents / 100).toString()
          : "",
      );
      const { data: imgs } = await supabase
        .from("vendor_portfolio_images")
        .select("id, storage_path, display_order")
        .eq("vendor_id", row.id)
        .order("display_order", { ascending: true });
      const enriched = ((imgs ?? []) as Omit<PortfolioRow, "url">[]).map(
        (i) => ({
          ...i,
          url: supabase.storage.from("vendor-portfolios").getPublicUrl(
            i.storage_path,
          ).data.publicUrl,
        }),
      );
      setPhotos(enriched);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function pickAndUploadPhoto() {
    if (!profile?.id || !user?.id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Library access needed",
        "Enable photo library access in Settings to upload listing photos.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhotoUploading(true);
    try {
      const ext = (asset.uri.split(".").pop() ?? "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const arrayBuffer = await (await fetch(asset.uri)).arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      if (bytes.byteLength === 0) {
        throw new Error("Couldn't read the picked photo. Try a different image.");
      }
      const up = await supabase.storage
        .from("vendor-portfolios")
        .upload(path, bytes, {
          contentType: asset.mimeType ?? "image/jpeg",
          upsert: false,
        });
      if (up.error) throw up.error;

      const nextOrder =
        photos.length === 0
          ? 0
          : Math.max(...photos.map((p) => p.display_order)) + 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ins, error } = await (supabase as any)
        .from("vendor_portfolio_images")
        .insert({
          vendor_id: profile.id,
          storage_path: path,
          display_order: nextOrder,
        })
        .select("id, storage_path, display_order")
        .single();
      if (error) throw error;
      const url = supabase.storage
        .from("vendor-portfolios")
        .getPublicUrl(path).data.publicUrl;
      setPhotos((curr) => [...curr, { ...(ins as PortfolioRow), url }]);
    } catch (err) {
      Alert.alert(
        "Couldn't upload photo",
        (err as { message?: string })?.message ?? "Try again in a moment.",
      );
    } finally {
      setPhotoUploading(false);
    }
  }

  async function deletePhoto(p: PortfolioRow) {
    if (!profile?.id) return;
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert("Delete photo?", "This removes it from your listing.", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Delete", style: "destructive", onPress: () => resolve(true) },
      ]);
    });
    if (!ok) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_portfolio_images")
      .delete()
      .eq("id", p.id);
    if (error) {
      Alert.alert("Couldn't delete", error.message);
      return;
    }
    await supabase.storage.from("vendor-portfolios").remove([p.storage_path]);
    setPhotos((curr) => curr.filter((x) => x.id !== p.id));
  }

  function buildPayload(): Record<string, unknown> {
    return {
      business_name: businessName.trim() || null,
      category: category || null,
      bio: bio.trim() || null,
      location: location.trim() || null,
      base_price_cents: basePrice
        ? Math.round(Number.parseFloat(basePrice) * 100)
        : null,
    };
  }

  async function save({ publish }: { publish: boolean }) {
    if (!profile?.id) return;
    if (publish) {
      const missing: string[] = [];
      if (!businessName.trim()) missing.push("Business name");
      if (!category) missing.push("Category");
      if (!bio.trim()) missing.push("Short bio");
      if (!location.trim()) missing.push("Location");
      if (!basePrice.trim() || Number.parseFloat(basePrice) <= 0)
        missing.push("Starting price");
      if (missing.length > 0) {
        Alert.alert(
          "Can't publish yet",
          `Add the following first:\n\n${missing.map((m) => `• ${m}`).join("\n")}`,
        );
        return;
      }
    }
    setBusy(true);
    const payload = {
      ...buildPayload(),
      ...(publish ? { application_status: "pending" as const } : {}),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update(payload)
      .eq("id", profile.id);
    if (error) {
      setBusy(false);
      Alert.alert("Save failed", error.message);
      return;
    }
    if (publish) {
      // Fire-and-forget — UI already shows the submitted state.
      supabase.functions
        .invoke("send-transactional-email", {
          body: { kind: "listing_submitted", vendorProfileId: profile.id },
        })
        .catch(() => {});
    }
    setProfile((p) =>
      p
        ? {
            ...p,
            ...(payload as Partial<ProfileRow>),
          }
        : p,
    );
    setBusy(false);
    Alert.alert(publish ? "Submitted for review" : "Saved");
  }

  const status = profile?.application_status;
  const submitted = status === "pending" || status === "approved";

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-base text-muted-foreground">Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <Text className="text-base text-foreground text-center">
            {setupError
              ? setupError
              : "Couldn't open the listing editor."}
          </Text>
          <Pressable
            onPress={loadAll}
            className="rounded-full bg-foreground px-6 py-3 active:opacity-80"
          >
            <Text className="text-sm font-semibold text-background">
              Try again
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Top bar */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="active:opacity-60"
        >
          <Feather name="chevron-left" size={26} color="#0a0a0a" />
        </Pressable>
        <Text className="text-base font-bold text-foreground">Listing</Text>
        <View className="w-7" />
      </View>

      <ScrollView contentContainerClassName="pb-32">
        {/* Status banner */}
        {status === "pending" ? (
          <View className="mx-4 mt-4 rounded-lg border border-accent/30 bg-accent/5 p-4">
            <Text className="text-sm font-semibold text-foreground">
              Submitted for review
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              We hand-review every listing within 2–3 business days. You'll
              get an email when it's live.
            </Text>
          </View>
        ) : status === "approved" ? (
          <View className="mx-4 mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <Text className="text-sm font-semibold text-foreground">
              Live in the directory
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              Edits save instantly to your live listing.
            </Text>
          </View>
        ) : null}

        {/* Photos */}
        <View className="px-4 pt-6">
          <Text className="text-base font-semibold text-foreground">
            Listing photos
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            Upload 3–5 photos that show your range. The first one becomes
            your marketplace cover.
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {photos.map((p) => (
              <Pressable
                key={p.id}
                onLongPress={() => deletePhoto(p)}
                className="active:opacity-80"
                style={{ width: "31%", aspectRatio: 1 }}
              >
                <Image
                  source={{ uri: p.url }}
                  style={{ flex: 1, borderRadius: 10 }}
                  resizeMode="cover"
                />
              </Pressable>
            ))}
            <Pressable
              onPress={pickAndUploadPhoto}
              disabled={photoUploading}
              className="items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30 active:opacity-70"
              style={{ width: "31%", aspectRatio: 1 }}
            >
              {photoUploading ? (
                <Text className="text-xs text-muted-foreground">
                  Uploading…
                </Text>
              ) : (
                <>
                  <Feather name="plus" size={24} color="#737373" />
                  <Text className="mt-1 text-xs text-muted-foreground">
                    Add
                  </Text>
                </>
              )}
            </Pressable>
          </View>
          {photos.length > 0 ? (
            <Text className="mt-2 text-[11px] text-muted-foreground">
              Long-press a photo to delete.
            </Text>
          ) : null}
        </View>

        {/* Business name */}
        <View className="px-4 pt-6">
          <RequiredLabel>Business name</RequiredLabel>
          <TextInput
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="e.g. Last Call Bar Co."
            className="mt-2 rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
          />
        </View>

        {/* Category */}
        <View className="px-4 pt-6">
          <RequiredLabel>Category</RequiredLabel>
          <Pressable
            onPress={() => setCategoryPickerOpen(true)}
            className="mt-2 rounded-lg border border-border bg-background px-4 py-3 flex-row items-center justify-between active:opacity-80"
          >
            <Text
              className={`text-base ${category ? "text-foreground" : "text-muted-foreground"}`}
            >
              {category || "Pick a category"}
            </Text>
            <Feather name="chevron-down" size={18} color="#737373" />
          </Pressable>
        </View>

        {/* Short bio */}
        <View className="px-4 pt-6">
          <RequiredLabel>Short bio</RequiredLabel>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="One or two sentences on what makes your business unique."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="mt-2 min-h-[100px] rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
          />
        </View>

        {/* Location */}
        <View className="px-4 pt-6">
          <RequiredLabel>Location</RequiredLabel>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="City, State"
            className="mt-2 rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
          />
        </View>

        {/* Starting price */}
        <View className="px-4 pt-6">
          <RequiredLabel>Starting price ($)</RequiredLabel>
          <TextInput
            value={basePrice}
            onChangeText={setBasePrice}
            placeholder="0"
            keyboardType="decimal-pad"
            className="mt-2 rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
          />
        </View>

        <View className="px-4 pt-8">
          <View className="h-px bg-border" />
        </View>
        <View className="px-4 pt-6">
          {profile?.id ? (
            <DetailsSection vendorId={profile.id} category={category} />
          ) : null}
        </View>

        <View className="px-4 pt-8">
          <View className="h-px bg-border" />
        </View>
        <View className="px-4 pt-6">
          {profile?.id ? (
            <PackagesSection vendorId={profile.id} />
          ) : (
            <Text className="text-xs text-muted-foreground">
              Save the listing once to enable packages.
            </Text>
          )}
        </View>

        <View className="px-4 pt-8">
          <View className="h-px bg-border" />
        </View>
        <View className="px-4 pt-6">
          {profile?.id ? <FaqsSection vendorId={profile.id} /> : null}
        </View>

        <View className="px-4 pt-8">
          <View className="h-px bg-border" />
        </View>
        <View className="px-4 pt-6">
          {profile?.id ? <PoliciesSection vendorId={profile.id} /> : null}
        </View>

        <View className="px-4 pt-8">
          <View className="h-px bg-border" />
        </View>
        <View className="px-4 pt-6 pb-4">
          {profile?.id ? <TeamSection vendorId={profile.id} /> : null}
        </View>
      </ScrollView>

      {/* Action bar — labels follow application_status so an
          approved listing isn't accidentally bumped back into review.
            draft / rejected → Save changes + Publish (or Re-submit)
            pending          → single primary "Save changes"
            approved         → single primary "Save changes" (live) */}
      <View className="absolute left-0 right-0 bottom-0 border-t border-border bg-background px-4 pb-6 pt-3 flex-row gap-2">
        {status === "pending" || status === "approved" ? (
          <Pressable
            onPress={() => save({ publish: false })}
            disabled={busy}
            className="flex-1 rounded-full bg-foreground py-3 items-center active:opacity-80"
          >
            <Text className="text-sm font-semibold text-background">
              {busy
                ? "Saving…"
                : status === "approved"
                  ? "Save changes"
                  : "Save changes"}
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={() => save({ publish: false })}
              disabled={busy}
              className="flex-1 rounded-full border border-border bg-background py-3 items-center active:opacity-80"
            >
              <Text className="text-sm font-semibold text-foreground">
                {busy ? "Saving…" : "Save changes"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => save({ publish: true })}
              disabled={busy}
              className="flex-1 rounded-full bg-foreground py-3 items-center active:opacity-80"
            >
              <Text className="text-sm font-semibold text-background">
                {busy
                  ? "Publishing…"
                  : status === "rejected"
                    ? "Re-submit"
                    : "Publish"}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Category picker modal */}
      <Modal
        visible={categoryPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCategoryPickerOpen(false)}
      >
        <SafeAreaView
          className="flex-1 bg-background"
          edges={["top", "bottom"]}
        >
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
            <Pressable
              onPress={() => setCategoryPickerOpen(false)}
              hitSlop={8}
              className="active:opacity-60"
            >
              <Text className="text-base text-muted-foreground">Cancel</Text>
            </Pressable>
            <Text className="text-base font-bold text-foreground">
              Pick a category
            </Text>
            <View className="w-12" />
          </View>
          <ScrollView contentContainerClassName="pb-12">
            {CATEGORY_GROUPS.map((group) => (
              <View key={group.slug}>
                <Text className="px-4 pt-5 pb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {group.name}
                </Text>
                {group.subs.map((sub) => {
                  const active = category === sub;
                  return (
                    <Pressable
                      key={sub}
                      onPress={() => {
                        setCategory(sub);
                        setCategoryPickerOpen(false);
                      }}
                      className={`px-4 py-3 active:opacity-70 ${
                        active ? "bg-secondary" : ""
                      }`}
                    >
                      <Text
                        className={`text-base ${
                          active
                            ? "font-semibold text-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {sub}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-base font-semibold text-foreground">
        {children}
      </Text>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: "#dc2626",
        }}
      />
    </View>
  );
}
