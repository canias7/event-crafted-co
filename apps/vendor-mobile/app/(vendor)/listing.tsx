// Native listing builder for vendor-mobile. Per-listing fields only:
//   - Listing photos (vendor_portfolio_images)
//   - Category, location (vendor_profiles)
//   - Starting price (vendor_profiles.base_price_cents)
//   - Details / FAQs / Team (per-listing children)
//
// Business name + bio live on the vendor's identity profile and are
// mirrored onto every listing by tg_profiles_sync_solo_listing — we
// don't ask for them here.
//
// Save persists to draft. Publish flips application_status to
// 'pending' and fires the listing_submitted email. Publish-readiness
// check: category + location + starting price.

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  CATEGORY_GROUPS,
  PRICING_MODELS,
  PRICING_MODEL_LABELS,
} from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { compressForUpload } from "@/lib/imageManipulation";
import { FaqsSection } from "@/components/listing/Sections";
import { DetailsSection } from "@/components/listing/DetailsSection";

// Editorial palette — kept in lockstep with edit-profile.tsx and the
// vendor profile screen so the listing builder doesn't feel like a
// different app section.
const CREAM = "#ffffff";
const CREAM_DEEP = "#f3f4f6";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const BORDER = "#e5e7eb";
const ACCENT = "#1B3654";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

// Minimum photos required to publish a listing. Mirrors the web wizard
// and the enforce_listing_min_photos DB trigger — a listing can't go to
// review (or be approved) with fewer than this.
const MIN_PHOTOS = 3;
// Category groups with their own category-specific builder. Categories
// in these groups leave this generic form for their wizard; remaining
// groups follow one by one.
const WIZARD_ROUTES: Record<string, string> = {
  venues: "venue-listing",
  "food-beverage": "food-listing",
  entertainment: "entertainment-listing",
};

// The wizard route for a category (subcategory name), or null when the
// category's group still uses this generic form.
function wizardRouteFor(category: string | null | undefined): string | null {
  if (!category) return null;
  const group = CATEGORY_GROUPS.find((g) => g.subs.includes(category));
  return group ? (WIZARD_ROUTES[group.slug] ?? null) : null;
}

// Per-listing photo cap matches web (ListingWizardModal MAX_PHOTOS).
// Bumped from the original 5 once the public detail page learned how
// to overflow into the "All photos" modal — vendors with portfolios
// shouldn't have to pick their best 5 anymore.
const MAX_PHOTOS = 100;
// Parallel-upload concurrency cap. expo-image-picker hands us all
// assets at once; we run 5 uploads in parallel so a 100-photo pick
// finishes in ~10s instead of several minutes of one-at-a-time
// .upload() round trips. Keep in sync with apps/web's
// listingPhotoUpload.ts UPLOAD_CONCURRENCY.
const UPLOAD_CONCURRENCY = 5;

type ProfileRow = {
  id: string;
  category: string | null;
  location: string | null;
  base_price_cents: number | null;
  pricing_models: string[] | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  custom_pricing: boolean | null;
  application_status: "draft" | "pending" | "approved" | "rejected" | null;
};

type PortfolioRow = {
  id: string;
  storage_path: string;
  display_order: number;
  url: string;
};

const PROFILE_COLS =
  "id, category, base_price_cents, pricing_models, price_min_cents, price_max_cents, custom_pricing, location, application_status";

