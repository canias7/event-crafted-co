// Venue listing wizard — the category-specific listing builder for the
// Venues group ("Event Venues", "Outdoor Spaces", "Private Dining
// Spaces", "Corporate / Conference Spaces"). Built to the user's
// reference design: five steps (Basics · Spaces · Amenities · Services
// · Review) with a numbered progress rail, chip selectors with
// add-your-own, collapsible space cards, and Save draft in the header.
//
// Storage: venue-specific answers live in vendor_profiles.category_details
// (jsonb). Fields the marketplace already understands stay in their real
// columns — location, price_min/max_cents, category — so search, cards,
// and the setup checklist keep working unchanged. Photos and FAQs reuse
// the same tables/components as the generic builder.
//
// The generic builder (listing.tsx) redirects here when the listing's
// category belongs to the Venues group; other categories keep the
// generic form until their own wizard ships.
//
// No function-form style props (device interop drops them).

import { useCallback, useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { compressForUpload } from "@/lib/imageManipulation";
import { FaqsSection } from "@/components/listing/Sections";
import {
  CategoryField,
  CategoryPickerModal,
  editorRouteFor,
  useBrandDialog,
} from "@/components/listing/WizardKit";

// This file's own route — category changes that resolve elsewhere hand
// the listing over.
const THIS_ROUTE = "venue-listing";

const CREAM = "#fbf9f4";
const INK = "#14161a";
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = "#14161a";
const PLACEHOLDER = "#746a58";
const BORDER = "#e6e1d5";
const GOLD = "#c9a86a";
const GOLD_SOFT = "rgba(201,168,106,0.16)";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 100;

// One shared form for the whole Venues group — the vendor's chosen
// SUBcategory (Event Venues / Outdoor Spaces / …) is their venue type;
// the form doesn't re-ask it.
// Labels come from venueListing → steps.<key>.
const STEPS = ["basics", "about", "spaces", "amenities", "more"] as const;

const BEST_FOR = [
  "Weddings",
  "Corporate events",
  "Birthdays",
  "Galas & fundraisers",
  "Showers & intimate events",
  "Conferences",
  "Photo & film shoots",
];
const AMENITIES = [
  "On-site parking",
  "Valet available",
  "Wi-Fi",
  "Catering kitchen",
  "AV / sound system",
  "Stage",
  "Dance floor",
  "Tables & chairs included",
  "Linens included",
  "Wheelchair accessible",
  "Bridal / green room",
  "Climate control",
  "Outdoor heaters",
  "Restrooms on-site",
];
const POLICIES = [
  "Outside catering allowed",
  "Preferred caterers only",
  "In-house catering only",
  "BYO alcohol allowed",
  "Licensed bar on-site",
  "No alcohol",
  "Pet friendly",
  "Smoking area available",
  "Open flame allowed",
];
const PERMITS = [
  "Liquor license",
  "Certified catering kitchen",
  "Overnight accommodations",
];
const SERVICES = [
  "Event coordination",
  "Day-of coordinator",
  "Setup & teardown",
  "Security staff",
  "Cleaning / janitorial",
  "Bartending staff",
  "In-house catering",
  "AV technician",
  "Valet parking",
];

interface VenueSpace {
  key: string;
  name: string;
  /** e.g. Ballroom, Terrace, Garden — free text. */
  type: string;
  setting: "Indoor" | "Outdoor" | "";
  sqft: string;
  ceremony: string;
  reception: string;
  seated: string;
  standing: string;
}

function emptySpace(): VenueSpace {
  return {
    key: Math.random().toString(36).slice(2),
    name: "",
    type: "",
    setting: "",
    sqft: "",
    ceremony: "",
    reception: "",
    seated: "",
    standing: "",
  };
}

type ProfileRow = {
  id: string;
  category: string | null;
  business_name: string | null;
  location: string | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  application_status: "draft" | "pending" | "approved" | "rejected" | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  category_details: any;
};

type PhotoRow = {
  id: string;
  storage_path: string;
  display_order: number;
  url: string;
};

const COLS =
  "id, category, business_name, location, price_min_cents, price_max_cents, application_status, category_details";

export default function VenueListingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id: routeId } = useLocalSearchParams<{ id?: string }>();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const dialog = useBrandDialog();
  const { t, tObject } = useT("venueListing");
  const optionLabels = tObject<Record<string, string>>("options") ?? {};
  const optLabel = (v: string) => optionLabels[v] ?? v;

  // Basics
  const [venueName, setVenueName] = useState("");
  const [tagline, setTagline] = useState("");
  const [capacityMin, setCapacityMin] = useState("");
  const [capacityMax, setCapacityMax] = useState("");
  const [address, setAddress] = useState("");
  const [serviceAreas, setServiceAreas] = useState("");
  const [parking, setParking] = useState("");
  const [website, setWebsite] = useState("");
  const [yearEstablished, setYearEstablished] = useState("");
  const [description, setDescription] = useState("");
  const [bestFor, setBestFor] = useState<string[]>([]);
  const [setting, setSetting] = useState<"Indoor" | "Outdoor" | "Both" | "">("");
  const [styleVibe, setStyleVibe] = useState("");
  const [highlights, setHighlights] = useState("");

  // Spaces
  const [spaces, setSpaces] = useState<VenueSpace[]>([]);

  // Amenities + policies
  const [amenities, setAmenities] = useState<string[]>([]);
  const [policies, setPolicies] = useState<string[]>([]);
  const [permits, setPermits] = useState<string[]>([]);
  const [quietHours, setQuietHours] = useState("");

  const [cancellationPolicy, setCancellationPolicy] = useState("");

  // Services + pricing
  const [services, setServices] = useState<string[]>([]);
  const [partners, setPartners] = useState<string[]>([]);
  const [pricingType, setPricingType] = useState<
    "Per event" | "Hourly" | "Custom" | ""
  >("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [priceIncludes, setPriceIncludes] = useState("");
  const [additionalFees, setAdditionalFees] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("");

  // Review
  const [videoTourUrl, setVideoTourUrl] = useState("");
  const [virtualTourUrl, setVirtualTourUrl] = useState("");
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);

  const load = useCallback(async () => {
    if (!user || !routeId) return;
    setLoading(true);
    const { data } = await supabase
      .from("vendor_profiles")
      .select(COLS)
      .eq("id", routeId)
      .eq("user_id", user.id)
      .maybeSingle();
    const row = (data as ProfileRow | null) ?? null;
    setProfile(row);
    if (row) {
      const d = row.category_details ?? {};
      setVenueName(row.business_name ?? "");
      setTagline(d.tagline ?? "");
      setCapacityMin(d.capacity_min != null ? String(d.capacity_min) : "");
      setCapacityMax(d.capacity_max != null ? String(d.capacity_max) : "");
      setAddress(row.location ?? "");
      setServiceAreas(d.service_areas ?? "");
      setParking(d.parking ?? "");
      setWebsite(d.website ?? "");
      setYearEstablished(d.year_established ?? "");
      setDescription(d.description ?? "");
      setBestFor(Array.isArray(d.best_for) ? d.best_for : []);
      setSetting(d.setting ?? "");
      setStyleVibe(d.style_vibe ?? "");
      setHighlights(d.highlights ?? "");
      setSpaces(
        Array.isArray(d.spaces) && d.spaces.length > 0
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            d.spaces.map((s: any) => ({ ...emptySpace(), ...s }))
          : [],
      );
      setAmenities(Array.isArray(d.amenities) ? d.amenities : []);
      setPolicies(Array.isArray(d.policies) ? d.policies : []);
      setPermits(Array.isArray(d.permits) ? d.permits : []);
      setQuietHours(d.quiet_hours ?? "");
      setCancellationPolicy(d.cancellation_policy ?? "");
      setPricingType(d.pricing_type ?? "");
      setServices(Array.isArray(d.services) ? d.services : []);
      setPartners(Array.isArray(d.partners) ? d.partners : []);
      setPriceMin(
        row.price_min_cents != null ? String(row.price_min_cents / 100) : "",
      );
      setPriceMax(
        row.price_max_cents != null ? String(row.price_max_cents / 100) : "",
      );
      setPriceIncludes(d.price_includes ?? "");
      setAdditionalFees(d.additional_fees ?? "");
      setPaymentSchedule(d.payment_schedule ?? "");
      setVideoTourUrl(d.video_tour_url ?? "");
      setVirtualTourUrl(d.virtual_tour_url ?? "");

      const { data: imgs } = await supabase
        .from("vendor_portfolio_images")
        .select("id, storage_path, display_order")
        .eq("vendor_id", row.id)
        .order("display_order", { ascending: true });
      setPhotos(
        ((imgs ?? []) as Omit<PhotoRow, "url">[]).map((i) => ({
          ...i,
          url: supabase.storage
            .from("vendor-portfolios")
            .getPublicUrl(i.storage_path).data.publicUrl,
        })),
      );
    }
    setLoading(false);
  }, [user, routeId]);

  useEffect(() => {
    load();
  }, [load]);

  function detailsPayload() {
    return {
      group: "venues",
      tagline: tagline.trim(),
      capacity_min: capacityMin ? Number.parseInt(capacityMin, 10) : null,
      capacity_max: capacityMax ? Number.parseInt(capacityMax, 10) : null,
      service_areas: serviceAreas.trim(),
      parking: parking.trim(),
      website: website.trim(),
      year_established: yearEstablished.trim(),
      description: description.trim(),
      best_for: bestFor,
      setting,
      style_vibe: styleVibe.trim(),
      highlights: highlights.trim(),
      spaces: spaces
        .filter((s) => s.name.trim())
        .map(({ key, ...s }) => ({ key, ...s })),
      amenities,
      policies,
      permits,
      quiet_hours: quietHours.trim(),
      cancellation_policy: cancellationPolicy.trim(),
      pricing_type: pricingType,
      services,
      partners,
      price_includes: priceIncludes.trim(),
      additional_fees: additionalFees.trim(),
      payment_schedule: paymentSchedule.trim(),
      video_tour_url: videoTourUrl.trim(),
      virtual_tour_url: virtualTourUrl.trim(),
    };
  }

  async function persist(status?: "pending" | "draft"): Promise<boolean> {
    if (!profile?.id) return false;
    const minCents = priceMin
      ? Math.round(Number.parseFloat(priceMin) * 100)
      : null;
    const maxCents = priceMax
      ? Math.round(Number.parseFloat(priceMax) * 100)
      : null;
    // Pricing type maps onto the marketplace's pricing_models so listing
    // cards and search render it exactly like generic listings.
    const pricingModels =
      pricingType === "Per event"
        ? ["fixed_packages"]
        : pricingType === "Hourly"
          ? ["hourly"]
          : pricingType === "Custom"
            ? ["custom_quote"]
            : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        // Venues-group listings keep a real marketplace category; default
        // to the group's generic sub if none was ever picked.
        category: profile.category || "Event Venues",
        business_name: venueName.trim() || null,
        location: address.trim() || null,
        price_min_cents: minCents,
        price_max_cents: maxCents,
        base_price_cents: minCents,
        pricing_models: pricingModels,
        custom_pricing: pricingType === "Custom",
        category_details: detailsPayload(),
        ...(status ? { application_status: status } : {}),
      })
      .eq("id", profile.id);
    if (error) {
      dialog.show({ icon: "alert-circle", title: t("dialogs.saveFailed"), message: error.message });
      return false;
    }
    if (status) {
      setProfile((p) => (p ? { ...p, application_status: status } : p));
    }
    return true;
  }

  function missingForPublish(): string[] {
    const missing: string[] = [];
    if (!venueName.trim()) missing.push(t("missing.venueName"));
    if (!tagline.trim()) missing.push(t("missing.tagline"));
    if (!capacityMin.trim() || !capacityMax.trim()) missing.push(t("missing.capacity"));
    if (!address.trim()) missing.push(t("missing.location"));
    if (!description.trim()) missing.push(t("missing.description"));
    if (spaces.filter((s) => s.name.trim()).length === 0)
      missing.push(t("missing.space"));
    // Custom pricing skips the numeric starting price, same as the
    // generic builder's custom_pricing toggle.
    if (
      pricingType !== "Custom" &&
      (!priceMin.trim() || Number.parseFloat(priceMin) <= 0)
    )
      missing.push(t("missing.price"));
    if (photos.length < MIN_PHOTOS)
      missing.push(t("missing.photos", { count: MIN_PHOTOS }));
    return missing;
  }

  async function saveDraftHeader() {
    if (busy) return;
    setBusy(true);
    const ok = await persist();
    setBusy(false);
    if (ok) dialog.show({ title: t("dialogs.savedTitle"), message: t("dialogs.savedMessage") });
  }

  // Change the marketplace category from inside the wizard. Picking a
  // category from another group hands the listing to that group's editor.
  async function changeCategory(sub: string) {
    setCategoryPickerOpen(false);
    if (!profile?.id || sub === profile.category) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({ category: sub })
      .eq("id", profile.id);
    if (error) {
      dialog.show({
        icon: "alert-circle",
        title: t("dialogs.categoryError"),
        message: error.message,
      });
      return;
    }
    const route = editorRouteFor(sub);
    if (route !== THIS_ROUTE) {
      router.replace(`/(vendor)/${route}?id=${profile.id}` as never);
    } else {
      setProfile((p) => (p ? { ...p, category: sub } : p));
    }
  }

  async function publish() {
    if (busy || !profile) return;
    const missing = missingForPublish();
    if (missing.length > 0) {
      dialog.show({
        icon: "list",
        title: t("missing.title"),
        message: `${t("missing.intro")}\n\n${missing.map((m) => `• ${m}`).join("\n")}`,
      });
      return;
    }
    setBusy(true);
    const ok = await persist("pending");
    setBusy(false);
    if (!ok) return;
    supabase.functions
      .invoke("send-transactional-email", {
        body: { kind: "listing_submitted", vendorProfileId: profile.id },
      })
      .catch(() => {});
    dialog.show({
      icon: "send",
      title: t("dialogs.submittedTitle"),
      message: t("dialogs.submittedMessage"),
      buttonLabel: t("dialogs.done"),
      onClose: () => router.back(),
    });
  }

  async function withdrawToDraft() {
    if (busy) return;
    setBusy(true);
    const ok = await persist("draft");
    setBusy(false);
    if (ok) {
      dialog.show({
        icon: "file-text",
        title: t("dialogs.draftTitle"),
        message: t("dialogs.draftMessage"),
        onClose: () => router.back(),
      });
    }
  }

  async function saveChanges() {
    if (busy) return;
    setBusy(true);
    const ok = await persist();
    setBusy(false);
    if (ok) {
      dialog.show({
        title: t("dialogs.changesTitle"),
        message: t("dialogs.changesMessage"),
        onClose: () => router.back(),
      });
    }
  }

  // ---- Photos (same tables/bucket/mechanics as the generic builder) ----
  async function addPhotos() {
    if (!profile?.id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      dialog.show({
        icon: "image",
        title: t("photos.accessTitle"),
        message: t("photos.accessMessage"),
      });
      return;
    }
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      dialog.show({
        icon: "image",
        title: t("photos.limitTitle"),
        message: t("photos.limitMessage", { count: MAX_PHOTOS }),
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (result.canceled || result.assets.length === 0) return;
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
    if (assets.length < result.assets.length) {
      dialog.show({
        icon: "alert-circle",
        title: t("photos.skippedTitle"),
        message: t("photos.skippedMessage"),
      });
    }
    if (assets.length === 0) return;
    setPhotoUploading(true);
    const baseOrder =
      photos.length === 0
        ? 0
        : Math.max(...photos.map((p) => p.display_order)) + 1;
    const rows: Array<{
      vendor_id: string;
      storage_path: string;
      display_order: number;
    }> = [];
    for (let i = 0; i < assets.length; i++) {
      try {
        const { uri: upUri, mime } = await compressForUpload(assets[i]);
        const path = `${profile.id}/${Date.now()}-${baseOrder + i}-${i}.jpg`;
        const bytes = await (await fetch(upUri)).arrayBuffer();
        if (bytes.byteLength === 0) continue;
        const up = await supabase.storage
          .from("vendor-portfolios")
          .upload(path, bytes, { contentType: mime, upsert: false });
        if (up.error) continue;
        rows.push({
          vendor_id: profile.id,
          storage_path: path,
          display_order: baseOrder + i,
        });
      } catch {
        // Skip the bad asset, keep the rest of the batch moving.
      }
    }
    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("vendor_portfolio_images").insert(rows);
    }
    setPhotoUploading(false);
    if (rows.length < assets.length) {
      dialog.show({
        icon: "alert-circle",
        title: t("photos.failedTitle"),
        message: t("photos.failedMessage", { count: assets.length - rows.length }),
      });
    }
    await load();
  }

  async function deletePhoto(p: PhotoRow) {
    dialog.show({
      icon: "trash-2",
      title: t("photos.deleteTitle"),
      message: t("photos.deleteMessage"),
      confirmLabel: t("photos.deleteConfirm"),
      destructive: true,
      onConfirm: async () => {
        await supabase.storage.from("vendor-portfolios").remove([p.storage_path]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("vendor_portfolio_images")
          .delete()
          .eq("id", p.id);
        setPhotos((prev) => prev.filter((x) => x.id !== p.id));
      },
    });
  }

  // Vendor-side hard delete — same confirm + RPC as the profile card's
  // trash action, surfaced here so it's discoverable while editing.
  function confirmDeleteListing() {
    if (!profile?.id || busy) return;
    dialog.show({
      icon: "trash-2",
      title: t("deleteListing.title"),
      message: t("deleteListing.message"),
      confirmLabel: t("deleteListing.confirm"),
      destructive: true,
      onConfirm: async () => {
        setBusy(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).rpc(
          "delete_my_vendor_profile",
          { p_vendor_id: profile.id },
        );
        setBusy(false);
        if (error) {
          dialog.show({
            icon: "alert-circle",
            title: t("deleteListing.error"),
            message: error.message,
          });
        } else {
          router.back();
        }
      },
    });
  }

  const status = profile?.application_status ?? "draft";

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: SERIF, color: INK_DIM }}>{t("loading")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ fontFamily: SERIF, color: INK_DIM, textAlign: "center" }}>
            {t("loadError")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        {/* Header: back · New listing · Save draft */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 10,
          }}
        >
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Feather name="chevron-left" size={26} color={INK} />
          </Pressable>
          <Text
            style={{
              fontFamily: SERIF_BOLD,
              fontSize: 24,
              color: INK,
              flexShrink: 1,
              textAlign: "center",
              marginHorizontal: 8,
            }}
          >
            {status === "draft" ? t("header.new") : t("header.edit")}
          </Text>
          <TouchableOpacity
            onPress={saveDraftHeader}
            disabled={busy}
            activeOpacity={0.7}
            style={{
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 16,
              height: 36,
              justifyContent: "center",
              // Solid disabled colours rather than a blanket fade.
              backgroundColor: busy ? "#f4f1ea" : "#ffffff",
              borderColor: BORDER,
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>
              {status === "draft" ? t("header.saveDraft") : t("header.save")}
            </Text>
          </TouchableOpacity>
        </View>

        <StepRail step={step} onJump={setStep} />

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 40,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 ? (
            <>
              <StepTitle
                title={t("basics.title")}
                sub={t("basics.sub")}
              />
              <CategoryField
                value={profile.category}
                onPress={() => setCategoryPickerOpen(true)}
              />
              <Field label={t("basics.venueName")} required>
                <Input
                  value={venueName}
                  onChangeText={setVenueName}
                  placeholder={t("basics.venueNamePlaceholder")}
                />
              </Field>
              <Field label={t("basics.tagline")} required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder={t("basics.taglinePlaceholder")}
                />
              </Field>
              <Field label={t("basics.capacity")} required>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={capacityMin}
                      onChangeText={(v) => setCapacityMin(v.replace(/[^0-9]/g, ""))}
                      placeholder={t("basics.minGuests")}
                      keyboardType="number-pad"
                    />
                  </View>
                  <Text style={{ fontFamily: SERIF, color: INK_DIM }}>–</Text>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={capacityMax}
                      onChangeText={(v) => setCapacityMax(v.replace(/[^0-9]/g, ""))}
                      placeholder={t("basics.maxGuests")}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              </Field>
              <Field label={t("basics.location")} required>
                <Input value={address} onChangeText={setAddress} placeholder={t("basics.locationPlaceholder")} />
              </Field>
              <Field label={t("basics.serviceAreas")}>
                <Input
                  value={serviceAreas}
                  onChangeText={setServiceAreas}
                  placeholder={t("basics.serviceAreasPlaceholder")}
                />
              </Field>
              <Field label={t("basics.parking")}>
                <Input value={parking} onChangeText={setParking} placeholder={t("basics.parkingPlaceholder")} />
              </Field>
              <Field label={t("basics.website")}>
                <Input
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="https://…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label={t("basics.year")}>
                <Input
                  value={yearEstablished}
                  onChangeText={(v) => setYearEstablished(v.replace(/[^0-9]/g, "").slice(0, 4))}
                  placeholder={t("basics.yearPlaceholder")}
                  keyboardType="number-pad"
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <StepTitle
                title={t("about.title")}
                sub={t("about.sub")}
              />
              <Field label={t("about.description")} required>
                <Input
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t("about.descriptionPlaceholder")}
                  multiline
                />
              </Field>
              <Field label={t("about.bestFor")}>
                <ChipMulti
                  options={BEST_FOR}
                  selected={bestFor}
                  onChange={setBestFor}
                  labelFor={optLabel}
                />
              </Field>
              <Field label={t("about.setting")}>
                <ChipSingle
                  labelFor={optLabel}
                  options={["Indoor", "Outdoor", "Both"]}
                  selected={setting}
                  onChange={(v) => setSetting(v as typeof setting)}
                />
              </Field>
              <Field label={t("about.style")}>
                <Input
                  value={styleVibe}
                  onChangeText={setStyleVibe}
                  placeholder={t("about.stylePlaceholder")}
                />
              </Field>
              <Field label={t("about.highlights")}>
                <Input
                  value={highlights}
                  onChangeText={setHighlights}
                  placeholder={t("about.highlightsPlaceholder")}
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title={t("spaces.title")}
                sub={t("spaces.sub")}
              />
              <TouchableOpacity
                onPress={() => setSpaces((prev) => [...prev, emptySpace()])}
                activeOpacity={0.7}
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: BORDER,
                  borderRadius: 20,
                  paddingVertical: 16,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Feather name="plus" size={16} color={INK} />
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }}>
                  {spaces.length === 0 ? t("spaces.addFirst") : t("spaces.addAnother")}
                </Text>
              </TouchableOpacity>
              {spaces.map((s, i) => (
                <SpaceCard
                  key={s.key}
                  space={s}
                  optLabel={optLabel}
                  onChange={(next) =>
                    setSpaces((prev) => prev.map((x, xi) => (xi === i ? next : x)))
                  }
                  onDelete={() =>
                    setSpaces((prev) => prev.filter((_, xi) => xi !== i))
                  }
                />
              ))}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <StepTitle
                title={t("amenities.title")}
                sub={t("amenities.sub")}
              />
              <ChipMulti
                options={AMENITIES}
                labelFor={optLabel}
                selected={amenities}
                onChange={setAmenities}
                allowCustom
              />

              <StepTitle title={t("amenities.policies")} sub={t("amenities.selectAll")} topGap />
              <ChipMulti
                options={POLICIES}
                labelFor={optLabel}
                selected={policies}
                onChange={setPolicies}
                allowCustom
              />

              <StepTitle title={t("amenities.permits")} sub={t("amenities.selectAll")} topGap />
              <ChipMulti
                options={PERMITS}
                labelFor={optLabel}
                selected={permits}
                onChange={setPermits}
                allowCustom
              />
              <Field label={t("amenities.quietHours")}>
                <Input
                  value={quietHours}
                  onChangeText={setQuietHours}
                  placeholder={t("amenities.quietHoursPlaceholder")}
                />
              </Field>
              <Field label={t("amenities.cancellation")}>
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder={t("amenities.cancellationPlaceholder")}
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <StepTitle
                title={t("services.title")}
                sub={t("services.sub")}
              />
              <ChipMulti
                options={SERVICES}
                labelFor={optLabel}
                selected={services}
                onChange={setServices}
                allowCustom
              />
              <Field label={t("services.partners")}>
                <TagList
                  items={partners}
                  onChange={setPartners}
                  placeholder={t("services.partnersPlaceholder")}
                />
              </Field>

              <StepTitle title={t("pricing.title")} sub={t("pricing.sub")} topGap />
              <Field label={t("pricing.type")}>
                <ChipSingle
                  labelFor={optLabel}
                  options={["Per event", "Hourly", "Custom"]}
                  selected={pricingType}
                  onChange={(v) => setPricingType(v as typeof pricingType)}
                />
              </Field>
              <Field label={t("pricing.start")} required>
                <Input
                  value={priceMin}
                  onChangeText={(v) => setPriceMin(v.replace(/[^0-9.]/g, ""))}
                  placeholder={t("pricing.startPlaceholder")}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label={t("pricing.max")}>
                <Input
                  value={priceMax}
                  onChangeText={(v) => setPriceMax(v.replace(/[^0-9.]/g, ""))}
                  placeholder={t("pricing.maxPlaceholder")}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label={t("pricing.includes")}>
                <Input
                  value={priceIncludes}
                  onChangeText={setPriceIncludes}
                  placeholder={t("pricing.includesPlaceholder")}
                  multiline
                />
              </Field>
              <Field label={t("pricing.fees")}>
                <Input
                  value={additionalFees}
                  onChangeText={setAdditionalFees}
                  placeholder={t("pricing.feesPlaceholder")}
                  multiline
                />
              </Field>
              <Field label={t("pricing.schedule")}>
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder={t("pricing.schedulePlaceholder")}
                />
              </Field>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <StepTitle
                title={t("photos.title")}
                sub={t("photos.sub", { min: MIN_PHOTOS, max: MAX_PHOTOS })}
              />
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                {photos.map((p, i) => (
                  <Pressable
                    key={p.id}
                    onLongPress={() => deletePhoto(p)}
                    style={{ width: "31%", aspectRatio: 1 }}
                  >
                    <Image
                      source={{ uri: p.url }}
                      style={{ width: "100%", height: "100%", borderRadius: 12 }}
                      resizeMode="cover"
                    />
                    {i === 0 ? (
                      <View
                        style={{
                          position: "absolute",
                          bottom: 6,
                          left: 6,
                          backgroundColor: "rgba(0,0,0,0.65)",
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ fontFamily: SERIF_BOLD, color: "#ffffff", fontSize: 10}}>
                          {t("photos.cover")}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
                <TouchableOpacity
                  onPress={addPhotos}
                  disabled={photoUploading}
                  activeOpacity={0.7}
                  style={{
                    width: "31%",
                    aspectRatio: 1,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: BORDER,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {photoUploading ? (
                    <Text style={{ fontFamily: SERIF, fontSize: 11, color: INK_DIM }}>{t("photos.uploading")}</Text>
                  ) : (
                    <Feather name="plus" size={22} color={INK_DIM} />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={{ fontFamily: SERIF, marginTop: 8, fontSize: 12, color: INK_DIM }}>
                {t("photos.hint")}
              </Text>
              <Field label={t("photos.video")}>
                <Input
                  value={videoTourUrl}
                  onChangeText={setVideoTourUrl}
                  placeholder="https://youtube.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label={t("photos.virtual")}>
                <Input
                  value={virtualTourUrl}
                  onChangeText={setVirtualTourUrl}
                  placeholder="https://my.matterport.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>

              <StepTitle title={t("faqs.title")} sub={t("faqs.sub")} topGap />
              <FaqsSection vendorId={profile.id} />

              <StepTitle title={t("review.title")} sub={t("review.sub")} topGap />
              <ReviewChecklist missing={missingForPublish()} />
            </>
          ) : null}

          {/* Step navigation */}
          <View style={{ marginTop: 28, gap: 10 }}>
            {step < STEPS.length - 1 ? (
              <TouchableOpacity
                onPress={() => setStep((s) => s + 1)}
                activeOpacity={0.85}
                style={darkPill}
              >
                <Text style={darkPillText}>{t("actions.continue")}</Text>
              </TouchableOpacity>
            ) : status === "pending" ? (
              <>
                <TouchableOpacity
                  onPress={saveChanges}
                  disabled={busy}
                  activeOpacity={0.85}
                  style={darkPillFor(busy)}
                >
                  <Text style={darkPillText}>{busy ? t("actions.saving") : t("actions.saveChanges")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={withdrawToDraft}
                  disabled={busy}
                  activeOpacity={0.7}
                  style={lightPillFor(busy)}
                >
                  <Text style={lightPillText}>{t("actions.withdraw")}</Text>
                </TouchableOpacity>
              </>
            ) : status === "approved" ? (
              <TouchableOpacity
                onPress={saveChanges}
                disabled={busy}
                activeOpacity={0.85}
                style={darkPillFor(busy)}
              >
                <Text style={darkPillText}>{busy ? t("actions.saving") : t("actions.saveChanges")}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  onPress={publish}
                  disabled={busy}
                  activeOpacity={0.85}
                  style={darkPillFor(busy)}
                >
                  <Text style={darkPillText}>
                    {busy
                      ? t("actions.publishing")
                      : status === "rejected"
                        ? t("actions.resubmit")
                        : t("actions.publish")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveDraftHeader}
                  disabled={busy}
                  activeOpacity={0.7}
                  style={lightPillFor(busy)}
                >
                  <Text style={lightPillText}>{t("actions.saveDraft")}</Text>
                </TouchableOpacity>
              </>
            )}
            {step > 0 ? (
              <TouchableOpacity
                onPress={() => setStep((s) => s - 1)}
                activeOpacity={0.7}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 14}}>
                  {t("actions.backTo", { step: t(`steps.${STEPS[step - 1]}`) })}
                </Text>
              </TouchableOpacity>
            ) : null}
            {step === STEPS.length - 1 ? (
              <TouchableOpacity
                onPress={confirmDeleteListing}
                disabled={busy}
                activeOpacity={0.7}
                style={{ alignItems: "center", paddingVertical: 10 }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, color: "#b23a34", fontSize: 14}}>
                  {t("deleteListing.confirm")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {dialog.element}
      <CategoryPickerModal
        visible={categoryPickerOpen}
        selected={profile.category}
        onSelect={changeCategory}
        onClose={() => setCategoryPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

// ---- UI pieces -------------------------------------------------------

function StepRail({
  step,
  onJump,
}: {
  step: number;
  onJump: (i: number) => void;
}) {
  const { t } = useT("venueListing");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 8,
      }}
    >
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <View
            key={label}
            style={{ flex: 1, alignItems: "center", flexDirection: "row" }}
          >
            {i > 0 ? (
              <View
                style={{
                  flex: 1,
                  height: 1.5,
                  backgroundColor: done || current ? INK : BORDER,
                  marginTop: 16,
                }}
              />
            ) : null}
            <Pressable onPress={() => onJump(i)} style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: done ? INK : current ? GOLD : "transparent",
                  borderWidth: done || current ? 0 : 1,
                  borderColor: BORDER,
                }}
              >
                {done ? (
                  <Feather name="check" size={14} color="#fff" />
                ) : (
                  <Text
                    style={{
                      fontFamily: SERIF_BOLD,
                      fontSize: 13,
                      color: current ? INK : INK_DIM,
                    }}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                style={{
                  fontFamily: current ? SERIF_BOLD : SERIF,
                  marginTop: 4,
                  fontSize: 10,
                  color: current ? INK : INK_DIM,
                }}
              >
                {t(`steps.${label}`)}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function StepTitle({
  title,
  sub,
  topGap,
}: {
  title: string;
  sub: string;
  topGap?: boolean;
}) {
  return (
    <View style={{ marginTop: topGap ? 32 : 6, marginBottom: 6 }}>
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: 24,
          color: INK,
          letterSpacing: -0.3,
        }}
      >
        {title}
      </Text>
      <Text style={{ fontFamily: SERIF, marginTop: 3, fontSize: 13, color: INK_DIM }}>{sub}</Text>
    </View>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>
        {label}
        {required ? <Text style={{ fontFamily: SERIF, color: "#b23a34" }}> *</Text> : null}
      </Text>
      <View style={{ marginTop: 8 }}>{children}</View>
    </View>
  );
}

function Input(props: ComponentProps<typeof TextInput>) {
  const { multiline } = props;
  return (
    <TextInput
      placeholderTextColor={PLACEHOLDER}
      {...props}
      style={{ fontFamily: SERIF,
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        color: INK,
        minHeight: multiline ? 96 : undefined,
        textAlignVertical: multiline ? "top" : "auto",
      }}
    />
  );
}

// Option values below are what's saved (English); the screen shows
// venueListing → options[value], and a vendor's own entries as typed.

// Multi-select chip grid with an optional inline "+ Add other".
function ChipMulti({
  options,
  selected,
  onChange,
  allowCustom,
  labelFor,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
  labelFor?: (opt: string) => string;
}) {
  const { t } = useT("venueListing");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  // Custom entries the vendor added earlier surface as normal chips.
  const custom = selected.filter((s) => !options.includes(s));
  const all = [...options, ...custom];

  function commitCustom() {
    const v = draft.trim();
    setDraft("");
    setAdding(false);
    if (!v) return;
    if (!selected.includes(v)) onChange([...selected, v]);
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {all.map((opt) => {
        const on = selected.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            onPress={() =>
              onChange(on ? selected.filter((s) => s !== opt) : [...selected, opt])
            }
            activeOpacity={0.7}
            style={{
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 9,
              backgroundColor: on ? INK : "#ffffff",
              borderWidth: 1,
              borderColor: on ? INK : BORDER,
            }}
          >
            <Text
              style={{
                fontFamily: SERIF_BOLD,
                fontSize: 13,
                color: on ? "#ffffff" : INK,
              }}
            >
              {labelFor ? labelFor(opt) : opt}
            </Text>
          </TouchableOpacity>
        );
      })}
      {allowCustom ? (
        adding ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commitCustom}
            onBlur={commitCustom}
            autoFocus
            placeholder={t("chips.typeAndReturn")}
            placeholderTextColor={PLACEHOLDER}
            style={{ fontFamily: SERIF,
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 9,
              backgroundColor: GOLD_SOFT,
              borderWidth: 1,
              borderColor: GOLD,
              fontSize: 13,
              color: INK,
              minWidth: 160,
            }}
          />
        ) : (
          <TouchableOpacity
            onPress={() => setAdding(true)}
            activeOpacity={0.7}
            style={{
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 9,
              backgroundColor: "#ffffff",
              borderWidth: 1,
              borderColor: BORDER,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Feather name="plus" size={12} color={INK_DIM} />
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK_DIM }}>
              {t("chips.addOther")}
            </Text>
          </TouchableOpacity>
        )
      ) : null}
    </View>
  );
}

function ChipSingle({
  options,
  selected,
  onChange,
  labelFor,
}: {
  options: string[];
  selected: string;
  onChange: (v: string) => void;
  labelFor?: (opt: string) => string;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const on = selected === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(on ? "" : opt)}
            activeOpacity={0.7}
            style={{
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 9,
              backgroundColor: on ? INK : "#ffffff",
              borderWidth: 1,
              borderColor: on ? INK : BORDER,
            }}
          >
            <Text
              style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: on ? "#fff" : INK }}
            >
              {labelFor ? labelFor(opt) : opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Free-text tag list (preferred partners).
function TagList({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim();
    setDraft("");
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
  }
  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: items.length ? 8 : 0 }}>
        {items.map((it) => (
          <TouchableOpacity
            key={it}
            onPress={() => onChange(items.filter((x) => x !== it))}
            activeOpacity={0.7}
            style={{
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: GOLD_SOFT,
              borderWidth: 1,
              borderColor: GOLD,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>{it}</Text>
            <Feather name="x" size={12} color={INK_DIM} />
          </TouchableOpacity>
        ))}
      </View>
      <Input
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={commit}
        onBlur={commit}
        placeholder={placeholder}
      />
    </View>
  );
}

// Collapsible space card mirroring the reference design.
function SpaceCard({
  space,
  onChange,
  onDelete,
  optLabel,
}: {
  space: VenueSpace;
  onChange: (next: VenueSpace) => void;
  onDelete: () => void;
  optLabel: (v: string) => string;
}) {
  const { t } = useT("venueListing");
  const [open, setOpen] = useState(!space.name);
  const chips = [
    space.setting ? optLabel(space.setting) : null,
    space.type.trim() || null,
  ].filter(
    Boolean,
  ) as string[];
  return (
    <View
      style={{
        marginTop: 12,
        backgroundColor: CREAM,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 20,
        padding: 16,
      }}
    >
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              style={{ fontFamily: SERIF_BOLD, flex: 1, fontSize: 16, color: INK }}
              numberOfLines={1}
            >
              {space.name.trim() || t("spaces.newSpace")}
            </Text>
            {space.sqft ? (
              <Text style={{ fontFamily: SERIF, fontSize: 12, color: INK_DIM, marginLeft: 8 }}>
                {t("spaces.sqft", { n: space.sqft })}
              </Text>
            ) : null}
          </View>
          {chips.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {chips.map((c) => (
                <View
                  key={c}
                  style={{
                    backgroundColor: GOLD_SOFT,
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={{ fontFamily: SERIF_BOLD, fontSize: 11, color: INK }}>
                    {c}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
          <Feather name="trash-2" size={16} color="#b23a34" />
        </TouchableOpacity>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={INK_DIM}
          style={{ marginLeft: 12 }}
        />
      </Pressable>

      {open ? (
        <View style={{ marginTop: 12, gap: 12 }}>
          <Input
            value={space.name}
            onChangeText={(v) => onChange({ ...space, name: v })}
            placeholder={t("spaces.namePlaceholder")}
          />
          <Input
            value={space.type}
            onChangeText={(v) => onChange({ ...space, type: v })}
            placeholder={t("spaces.typePlaceholder")}
          />
          <ChipSingle
            labelFor={optLabel}
            options={["Indoor", "Outdoor"]}
            selected={space.setting}
            onChange={(v) => onChange({ ...space, setting: v as VenueSpace["setting"] })}
          />
          <Input
            value={space.sqft}
            onChangeText={(v) => onChange({ ...space, sqft: v.replace(/[^0-9]/g, "") })}
            placeholder={t("spaces.sqftPlaceholder")}
            keyboardType="number-pad"
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              [
                "ceremony",
                "reception",
                "seated",
                "standing",
              ] as const
            ).map((k) => (
              <View key={k} style={{ flexBasis: "47%", flexGrow: 1 }}>
                <Text style={{ fontFamily: SERIF, fontSize: 11, color: INK_DIM, marginBottom: 4 }}>
                  {t(`spaces.${k}`)}
                </Text>
                <Input
                  value={space[k]}
                  onChangeText={(v) =>
                    onChange({ ...space, [k]: v.replace(/[^0-9]/g, "") })
                  }
                  placeholder="0"
                  keyboardType="number-pad"
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ReviewChecklist({ missing }: { missing: string[] }) {
  const { t } = useT("venueListing");
  if (missing.length === 0) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: GOLD_SOFT,
          borderRadius: 20,
          padding: 16,
        }}
      >
        <MaterialCommunityIcons name="check-circle" size={20} color={GOLD} />
        <Text style={{ fontFamily: SERIF, flex: 1, fontSize: 14, color: INK }}>
          {t("review.allSet")}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        backgroundColor: CREAM,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 20,
        padding: 16,
      }}
    >
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>
        {t("review.stillNeeded")}
      </Text>
      {missing.map((m) => (
        <View
          key={m}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}
        >
          <Feather name="circle" size={12} color={INK_DIM} />
          <Text style={{ fontFamily: SERIF, fontSize: 14, color: INK_DIM }}>{m}</Text>
        </View>
      ))}
    </View>
  );
}

const darkPill = {
  backgroundColor: GOLD,
  borderRadius: 999,
  height: 52,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
const darkPillText = {
  fontFamily: SERIF_BOLD,
  color: INK,
  fontSize: 16,
};
const lightPill = {
  borderWidth: 1,
  borderColor: BORDER,
  backgroundColor: "#ffffff",
  borderRadius: 999,
  height: 52,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

// Local copies of the shared wizard pills, so they get the same solid
// disabled treatment rather than a washed-out 50% opacity.
function darkPillFor(disabled: boolean) {
  return disabled ? { ...darkPill, backgroundColor: "#e0d2b0" } : darkPill;
}
function lightPillFor(disabled: boolean) {
  return disabled
    ? { ...lightPill, backgroundColor: "#f4f1ea", borderColor: BORDER }
    : lightPill;
}
const lightPillText = {
  fontFamily: SERIF_BOLD,
  color: INK,
  fontSize: 16,
};
