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

const CREAM = "#fdfcfa";
const INK = "#14161a";
const INK_DIM = "#6b6f78";
const BORDER = "#e5e2dc";
const GOLD = "#c9a86a";
const GOLD_SOFT = "rgba(201,168,106,0.16)";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 100;

// One shared form for the whole Venues group — the vendor's chosen
// SUBcategory (Event Venues / Outdoor Spaces / …) is their venue type;
// the form doesn't re-ask it.
const STEPS = ["Basics", "About", "Spaces", "Amenities", "More"] as const;

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
      dialog.show({ icon: "alert-circle", title: "Save failed", message: error.message });
      return false;
    }
    if (status) {
      setProfile((p) => (p ? { ...p, application_status: status } : p));
    }
    return true;
  }

  function missingForPublish(): string[] {
    const missing: string[] = [];
    if (!venueName.trim()) missing.push("Venue name");
    if (!tagline.trim()) missing.push("Short tagline");
    if (!capacityMin.trim() || !capacityMax.trim()) missing.push("Capacity (min–max)");
    if (!address.trim()) missing.push("Location");
    if (!description.trim()) missing.push("Full description");
    if (spaces.filter((s) => s.name.trim()).length === 0)
      missing.push("At least one event space");
    // Custom pricing skips the numeric starting price, same as the
    // generic builder's custom_pricing toggle.
    if (
      pricingType !== "Custom" &&
      (!priceMin.trim() || Number.parseFloat(priceMin) <= 0)
    )
      missing.push("Starting price (or choose Custom pricing)");
    if (photos.length < MIN_PHOTOS)
      missing.push(`At least ${MIN_PHOTOS} photos`);
    return missing;
  }

  async function saveDraftHeader() {
    if (busy) return;
    setBusy(true);
    const ok = await persist();
    setBusy(false);
    if (ok) dialog.show({ title: "Saved", message: "Your progress is safe." });
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
        title: "Couldn't change category",
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
        title: "Can't publish yet",
        message: `Add the following first:\n\n${missing.map((m) => `• ${m}`).join("\n")}`,
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
      title: "Submitted for review",
      message: "We'll review your listing within 2–3 business days.",
      buttonLabel: "Done",
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
        title: "Saved as draft",
        message: "Your listing is out of review until you publish it again.",
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
        title: "Changes saved",
        message: "Your listing is up to date.",
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
        title: "Library access needed",
        message:
          "Enable photo library access in Settings to upload listing photos.",
      });
      return;
    }
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      dialog.show({
        icon: "image",
        title: "Photo limit reached",
        message: `Listings cap at ${MAX_PHOTOS} photos.`,
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
        title: "Some photos were skipped",
        message:
          "HEIC photos can't be shown on the web listing. In iOS Camera settings choose Formats → Most Compatible.",
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
        title: "Some photos didn't upload",
        message: `${assets.length - rows.length} photo(s) failed. Try them again.`,
      });
    }
    await load();
  }

  async function deletePhoto(p: PhotoRow) {
    dialog.show({
      icon: "trash-2",
      title: "Delete this photo?",
      message: "It's removed from this listing right away.",
      confirmLabel: "Delete",
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
      title: "Delete this listing?",
      message:
        "All photos, packages, FAQs, and inquiries tied to this listing will be permanently removed. This can't be undone.",
      confirmLabel: "Delete listing",
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
            title: "Couldn't delete",
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
          <Text style={{ color: INK_DIM }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ color: INK_DIM, textAlign: "center" }}>
            Couldn&rsquo;t load this listing.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header: back · New listing · Save draft */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Feather name="chevron-left" size={26} color={INK} />
          </Pressable>
          <Text
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 24,
              fontWeight: "700",
              color: INK,
            }}
          >
            {status === "draft" ? "New listing" : "Edit listing"}
          </Text>
          <TouchableOpacity
            onPress={saveDraftHeader}
            disabled={busy}
            activeOpacity={0.7}
            style={{
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              backgroundColor: "#ffffff",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>
              {status === "draft" ? "Save draft" : "Save"}
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
                title="Basics"
                sub="Tell hosts the essentials about your venue."
              />
              <CategoryField
                value={profile.category}
                onPress={() => setCategoryPickerOpen(true)}
              />
              <Field label="Venue name" required>
                <Input
                  value={venueName}
                  onChangeText={setVenueName}
                  placeholder="e.g., The Grand Oak Estate"
                />
              </Field>
              <Field label="Short tagline" required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder="e.g., Timeless moments. Unforgettable events."
                />
              </Field>
              <Field label="Capacity (min – max)" required>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={capacityMin}
                      onChangeText={(v) => setCapacityMin(v.replace(/[^0-9]/g, ""))}
                      placeholder="Min guests"
                      keyboardType="number-pad"
                    />
                  </View>
                  <Text style={{ color: INK_DIM }}>–</Text>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={capacityMax}
                      onChangeText={(v) => setCapacityMax(v.replace(/[^0-9]/g, ""))}
                      placeholder="Max guests"
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              </Field>
              <Field label="Location" required>
                <Input value={address} onChangeText={setAddress} placeholder="Enter address" />
              </Field>
              <Field label="Service areas (cities, regions, states)">
                <Input
                  value={serviceAreas}
                  onChangeText={setServiceAreas}
                  placeholder="Add areas"
                />
              </Field>
              <Field label="On-site parking details">
                <Input value={parking} onChangeText={setParking} placeholder="Add parking details" />
              </Field>
              <Field label="Website">
                <Input
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="https://…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label="Year established">
                <Input
                  value={yearEstablished}
                  onChangeText={(v) => setYearEstablished(v.replace(/[^0-9]/g, "").slice(0, 4))}
                  placeholder="e.g., 2015"
                  keyboardType="number-pad"
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <StepTitle
                title="About your venue"
                sub="What makes the space special."
              />
              <Field label="Full description" required>
                <Input
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe the venue, the experience, and what hosts can expect."
                  multiline
                />
              </Field>
              <Field label="Best for (select all that apply)">
                <ChipMulti options={BEST_FOR} selected={bestFor} onChange={setBestFor} />
              </Field>
              <Field label="Indoor / Outdoor / Both">
                <ChipSingle
                  options={["Indoor", "Outdoor", "Both"]}
                  selected={setting}
                  onChange={(v) => setSetting(v as typeof setting)}
                />
              </Field>
              <Field label="Style / vibe">
                <Input
                  value={styleVibe}
                  onChangeText={setStyleVibe}
                  placeholder="e.g., Modern industrial with warm accents"
                />
              </Field>
              <Field label="Unique highlights">
                <Input
                  value={highlights}
                  onChangeText={setHighlights}
                  placeholder="e.g., Skyline views, 100-year-old oak tree courtyard"
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title="Spaces & capacity"
                sub="Add your event spaces and capacities."
              />
              <TouchableOpacity
                onPress={() => setSpaces((prev) => [...prev, emptySpace()])}
                activeOpacity={0.7}
                style={{
                  marginTop: 8,
                  borderWidth: 1.5,
                  borderStyle: "dashed",
                  borderColor: "rgba(20,22,26,0.25)",
                  borderRadius: 16,
                  paddingVertical: 14,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Feather name="plus" size={16} color={INK} />
                <Text style={{ fontSize: 15, fontWeight: "600", color: INK }}>
                  Add {spaces.length === 0 ? "event space" : "another space"}
                </Text>
              </TouchableOpacity>
              {spaces.map((s, i) => (
                <SpaceCard
                  key={s.key}
                  space={s}
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
                title="Amenities"
                sub="What's included on-site — select all that apply."
              />
              <ChipMulti
                options={AMENITIES}
                selected={amenities}
                onChange={setAmenities}
                allowCustom
              />

              <StepTitle title="Policies" sub="Select all that apply." topGap />
              <ChipMulti
                options={POLICIES}
                selected={policies}
                onChange={setPolicies}
                allowCustom
              />

              <StepTitle title="Permits & licenses" sub="Select all that apply." topGap />
              <ChipMulti
                options={PERMITS}
                selected={permits}
                onChange={setPermits}
                allowCustom
              />
              <Field label="Noise ordinance / quiet hours">
                <Input
                  value={quietHours}
                  onChangeText={setQuietHours}
                  placeholder='e.g., "Music off by 10 PM"'
                />
              </Field>
              <Field label="Cancellation policy">
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder="e.g., Full refund up to 60 days out, 50% up to 30 days"
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <StepTitle
                title="Services & offerings"
                sub="What's bundled or available — select all that apply."
              />
              <ChipMulti
                options={SERVICES}
                selected={services}
                onChange={setServices}
                allowCustom
              />
              <Field label="Preferred partners (optional)">
                <TagList
                  items={partners}
                  onChange={setPartners}
                  placeholder="Add a partner (e.g., Luminara Photography)"
                />
              </Field>

              <StepTitle title="Pricing" sub="Where your pricing starts." topGap />
              <Field label="Pricing type">
                <ChipSingle
                  options={["Per event", "Hourly", "Custom"]}
                  selected={pricingType}
                  onChange={(v) => setPricingType(v as typeof pricingType)}
                />
              </Field>
              <Field label="Starting price (USD)" required>
                <Input
                  value={priceMin}
                  onChangeText={(v) => setPriceMin(v.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g., 2500"
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="Price range top end (optional)">
                <Input
                  value={priceMax}
                  onChangeText={(v) => setPriceMax(v.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g., 12000"
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="What's included in the starting price">
                <Input
                  value={priceIncludes}
                  onChangeText={setPriceIncludes}
                  placeholder="e.g., 6-hour rental, tables & chairs, cleaning"
                  multiline
                />
              </Field>
              <Field label="Additional fees (cleaning, overtime, etc.)">
                <Input
                  value={additionalFees}
                  onChangeText={setAdditionalFees}
                  placeholder="e.g., $250 cleaning fee, $150/hr overtime"
                  multiline
                />
              </Field>
              <Field label="Payment schedule / deposit">
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder="e.g., 50% deposit to book, balance 14 days out"
                />
              </Field>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <StepTitle
                title="Photos & media"
                sub={`${MIN_PHOTOS}–${MAX_PHOTOS} photos. Your first becomes the cover.`}
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
                        <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
                          COVER
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
                    borderWidth: 1.5,
                    borderStyle: "dashed",
                    borderColor: "rgba(20,22,26,0.25)",
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {photoUploading ? (
                    <Text style={{ fontSize: 11, color: INK_DIM }}>Uploading…</Text>
                  ) : (
                    <Feather name="plus" size={22} color={INK_DIM} />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={{ marginTop: 8, fontSize: 12, color: INK_DIM }}>
                Long-press a photo to delete it. Reordering and cover changes
                live in the classic editor for now.
              </Text>
              <Field label="Video tour URL (optional)">
                <Input
                  value={videoTourUrl}
                  onChangeText={setVideoTourUrl}
                  placeholder="https://youtube.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label="Virtual tour link (optional)">
                <Input
                  value={virtualTourUrl}
                  onChangeText={setVirtualTourUrl}
                  placeholder="https://my.matterport.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>

              <StepTitle title="FAQs" sub="Answer what hosts will ask first." topGap />
              <FaqsSection vendorId={profile.id} />

              <StepTitle title="Review" sub="Almost there." topGap />
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
                <Text style={darkPillText}>Continue</Text>
              </TouchableOpacity>
            ) : status === "pending" ? (
              <>
                <TouchableOpacity
                  onPress={saveChanges}
                  disabled={busy}
                  activeOpacity={0.85}
                  style={{ ...darkPill, opacity: busy ? 0.5 : 1 }}
                >
                  <Text style={darkPillText}>{busy ? "Saving…" : "Save changes"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={withdrawToDraft}
                  disabled={busy}
                  activeOpacity={0.7}
                  style={{ ...lightPill, opacity: busy ? 0.5 : 1 }}
                >
                  <Text style={lightPillText}>Withdraw to draft</Text>
                </TouchableOpacity>
              </>
            ) : status === "approved" ? (
              <TouchableOpacity
                onPress={saveChanges}
                disabled={busy}
                activeOpacity={0.85}
                style={{ ...darkPill, opacity: busy ? 0.5 : 1 }}
              >
                <Text style={darkPillText}>{busy ? "Saving…" : "Save changes"}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  onPress={publish}
                  disabled={busy}
                  activeOpacity={0.85}
                  style={{ ...darkPill, opacity: busy ? 0.5 : 1 }}
                >
                  <Text style={darkPillText}>
                    {busy
                      ? "Publishing…"
                      : status === "rejected"
                        ? "Re-submit"
                        : "Publish"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveDraftHeader}
                  disabled={busy}
                  activeOpacity={0.7}
                  style={{ ...lightPill, opacity: busy ? 0.5 : 1 }}
                >
                  <Text style={lightPillText}>Save draft</Text>
                </TouchableOpacity>
              </>
            )}
            {step > 0 ? (
              <TouchableOpacity
                onPress={() => setStep((s) => s - 1)}
                activeOpacity={0.7}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                <Text style={{ color: INK_DIM, fontSize: 14, fontWeight: "500" }}>
                  ← Back to {STEPS[step - 1]}
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
                <Text style={{ color: "#dc2828", fontSize: 14, fontWeight: "600" }}>
                  Delete listing
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
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 18,
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
                  marginTop: 14,
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
                  borderWidth: done || current ? 0 : 1.5,
                  borderColor: BORDER,
                }}
              >
                {done ? (
                  <Feather name="check" size={14} color="#fff" />
                ) : (
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: current ? "#fff" : INK_DIM,
                    }}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  fontWeight: current ? "700" : "500",
                  color: current ? INK : INK_DIM,
                }}
              >
                {label}
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
    <View style={{ marginTop: topGap ? 30 : 6, marginBottom: 6 }}>
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 26,
          fontWeight: "700",
          color: INK,
          letterSpacing: -0.3,
        }}
      >
        {title}
      </Text>
      <Text style={{ marginTop: 3, fontSize: 13, color: INK_DIM }}>{sub}</Text>
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
      <Text style={{ fontSize: 14, fontWeight: "600", color: INK }}>
        {label}
        {required ? <Text style={{ color: "#c0392b" }}> *</Text> : null}
      </Text>
      <View style={{ marginTop: 8 }}>{children}</View>
    </View>
  );
}

function Input(props: ComponentProps<typeof TextInput>) {
  const { multiline } = props;
  return (
    <TextInput
      placeholderTextColor={INK_DIM}
      {...props}
      style={{
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: INK,
        minHeight: multiline ? 96 : undefined,
        textAlignVertical: multiline ? "top" : "auto",
      }}
    />
  );
}

// Multi-select chip grid with an optional inline "+ Add other".
function ChipMulti({
  options,
  selected,
  onChange,
  allowCustom,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
}) {
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
              paddingHorizontal: 14,
              paddingVertical: 9,
              backgroundColor: on ? GOLD : "#ffffff",
              borderWidth: 1,
              borderColor: on ? GOLD : BORDER,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: on ? "#ffffff" : INK,
              }}
            >
              {opt}
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
            placeholder="Type and press return"
            placeholderTextColor={INK_DIM}
            style={{
              borderRadius: 999,
              paddingHorizontal: 14,
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
              paddingHorizontal: 14,
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
            <Text style={{ fontSize: 13, fontWeight: "600", color: INK_DIM }}>
              Add other
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
}: {
  options: string[];
  selected: string;
  onChange: (v: string) => void;
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
              backgroundColor: on ? GOLD : "#ffffff",
              borderWidth: 1,
              borderColor: on ? GOLD : BORDER,
            }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: "600", color: on ? "#fff" : INK }}
            >
              {opt}
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
            <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>{it}</Text>
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
}: {
  space: VenueSpace;
  onChange: (next: VenueSpace) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(!space.name);
  const chips = [space.setting || null, space.type.trim() || null].filter(
    Boolean,
  ) as string[];
  return (
    <View
      style={{
        marginTop: 12,
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 16,
        padding: 14,
      }}
    >
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              style={{ flex: 1, fontSize: 16, fontWeight: "700", color: INK }}
              numberOfLines={1}
            >
              {space.name.trim() || "New space"}
            </Text>
            {space.sqft ? (
              <Text style={{ fontSize: 12, color: INK_DIM, marginLeft: 8 }}>
                {space.sqft} sq ft
              </Text>
            ) : null}
          </View>
          {chips.length > 0 ? (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
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
                  <Text style={{ fontSize: 11, fontWeight: "600", color: INK }}>
                    {c}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
          <Feather name="trash-2" size={16} color="#c0392b" />
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
            placeholder="Space name (e.g., Grand Ballroom)"
          />
          <Input
            value={space.type}
            onChangeText={(v) => onChange({ ...space, type: v })}
            placeholder="Space type (e.g., Ballroom, Terrace, Garden)"
          />
          <ChipSingle
            options={["Indoor", "Outdoor"]}
            selected={space.setting}
            onChange={(v) => onChange({ ...space, setting: v as VenueSpace["setting"] })}
          />
          <Input
            value={space.sqft}
            onChangeText={(v) => onChange({ ...space, sqft: v.replace(/[^0-9]/g, "") })}
            placeholder="Square footage"
            keyboardType="number-pad"
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              [
                ["ceremony", "Ceremony"],
                ["reception", "Reception"],
                ["seated", "Seated dinner"],
                ["standing", "Standing"],
              ] as const
            ).map(([k, label]) => (
              <View key={k} style={{ flexBasis: "47%", flexGrow: 1 }}>
                <Text style={{ fontSize: 11, color: INK_DIM, marginBottom: 4 }}>
                  {label}
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
  if (missing.length === 0) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: GOLD_SOFT,
          borderRadius: 14,
          padding: 14,
        }}
      >
        <MaterialCommunityIcons name="check-circle" size={20} color={GOLD} />
        <Text style={{ flex: 1, fontSize: 14, color: INK }}>
          Everything required is filled in. Publish when you&rsquo;re ready.
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: "700", color: INK }}>
        Still needed to publish:
      </Text>
      {missing.map((m) => (
        <View
          key={m}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}
        >
          <Feather name="circle" size={12} color={INK_DIM} />
          <Text style={{ fontSize: 14, color: INK_DIM }}>{m}</Text>
        </View>
      ))}
    </View>
  );
}

const darkPill = {
  backgroundColor: INK,
  borderRadius: 999,
  height: 54,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
const darkPillText = {
  color: "#ffffff",
  fontSize: 16,
  fontWeight: "600" as const,
};
const lightPill = {
  borderWidth: 1,
  borderColor: BORDER,
  backgroundColor: "#ffffff",
  borderRadius: 999,
  height: 54,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
const lightPillText = {
  color: INK,
  fontSize: 16,
  fontWeight: "600" as const,
};