export default function ListingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  // When we navigate here from the profile pencil (edit one specific
  // listing) or the CreateSheet "+ Listing" flow, we pass the
  // vendor_profiles.id explicitly. Without an id we fall back to the
  // legacy "first listing for this user, auto-create if none" path,
  // which keeps the onboarding flow intact for vendors who don't have
  // a listing yet.
  const { id: routeId } = useLocalSearchParams<{ id?: string }>();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [photos, setPhotos] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  // Form state
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [pricingModels, setPricingModels] = useState<string[]>([]);
  const [customPricing, setCustomPricing] = useState(false);

  const [setupError, setSetupError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setSetupError(null);

    let prof: ProfileRow | null = null;

    if (routeId) {
      // Edit a specific listing.
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select(PROFILE_COLS)
        .eq("id", routeId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) setSetupError(`Couldn't load this listing: ${error.message}`);
      prof = (data as ProfileRow | null) ?? null;
    } else {
      // Legacy/onboarding path — pick this user's first listing, or
      // auto-create a draft so the editor doesn't block on a "still
      // being set up" message.
      const { data: rows, error: selErr } = await supabase
        .from("vendor_profiles")
        .select(PROFILE_COLS)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (selErr) {
        setSetupError(`Couldn't load your profile: ${selErr.message}`);
      }
      prof = ((rows ?? []) as ProfileRow[])[0] ?? null;
      if (!prof) {
        // Seed business_name from the signup profile — the slug
        // trigger derives the public slug from it at INSERT, so an
        // empty name mints a generic "vendor-N" slug forever.
        const { data: bn } = await supabase
          .from("profiles")
          .select("business_name")
          .eq("id", user.id)
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: created, error: insErr } = await (supabase as any)
          .from("vendor_profiles")
          .insert({
            user_id: user.id,
            application_status: "draft",
            business_name: bn?.business_name ?? null,
          })
          .select(PROFILE_COLS)
          .single();
        if (insErr) {
          setSetupError(`Couldn't set up your profile: ${insErr.message}`);
        }
        prof = (created as ProfileRow | null) ?? null;
      }
    }

    const row = prof;
    // Groups with their own wizard leave this generic form.
    const wizard = wizardRouteFor(row?.category);
    if (row && wizard) {
      router.replace(`/(vendor)/${wizard}?id=${row.id}` as never);
      return;
    }
    setProfile(row);
    if (row) {
      setCategory(row.category ?? "");
      setLocation(row.location ?? "");
      setPriceMin(
        row.price_min_cents != null
          ? (row.price_min_cents / 100).toString()
          : "",
      );
      setPriceMax(
        row.price_max_cents != null
          ? (row.price_max_cents / 100).toString()
          : "",
      );
      setPricingModels(row.pricing_models ?? []);
      setCustomPricing(row.custom_pricing ?? false);
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
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      Alert.alert(
        "Photo limit reached",
        `Listings cap at ${MAX_PHOTOS} photos. Delete a photo to add a new one.`,
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      // Match web's multi-pick behavior. selectionLimit caps to the
      // remaining slots so the user can't pick 50 photos then be
      // told 30 of them were rejected.
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (result.canceled || result.assets.length === 0) return;

    // Reject HEIC/HEIF assets up-front. iPhone photos default to
    // .HEIC and the "Most Compatible" toggle in iOS Camera settings
    // is off by default. Supabase storage accepts the upload but
    // most browsers can't render HEIC, so the photo would land on
    // the public listing as a broken image. Web modal does the
    // same thing in validateListingPhotos.
    const heicCount = result.assets.filter((a) => {
      const mime = (a.mimeType ?? "").toLowerCase();
      const uri = (a.uri ?? "").toLowerCase();
      return (
        mime === "image/heic" ||
        mime === "image/heif" ||
        uri.endsWith(".heic") ||
        uri.endsWith(".heif")
      );
    }).length;
    const assets = result.assets.filter((a) => {
      const mime = (a.mimeType ?? "").toLowerCase();
      const uri = (a.uri ?? "").toLowerCase();
      return !(
        mime === "image/heic" ||
        mime === "image/heif" ||
        uri.endsWith(".heic") ||
        uri.endsWith(".heif")
      );
    });
    if (heicCount > 0) {
      Alert.alert(
        "Some photos were skipped",
        `${heicCount} HEIC photo${heicCount === 1 ? "" : "s"} skipped. Open the Photos app → Settings → Camera → Formats → Most Compatible to upload as JPEG instead.`,
      );
    }
    if (assets.length === 0) return;
    setPhotoUploading(true);
    setUploadProgress({ done: 0, total: assets.length });

    // Compute display_order base from CURRENT state, then assign
    // each asset baseOrder + index so a parallel insert preserves
    // pick order regardless of which upload finishes first.
    const baseOrder =
      photos.length === 0
        ? 0
        : Math.max(...photos.map((p) => p.display_order)) + 1;

    // Per-asset upload result; pre-allocated so worker writes by
    // index and we keep pick order in the final insert.
    const uploaded: Array<
      { vendor_id: string; storage_path: string; display_order: number } | null
    > = new Array(assets.length).fill(null);
    let cursor = 0;
    let doneCount = 0;
    let firstError: { message?: string } | null = null;

    async function worker() {
      while (true) {
        const myIdx = cursor++;
        if (myIdx >= assets.length) return;
        const asset = assets[myIdx];
        try {
          // Downscale to 2400px / JPEG 0.85 before upload — same as web
          // (lib/imageManipulation). Output is always JPEG, so the path
          // ext is .jpg.
          const { uri: upUri, mime } = await compressForUpload(asset);
          // Date.now() + baseOrder + myIdx keeps paths unique even
          // when workers fire within the same millisecond.
          const path = `${profile!.id}/${Date.now()}-${baseOrder + myIdx}-${myIdx}.jpg`;
          const arrayBuffer = await (await fetch(upUri)).arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          if (bytes.byteLength === 0) {
            throw new Error("Empty file");
          }
          const up = await supabase.storage
            .from("vendor-portfolios")
            .upload(path, bytes, {
              contentType: mime,
              upsert: false,
            });
          if (up.error) throw up.error;
          uploaded[myIdx] = {
            vendor_id: profile!.id,
            storage_path: path,
            display_order: baseOrder + myIdx,
          };
        } catch (err) {
          // Don't bail the whole batch on a single bad asset — keep
          // the others moving and report the partial at the end.
          if (!firstError) {
            firstError = (err as { message?: string }) ?? { message: "upload failed" };
          }
          // eslint-disable-next-line no-console
          console.warn("[listing] photo upload failed", myIdx, err);
        } finally {
          doneCount++;
          setUploadProgress({ done: doneCount, total: assets.length });
        }
      }
    }

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(UPLOAD_CONCURRENCY, assets.length) },
          () => worker(),
        ),
      );
      const successful = uploaded.filter(
        (r): r is { vendor_id: string; storage_path: string; display_order: number } =>
          r !== null,
      );
      if (successful.length === 0) {
        throw firstError ?? new Error("Upload failed");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ins, error } = await (supabase as any)
        .from("vendor_portfolio_images")
        .insert(successful)
        .select("id, storage_path, display_order");
      if (error) throw error;
      const enriched = ((ins ?? []) as Omit<PortfolioRow, "url">[]).map((r) => ({
        ...r,
        url: supabase.storage
          .from("vendor-portfolios")
          .getPublicUrl(r.storage_path).data.publicUrl,
      }));
      setPhotos((curr) =>
        [...curr, ...enriched].sort((a, b) => a.display_order - b.display_order),
      );
      if (successful.length < assets.length) {
        Alert.alert(
          "Partial upload",
          `${successful.length} of ${assets.length} photos uploaded. Try again for the rest.`,
        );
      }
    } catch (err) {
      Alert.alert(
        "Couldn't upload photos",
        (err as { message?: string })?.message ?? "Try again in a moment.",
      );
    } finally {
      setPhotoUploading(false);
      setUploadProgress(null);
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

  // Promote a photo to position 0 ("Make cover"). Persists by
  // UPDATE-ing display_order on the picked photo to one less than
  // the current minimum, then re-fetching the ordered list. We
  // don't try to compact display_orders to 0..N-1 — the public
  // detail page sorts by display_order and only cares about
  // relative ordering, so leaving gaps is fine.
  async function makeCover(target: PortfolioRow) {
    if (!profile?.id) return;
    if (photos.length === 0) return;
    const minOrder = Math.min(...photos.map((p) => p.display_order));
    const newOrder = minOrder - 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_portfolio_images")
      .update({ display_order: newOrder })
      .eq("id", target.id);
    if (error) {
      Alert.alert("Couldn't update cover", error.message);
      return;
    }
    setPhotos((curr) =>
      curr
        .map((p) => (p.id === target.id ? { ...p, display_order: newOrder } : p))
        .sort((a, b) => a.display_order - b.display_order),
    );
  }

  // Long-press now opens an action sheet instead of jumping
  // straight to delete. Vendors finally have a way to swap the
  // cover photo without deleting + re-uploading.
  function photoMenu(p: PortfolioRow) {
    const isCover = photos[0]?.id === p.id;
    const options: Array<{
      text: string;
      style?: "default" | "cancel" | "destructive";
      onPress?: () => void;
    }> = [{ text: "Cancel", style: "cancel" }];
    if (!isCover) {
      options.unshift({
        text: "Make cover",
        onPress: () => {
          void makeCover(p);
        },
      });
    }
    options.push({
      text: "Delete",
      style: "destructive",
      onPress: () => {
        void deletePhoto(p);
      },
    });
    Alert.alert("Photo options", undefined, options);
  }

  function buildPayload(): Record<string, unknown> {
    const minCents = priceMin
      ? Math.round(Number.parseFloat(priceMin) * 100)
      : null;
    const maxCents = priceMax
      ? Math.round(Number.parseFloat(priceMax) * 100)
      : null;
    return {
      category: category || null,
      location: location.trim() || null,
      pricing_models: pricingModels,
      price_min_cents: minCents,
      price_max_cents: maxCents,
      custom_pricing: customPricing,
      // Keep base_price_cents synced to the minimum for back-compat.
      base_price_cents: minCents,
    };
  }

  async function save({
    publish,
    toDraft = false,
    requireComplete = false,
    navigateAfter = false,
  }: {
    publish: boolean;
    /** Withdraw the listing to draft (out of the review queue). */
    toDraft?: boolean;
    requireComplete?: boolean;
    navigateAfter?: boolean;
  }) {
    if (!profile?.id) return;
    // Publishing requires a complete listing — category, at least
    // MIN_PHOTOS photos, location, and a starting price. This runs on
    // every "Publish" tap (new, draft, pending, or approved) so a vendor
    // can never push an incomplete listing into review by skipping the
    // category picker or photo upload.
    if (requireComplete) {
      const missing: string[] = [];
      if (!category) missing.push("Category");
      if (photos.length < MIN_PHOTOS)
        missing.push(`At least ${MIN_PHOTOS} photos`);
      if (!location.trim()) missing.push("Location");
      if (pricingModels.length === 0) missing.push("A pricing model");
      // A minimum price is required unless pricing is marked custom.
      if (
        !customPricing &&
        (!priceMin.trim() || Number.parseFloat(priceMin) <= 0)
      )
        missing.push("A minimum price (or turn on Custom pricing)");
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
      ...(publish
        ? { application_status: "pending" as const }
        : toDraft
          ? { application_status: "draft" as const }
          : {}),
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
      // Log on failure so the operator would notice if the vendor
      // never gets the "thanks, we got it" email.
      supabase.functions
        .invoke("send-transactional-email", {
          body: { kind: "listing_submitted", vendorProfileId: profile.id },
        })
        .then(({ error: emailErr }) => {
          if (emailErr) {
            // eslint-disable-next-line no-console
            console.warn(
              "[listing] listing_submitted email failed",
              emailErr.message,
            );
          }
        })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.warn("[listing] listing_submitted email threw", e);
        });
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
    // After a Publish, leave the builder and return to the profile so
    // the vendor isn't stranded on the listing page. Draft saves stay
    // put so the vendor can keep editing.
    if (navigateAfter) {
      Alert.alert(
        publish
          ? "Submitted for review"
          : toDraft
            ? "Saved as draft"
            : "Changes saved",
        publish
          ? "We'll review your listing within 2–3 business days."
          : toDraft
            ? "Your listing is out of review until you publish it again."
            : undefined,
        [{ text: "OK", onPress: () => router.back() }],
      );
      return;
    }
    Alert.alert(publish ? "Submitted for review" : "Saved");
  }

  const status = profile?.application_status;

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

  const heading =
    status === "approved"
      ? "Edit listing"
      : status === "pending"
        ? "Under review"
        : "New listing";

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Top bar — close X · "vendora-listing" handle · more */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 6,
          }}
        >
          <CircleButton onPress={() => router.back()} icon="x" />
          <Text
            style={{
              fontFamily: SERIF,
              fontSize: 18,
              fontWeight: "600",
              color: INK,
            }}
          >
            vendora-listing
          </Text>
          {/* Spacer keeps the title centered (the dead "more" menu was removed). */}
          <View style={{ width: 36 }} />
        </View>

        {/* Sub header — back · italic title · "X of N" */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 18,
          }}
        >
          <CircleButton onPress={() => router.back()} icon="chevron-left" />
          <Text
            style={{
              fontFamily: SERIF,
              fontSize: 24,
              fontStyle: "italic",
              fontWeight: "500",
              color: INK,
            }}
          >
            {heading}
          </Text>
          {/* Spacer balances the back chevron so the title stays centered. */}
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Status banner */}
          {status === "pending" ? (
            <BannerCard
              tone="accent"
              title="Submitted for review"
              body="We hand-review every listing within 2–3 business days. You'll get an email when it's live."
            />
          ) : status === "approved" ? (
            <BannerCard
              tone="good"
              title="Live in the directory"
              body="Edits save instantly to your live listing."
            />
          ) : null}

          {/* STEP 1 · IDENTITY */}
          <StepHeader
            step="STEP 1 · IDENTITY"
            title="Introduce yourself."
            body="Photos and a few sentences are usually enough to make a host stop scrolling."
          />

          {/* Listing photos */}
          <SectionBlock
            title="Listing photos"
            subtitle={`3–${MAX_PHOTOS} photos. Your first becomes the cover.`}
            footnote={
              uploadProgress
                ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
                : "Bright, recent photos work best. Drag to reorder once uploaded."
            }
          >
            <PhotoGrid
              photos={photos}
              onAdd={pickAndUploadPhoto}
              uploading={photoUploading}
              onLongPress={photoMenu}
            />
            {/* Overflow grid for photos beyond the hero 5. Without
                this the vendor literally couldn't see (let alone
                manage) photos 6..N after MAX_PHOTOS was bumped from
                5 to 100. Tap-and-hold any tile to open the same
                action menu (Make cover / Delete). */}
            {photos.length > 5 ? (
              <View style={{ marginTop: 12 }}>
                <Text
                  style={{
                    fontFamily: SERIF,
                    fontSize: 13,
                    color: INK_DIM,
                    marginBottom: 8,
                  }}
                >
                  +{photos.length - 5} more
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {photos.slice(5).map((p) => (
                    <Pressable
                      key={p.id}
                      onLongPress={() => photoMenu(p)}
                      style={{
                        width: "31.5%",
                        aspectRatio: 1,
                      }}
                    >
                      <Image
                        source={{ uri: p.url }}
                        style={{ flex: 1, borderRadius: 10 }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </SectionBlock>

          {/* The basics — business name + bio come from the vendor's
              identity profile (auto-synced), so we don't ask for them
              here. Just category + where + starting price. */}
          <SectionBlock
            title="The basics"
            subtitle="Where you work and where you start."
            footnote="Set your business name + bio once from your profile — they sync to every listing automatically."
          >
            <FieldLabel required>Category</FieldLabel>
            <Pressable onPress={() => setCategoryPickerOpen(true)}>
              <View style={fieldBox()}>
                <Text
                  style={{
                    color: category ? INK : INK_DIM,
                    fontSize: 16,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {category || "Pick a category"}
                </Text>
                <Feather name="chevron-down" size={18} color={INK_DIM} />
              </View>
            </Pressable>

            <View style={{ height: 14 }} />
            <FieldLabel required>Location</FieldLabel>
            <TextField
              value={location}
              onChangeText={setLocation}
              placeholder="City, State"
            />

            <View style={{ height: 16 }} />
            <FieldLabel required>Pricing model</FieldLabel>
            <Text style={{ fontSize: 12, color: INK_DIM, marginTop: 2 }}>
              Pick all that apply.
            </Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 8,
              }}
            >
              {PRICING_MODELS.map((m) => {
                const active = pricingModels.includes(m);
                return (
                  <Pressable
                    key={m}
                    onPress={() =>
                      setPricingModels((cur) =>
                        cur.includes(m)
                          ? cur.filter((x) => x !== m)
                          : [...cur, m],
                      )
                    }
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? INK : BORDER,
                      backgroundColor: active ? INK : "#ffffff",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: active ? CREAM : INK,
                      }}
                    >
                      {PRICING_MODEL_LABELS[m]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: 16 }} />
            <FieldLabel>Typical price range</FieldLabel>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: INK_DIM, marginBottom: 4 }}>
                  Minimum
                </Text>
                <View style={fieldBox()}>
                  <Text style={{ color: INK_DIM, fontSize: 16, marginRight: 6 }}>
                    $
                  </Text>
                  <TextInput
                    value={priceMin}
                    onChangeText={setPriceMin}
                    placeholder="0"
                    placeholderTextColor={INK_DIM}
                    keyboardType="decimal-pad"
                    style={{ flex: 1, fontSize: 16, color: INK, paddingVertical: 0 }}
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: INK_DIM, marginBottom: 4 }}>
                  Maximum (optional)
                </Text>
                <View style={fieldBox()}>
                  <Text style={{ color: INK_DIM, fontSize: 16, marginRight: 6 }}>
                    $
                  </Text>
                  <TextInput
                    value={priceMax}
                    onChangeText={setPriceMax}
                    placeholder="—"
                    placeholderTextColor={INK_DIM}
                    keyboardType="decimal-pad"
                    style={{ flex: 1, fontSize: 16, color: INK, paddingVertical: 0 }}
                  />
                </View>
              </View>
            </View>

            <View style={{ height: 16 }} />
            <Pressable
              onPress={() => setCustomPricing((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <FieldLabel>Custom pricing</FieldLabel>
                <Text
                  style={{
                    fontFamily: SERIF,
                    fontSize: 13,
                    fontStyle: "italic",
                    color: INK_DIM,
                    marginTop: 2,
                  }}
                >
                  Final pricing may vary by event details.
                </Text>
              </View>
              <View
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: customPricing ? INK : BORDER,
                  padding: 3,
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    backgroundColor: "#ffffff",
                    alignSelf: customPricing ? "flex-end" : "flex-start",
                  }}
                />
              </View>
            </Pressable>
          </SectionBlock>

          {/* STEP 2 · DETAILS */}
          <StepHeader
            step="STEP 2 · DETAILS"
            title="The fine print."
            body={
              category
                ? "Structured fields hosts filter on. The more specific, the better."
                : "Pick a category above to unlock structured details."
            }
          />
          {profile?.id && category ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
              <DetailsSection vendorId={profile.id} category={category} />
            </View>
          ) : (
            <EmptyCard body="Pick a category above to unlock structured details." />
          )}

          {/* STEP 3 · FAQs */}
          <StepHeader
            step="STEP 3 · FAQs"
            title="Common questions."
            body="Answer the first three or four hosts will ask — saves you typing later."
          />
          {profile?.id ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
              <FaqsSection vendorId={profile.id} />
            </View>
          ) : null}

          {/* STEP 4 (Team) removed along with vendor_team_bios. */}
        </ScrollView>

        {/* Sticky action bar.
            - draft/rejected: Save draft + Publish (Publish validates
              category + >=3 photos + location + price; the server
              additionally refuses review entry below 3 photos).
            - pending: Save draft (withdraws from review) + Save changes.
            - approved: a single Save changes (edits don't re-review). */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 24,
            flexDirection: "row",
            gap: 10,
            backgroundColor: CREAM,
            borderTopWidth: 1,
            borderColor: BORDER,
          }}
        >
          {status === "approved" ? (
            <Pressable
              onPress={() =>
                save({ publish: false, requireComplete: true, navigateAfter: true })
              }
              disabled={busy}
              style={[publishPillStyle, { flex: 1 }]}
            >
              <Text style={publishPillText}>
                {busy ? "Saving…" : "Save changes"}
              </Text>
            </Pressable>
          ) : status === "pending" ? (
            <>
              <Pressable
                onPress={() =>
                  save({ publish: false, toDraft: true, navigateAfter: true })
                }
                disabled={busy}
                style={[savePillStyle, { flex: 1 }]}
              >
                <Text style={savePillText}>
                  {busy ? "Saving…" : "Save draft"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  save({ publish: false, requireComplete: true, navigateAfter: true })
                }
                disabled={busy}
                style={[publishPillStyle, { flex: 1 }]}
              >
                <Text style={publishPillText}>
                  {busy ? "Saving…" : "Save changes"}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                onPress={() => save({ publish: false })}
                disabled={busy}
                style={[savePillStyle, { flex: 1 }]}
              >
                <Text style={savePillText}>
                  {busy ? "Saving…" : "Save draft"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  save({ publish: true, requireComplete: true, navigateAfter: true })
                }
                disabled={busy}
                style={[publishPillStyle, { flex: 1 }]}
              >
                <Text style={publishPillText}>
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
      </SafeAreaView>

      {/* Category picker modal */}
      <Modal
        visible={categoryPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCategoryPickerOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={["top"]}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderColor: BORDER,
            }}
          >
            <Pressable onPress={() => setCategoryPickerOpen(false)} hitSlop={8}>
              <Text style={{ fontSize: 16, color: INK_DIM }}>Cancel</Text>
            </Pressable>
            <Text
              style={{ fontSize: 17, fontWeight: "600", color: INK, fontFamily: SERIF }}
            >
              Category
            </Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            {CATEGORY_GROUPS.map((group) => (
              <View key={group.slug} style={{ marginTop: 18 }}>
                <Text
                  style={{
                    paddingHorizontal: 24,
                    paddingBottom: 8,
                    fontSize: 12,
                    fontWeight: "700",
                    letterSpacing: 1.4,
                    color: INK_DIM,
                  }}
                >
                  {group.name.toUpperCase()}
                </Text>
                <View
                  style={{
                    marginHorizontal: 16,
                    backgroundColor: "#ffffff",
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: BORDER,
                    overflow: "hidden",
                  }}
                >
                  {group.subs.map((sub, idx) => {
                    const active = category === sub;
                    const isLast = idx === group.subs.length - 1;
                    return (
                      <Pressable
                        key={sub}
                        onPress={() => {
                          setCategory(sub);
                          setCategoryPickerOpen(false);
                          // Categories with their own builder — persist
                          // the choice and hand the listing over.
                          const wizard = wizardRouteFor(sub);
                          if (wizard && profile?.id) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            void (supabase as any)
                              .from("vendor_profiles")
                              .update({ category: sub })
                              .eq("id", profile.id)
                              .then(() => {
                                router.replace(
                                  `/(vendor)/${wizard}?id=${profile.id}` as never,
                                );
                              });
                          }
                        }}
                      >
                        <View
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 14,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderBottomWidth: isLast ? 0 : 1,
                            borderColor: BORDER,
                            minHeight: 50,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 16,
                              color: INK,
                              fontWeight: active ? "600" : "400",
                              flex: 1,
                            }}
                            numberOfLines={1}
                          >
                            {sub}
                          </Text>
                          {active ? (
                            <Feather name="check" size={20} color={INK} />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// ─── Editorial primitives ───

function CircleButton({
  onPress,
  icon,
}: {
  onPress: () => void;
  icon: React.ComponentProps<typeof Feather>["name"];
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#ffffff",
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
        shadowColor: INK,
        shadowOpacity: 0.10,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      })}
    >
      <Feather name={icon} size={18} color={INK} />
    </Pressable>
  );
}

function StepHeader({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <View style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 4 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.6,
          color: INK_DIM,
        }}
      >
        {step}
      </Text>
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 30,
          fontWeight: "600",
          color: INK,
          marginTop: 8,
          lineHeight: 36,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 16,
          fontStyle: "italic",
          color: INK_DIM,
          marginTop: 10,
          lineHeight: 22,
        }}
      >
        {body}
      </Text>
    </View>
  );
}

function SectionBlock({
  title,
  subtitle,
  footnote,
  children,
}: {
  title: string;
  subtitle?: string;
  footnote?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 22, paddingTop: 22 }}>
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 22,
          fontWeight: "600",
          color: INK,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            fontFamily: SERIF,
            fontSize: 14,
            fontStyle: "italic",
            color: INK_DIM,
            marginTop: 4,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      <View style={{ marginTop: 16 }}>{children}</View>
      {footnote ? (
        <Text
          style={{
            fontFamily: SERIF,
            fontSize: 13,
            fontStyle: "italic",
            color: INK_DIM,
            marginTop: 10,
          }}
        >
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: INK }}>
        {children}
      </Text>
      {required ? (
        <View
          style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#c0533a" }}
        />
      ) : null}
    </View>
  );
}

function TextField({
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad" | "numeric" | "email-address";
}) {
  return (
    <View style={fieldBox(multiline)}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={INK_DIM}
        multiline={multiline}
        keyboardType={keyboardType}
        style={{
          flex: 1,
          fontSize: 16,
          color: INK,
          paddingVertical: 0,
          minHeight: multiline ? 90 : undefined,
          textAlignVertical: multiline ? "top" : "auto",
        }}
      />
    </View>
  );
}

function PhotoGrid({
  photos,
  onAdd,
  uploading,
  onLongPress,
}: {
  photos: PortfolioRow[];
  onAdd: () => void;
  uploading: boolean;
  onLongPress: (p: PortfolioRow) => void;
}) {
  // Cover (big square left) + 2×2 thumbs grid right. Empty slots are
  // dashed-border placeholders matching the rest of the editorial
  // empty-state pattern.
  const thumbs = photos.slice(1, 5);
  const cover = photos[0] ?? null;
  const remaining = Math.max(0, 4 - thumbs.length);

  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {/* Cover */}
      <Pressable
        onPress={cover ? undefined : onAdd}
        onLongPress={cover ? () => onLongPress(cover) : undefined}
        style={{ flex: 1, aspectRatio: 1 }}
      >
        {cover ? (
          <View style={{ flex: 1, position: "relative" }}>
            <Image
              source={{ uri: cover.url }}
              style={{ flex: 1, borderRadius: 16 }}
              resizeMode="cover"
            />
            <View
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                backgroundColor: INK,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
              }}
            >
              <Text
                style={{
                  color: CREAM,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 1.2,
                }}
              >
                COVER
              </Text>
            </View>
          </View>
        ) : (
          <View style={dashedSlot()}>
            <Feather name="camera" size={28} color={INK_DIM} />
            <Text
              style={{
                fontFamily: SERIF,
                fontSize: 14,
                fontStyle: "italic",
                color: INK_DIM,
                marginTop: 8,
              }}
            >
              {uploading ? "Uploading…" : "Add cover photo"}
            </Text>
          </View>
        )}
      </Pressable>
      {/* 2×2 thumb grid */}
      <View style={{ flex: 1, gap: 10 }}>
        <View style={{ flex: 1, flexDirection: "row", gap: 10 }}>
          {[0, 1].map((i) => (
            <ThumbSlot
              key={i}
              photo={thumbs[i]}
              onAdd={onAdd}
              onLongPress={onLongPress}
              uploading={uploading}
            />
          ))}
        </View>
        <View style={{ flex: 1, flexDirection: "row", gap: 10 }}>
          {[2, 3].map((i) => (
            <ThumbSlot
              key={i}
              photo={thumbs[i]}
              onAdd={onAdd}
              onLongPress={onLongPress}
              uploading={uploading}
            />
          ))}
        </View>
      </View>
      {/* Touch handler covers but `remaining` is informational. */}
      <View style={{ width: 0, height: 0 }}>
        {remaining > 0 ? <Text>{remaining}</Text> : null}
      </View>
    </View>
  );
}

function ThumbSlot({
  photo,
  onAdd,
  onLongPress,
  uploading,
}: {
  photo: PortfolioRow | undefined;
  onAdd: () => void;
  onLongPress: (p: PortfolioRow) => void;
  uploading: boolean;
}) {
  if (photo) {
    return (
      <Pressable
        onLongPress={() => onLongPress(photo)}
        style={{ flex: 1, aspectRatio: 1 }}
      >
        <Image
          source={{ uri: photo.url }}
          style={{ flex: 1, borderRadius: 14 }}
          resizeMode="cover"
        />
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onAdd}
      disabled={uploading}
      style={{ flex: 1, aspectRatio: 1 }}
    >
      <View style={dashedSlot()}>
        <Feather name="plus" size={22} color={INK_DIM} />
      </View>
    </Pressable>
  );
}

function BannerCard({
  tone,
  title,
  body,
}: {
  tone: "accent" | "good";
  title: string;
  body: string;
}) {
  const accentBg = tone === "accent" ? "#f4ecdc" : "#e3efe0";
  const accentBorder = tone === "accent" ? "#d6bf94" : "#bcd5b3";
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 18,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: accentBorder,
        backgroundColor: accentBg,
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: "700", color: INK }}>{title}</Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 13,
          color: INK_DIM,
          fontFamily: SERIF,
          fontStyle: "italic",
          lineHeight: 19,
        }}
      >
        {body}
      </Text>
    </View>
  );
}

function EmptyCard({ body }: { body: string }) {
  return (
    <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: BORDER,
          borderStyle: "dashed",
          backgroundColor: CREAM_DEEP,
          paddingVertical: 28,
          paddingHorizontal: 18,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: SERIF,
            fontSize: 14,
            fontStyle: "italic",
            color: INK_DIM,
            textAlign: "center",
          }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}

function fieldBox(multiline = false) {
  return {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: multiline ? 12 : 14,
    minHeight: multiline ? 100 : 50,
    marginTop: 6,
  };
}

function dashedSlot() {
  return {
    flex: 1,
    backgroundColor: CREAM_DEEP,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "dashed" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
}

const savePillStyle = {
  borderRadius: 999,
  borderWidth: 1,
  borderColor: BORDER,
  backgroundColor: "#ffffff",
  paddingVertical: 14,
  alignItems: "center" as const,
};

const savePillText = {
  fontSize: 15,
  fontWeight: "700" as const,
  color: INK,
};

const publishPillStyle = {
  borderRadius: 999,
  backgroundColor: INK,
  paddingVertical: 14,
  alignItems: "center" as const,
};

const publishPillText = {
  fontSize: 15,
  fontWeight: "700" as const,
  color: CREAM,
};

