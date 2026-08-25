// Entertainment listing wizard — the category-specific builder for the
// Entertainment group (DJs, Live Music, Performers, Hosts / MCs).
// Built to the user's reference design: five steps — Basics · About ·
// Performance · Pricing · Review. One shared form for the whole group;
// the vendor's chosen SUBcategory is their act type.
//
// Storage: answers live in vendor_profiles.category_details (jsonb).
// Marketplace-native fields keep their real columns: business_name,
// location, price_min_cents, pricing_models/custom_pricing. Photos &
// FAQs reuse the generic builder's tables and components.

import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { FaqsSection } from "@/components/listing/Sections";
import {
  CREAM,
  INK,
  INK_DIM,
  BORDER,
  SERIF,
  MIN_PHOTOS,
  StepRail,
  StepTitle,
  Field,
  Input,
  ChipMulti,
  ChipSingle,
  ReviewChecklist,
  useBrandDialog,
  ListingPhotosGrid,
  CategoryField,
  CategoryPickerModal,
  editorRouteFor,
  darkPill,
  darkPillFor,
  darkPillText,
  lightPill,
  lightPillFor,
  lightPillText,
} from "@/components/listing/WizardKit";

// This file's own route — category changes that resolve elsewhere hand
// the listing over.
const THIS_ROUTE = "entertainment-listing";

const STEPS = ["Basics", "About", "Performance", "Pricing", "Review"] as const;

const WHAT_YOU_DO = [
  "Play music",
  "MC / Host",
  "Perform",
  "Sing / Vocals",
  "Dance",
  "Entertain",
];
const BEST_FOR = [
  "Weddings",
  "Parties",
  "Corporate events",
  "Private events",
  "Festivals",
  "Nightclubs",
];
const PRICING_TYPES = ["Hourly", "Flat rate", "Per event", "Custom"];

type ProfileRow = {
  id: string;
  category: string | null;
  business_name: string | null;
  location: string | null;
  price_min_cents: number | null;
  application_status: "draft" | "pending" | "approved" | "rejected" | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  category_details: any;
};

const COLS =
  "id, category, business_name, location, price_min_cents, application_status, category_details";

export default function EntertainmentListingScreen() {
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
  const [actName, setActName] = useState("");
  const [tagline, setTagline] = useState("");
  const [location, setLocation] = useState("");
  const [serviceAreas, setServiceAreas] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [yearsInBusiness, setYearsInBusiness] = useState("");

  // About
  const [description, setDescription] = useState("");
  const [whatYouDo, setWhatYouDo] = useState<string[]>([]);
  const [bestFor, setBestFor] = useState<string[]>([]);
  const [styleGenre, setStyleGenre] = useState("");
  const [unique, setUnique] = useState("");

  // Performance
  const [actType, setActType] = useState("");
  const [performanceLength, setPerformanceLength] = useState("");
  const [setOptions, setSetOptions] = useState("");
  const [performerCount, setPerformerCount] = useState("");
  const [audienceMin, setAudienceMin] = useState("");
  const [audienceMax, setAudienceMax] = useState("");
  const [included, setIncluded] = useState("");
  const [equipment, setEquipment] = useState("");
  const [soundLighting, setSoundLighting] = useState<"Yes" | "No" | "">("");
  const [setupIncluded, setSetupIncluded] = useState<"Yes" | "No" | "">("");
  const [mcIncluded, setMcIncluded] = useState<"Yes" | "No" | "">("");
  const [spaceRequirements, setSpaceRequirements] = useState("");
  const [powerRequirements, setPowerRequirements] = useState("");
  const [loadInTime, setLoadInTime] = useState("");
  const [parkingAccess, setParkingAccess] = useState("");
  const [travelAvailable, setTravelAvailable] = useState<"Yes" | "No" | "">("");

  // Pricing + policies
  const [pricingType, setPricingType] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [packagesAvailable, setPackagesAvailable] = useState<"Yes" | "No" | "">("");
  const [priceIncludes, setPriceIncludes] = useState("");
  const [travelFees, setTravelFees] = useState("");
  const [overtime, setOvertime] = useState("");
  const [additionalFees, setAdditionalFees] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("");
  const [otherNotes, setOtherNotes] = useState("");

  // Review
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [riderUrl, setRiderUrl] = useState("");
  const [photoCount, setPhotoCount] = useState(0);

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
      setActName(row.business_name ?? "");
      setTagline(d.tagline ?? "");
      setLocation(row.location ?? "");
      setServiceAreas(d.service_areas ?? "");
      setWebsite(d.website ?? "");
      setInstagram(d.instagram ?? "");
      setYearsInBusiness(d.years_in_business ?? "");
      setDescription(d.description ?? "");
      setWhatYouDo(Array.isArray(d.what_you_do) ? d.what_you_do : []);
      setBestFor(Array.isArray(d.best_for) ? d.best_for : []);
      setStyleGenre(d.style_genre ?? "");
      setUnique(d.unique ?? "");
      setActType(d.act_type ?? "");
      setPerformanceLength(d.performance_length ?? "");
      setSetOptions(d.set_options ?? "");
      setPerformerCount(d.performer_count != null ? String(d.performer_count) : "");
      setAudienceMin(d.audience_min != null ? String(d.audience_min) : "");
      setAudienceMax(d.audience_max != null ? String(d.audience_max) : "");
      setIncluded(d.included ?? "");
      setEquipment(d.equipment ?? "");
      setSoundLighting(d.sound_lighting ?? "");
      setSetupIncluded(d.setup_included ?? "");
      setMcIncluded(d.mc_included ?? "");
      setSpaceRequirements(d.space_requirements ?? "");
      setPowerRequirements(d.power_requirements ?? "");
      setLoadInTime(d.load_in_time ?? "");
      setParkingAccess(d.parking_access ?? "");
      setTravelAvailable(d.travel_available ?? "");
      setPricingType(d.pricing_type ?? "");
      setPriceMin(
        row.price_min_cents != null ? String(row.price_min_cents / 100) : "",
      );
      setPackagesAvailable(d.packages_available ?? "");
      setPriceIncludes(d.price_includes ?? "");
      setTravelFees(d.travel_fees ?? "");
      setOvertime(d.overtime ?? "");
      setAdditionalFees(d.additional_fees ?? "");
      setCancellationPolicy(d.cancellation_policy ?? "");
      setPaymentSchedule(d.payment_schedule ?? "");
      setOtherNotes(d.other_notes ?? "");
      setVideoUrl(d.video_url ?? "");
      setAudioUrl(d.audio_url ?? "");
      setRiderUrl(d.rider_url ?? "");
    }
    setLoading(false);
  }, [user, routeId]);

  useEffect(() => {
    load();
  }, [load]);

  function detailsPayload() {
    return {
      group: "entertainment",
      tagline: tagline.trim(),
      service_areas: serviceAreas.trim(),
      website: website.trim(),
      instagram: instagram.trim(),
      years_in_business: yearsInBusiness.trim(),
      description: description.trim(),
      what_you_do: whatYouDo,
      best_for: bestFor,
      style_genre: styleGenre.trim(),
      unique: unique.trim(),
      act_type: actType.trim(),
      performance_length: performanceLength.trim(),
      set_options: setOptions.trim(),
      performer_count: performerCount ? Number.parseInt(performerCount, 10) : null,
      audience_min: audienceMin ? Number.parseInt(audienceMin, 10) : null,
      audience_max: audienceMax ? Number.parseInt(audienceMax, 10) : null,
      included: included.trim(),
      equipment: equipment.trim(),
      sound_lighting: soundLighting,
      setup_included: setupIncluded,
      mc_included: mcIncluded,
      space_requirements: spaceRequirements.trim(),
      power_requirements: powerRequirements.trim(),
      load_in_time: loadInTime.trim(),
      parking_access: parkingAccess.trim(),
      travel_available: travelAvailable,
      pricing_type: pricingType,
      packages_available: packagesAvailable,
      price_includes: priceIncludes.trim(),
      travel_fees: travelFees.trim(),
      overtime: overtime.trim(),
      additional_fees: additionalFees.trim(),
      cancellation_policy: cancellationPolicy.trim(),
      payment_schedule: paymentSchedule.trim(),
      other_notes: otherNotes.trim(),
      video_url: videoUrl.trim(),
      audio_url: audioUrl.trim(),
      rider_url: riderUrl.trim(),
    };
  }

  async function persist(status?: "pending" | "draft"): Promise<boolean> {
    if (!profile?.id) return false;
    const minCents = priceMin
      ? Math.round(Number.parseFloat(priceMin) * 100)
      : null;
    const pricingModels =
      pricingType === "Hourly"
        ? ["hourly"]
        : pricingType === "Flat rate" || pricingType === "Per event"
          ? ["fixed_packages"]
          : pricingType === "Custom"
            ? ["custom_quote"]
            : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        category: profile.category || "DJs",
        business_name: actName.trim() || null,
        location: location.trim() || null,
        price_min_cents: minCents,
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
    if (!actName.trim()) missing.push("Act / business name");
    if (!tagline.trim()) missing.push("Short tagline");
    if (!location.trim()) missing.push("Location");
    if (!serviceAreas.trim()) missing.push("Service areas");
    if (!yearsInBusiness.trim()) missing.push("Years in business");
    if (!description.trim()) missing.push("Full description");
    if (whatYouDo.length === 0) missing.push("What you do (at least one)");
    if (
      pricingType !== "Custom" &&
      (!priceMin.trim() || Number.parseFloat(priceMin) <= 0)
    )
      missing.push("Starting price (or choose Custom pricing)");
    if (photoCount < MIN_PHOTOS) missing.push(`At least ${MIN_PHOTOS} photos`);
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
          <Text style={{ fontFamily: SERIF, color: INK_DIM }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ fontFamily: SERIF, color: INK_DIM, textAlign: "center" }}>
            Couldn&rsquo;t load this listing.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const yesNo = ["Yes", "No"];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
              fontFamily: "LibreBaskerville-Italic",
              fontSize: 24,
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
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              // Solid disabled colours rather than a blanket fade.
              backgroundColor: busy ? "#f3f1ec" : "#ffffff",
              borderColor: busy ? "#ece9e1" : BORDER,
            }}
          >
            <Text style={{ fontFamily: "LibreBaskerville-Bold", fontSize: 13, color: INK }}>
              {status === "draft" ? "Save draft" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        <StepRail steps={STEPS} step={step} onJump={setStep} />

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
                sub="Tell clients the essentials about your act."
              />
              <CategoryField
                value={profile.category}
                onPress={() => setCategoryPickerOpen(true)}
              />
              <Field label="Act / business name" required>
                <Input
                  value={actName}
                  onChangeText={setActName}
                  placeholder="e.g., DJ Alex Beats"
                />
              </Field>
              <Field label="Short tagline" required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder="e.g., High-energy DJ. Unforgettable moments."
                />
              </Field>
              <Field label="Location" required>
                <Input
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Enter city or ZIP code"
                />
              </Field>
              <Field label="Service areas (cities, regions, states)" required>
                <Input
                  value={serviceAreas}
                  onChangeText={setServiceAreas}
                  placeholder="Add areas"
                />
              </Field>
              <Field label="Website">
                <Input
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="www.yourwebsite.com"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label="Instagram (optional)">
                <Input
                  value={instagram}
                  onChangeText={setInstagram}
                  placeholder="@yourhandle"
                  autoCapitalize="none"
                />
              </Field>
              <Field label="Years in business" required>
                <Input
                  value={yearsInBusiness}
                  onChangeText={(v) => setYearsInBusiness(v.replace(/[^0-9]/g, "").slice(0, 3))}
                  placeholder="e.g., 5"
                  keyboardType="number-pad"
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <StepTitle
                title="About your act"
                sub="Help clients know who you are and what you offer."
              />
              <Field label="Full description" required>
                <Input
                  value={description}
                  onChangeText={(v) => setDescription(v.slice(0, 1000))}
                  placeholder="Tell clients about your experience, style, and what makes you unique…"
                  multiline
                />
              </Field>
              <Field label="What you do (select all that apply)" required>
                <ChipMulti
                  options={WHAT_YOU_DO}
                  selected={whatYouDo}
                  onChange={setWhatYouDo}
                  allowCustom
                />
              </Field>
              <Field label="Best for (select all that apply)">
                <ChipMulti
                  options={BEST_FOR}
                  selected={bestFor}
                  onChange={setBestFor}
                  allowCustom
                />
              </Field>
              <Field label="Style / genre / vibe">
                <Input
                  value={styleGenre}
                  onChangeText={setStyleGenre}
                  placeholder="e.g., Top 40, Jazz, Acoustic, High-energy, Elegant…"
                />
              </Field>
              <Field label="What makes you unique?">
                <Input
                  value={unique}
                  onChangeText={(v) => setUnique(v.slice(0, 500))}
                  placeholder="Share what sets you apart from other entertainers…"
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title="Performance details"
                sub="What a booking with you looks like."
              />
              <Field label="Type of performance / act">
                <Input
                  value={actType}
                  onChangeText={setActType}
                  placeholder="e.g., Open-format DJ set with live sax"
                />
              </Field>
              <Field label="Typical performance length">
                <Input
                  value={performanceLength}
                  onChangeText={setPerformanceLength}
                  placeholder="e.g., 4 hours, two 45-minute sets"
                />
              </Field>
              <Field label="Set options / packages">
                <Input
                  value={setOptions}
                  onChangeText={setSetOptions}
                  placeholder="e.g., Ceremony + cocktail hour + reception"
                  multiline
                />
              </Field>
              <Field label="Number of performers / members">
                <Input
                  value={performerCount}
                  onChangeText={(v) => setPerformerCount(v.replace(/[^0-9]/g, ""))}
                  placeholder="e.g., 1"
                  keyboardType="number-pad"
                />
              </Field>
              <Field label="Audience size (min – max)">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={audienceMin}
                      onChangeText={(v) => setAudienceMin(v.replace(/[^0-9]/g, ""))}
                      placeholder="Min"
                      keyboardType="number-pad"
                    />
                  </View>
                  <Text style={{ fontFamily: SERIF, color: INK_DIM }}>–</Text>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={audienceMax}
                      onChangeText={(v) => setAudienceMax(v.replace(/[^0-9]/g, ""))}
                      placeholder="Max"
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              </Field>

              <StepTitle title="What's included" sub="What comes with the booking." topGap />
              <Field label="What's included in your performance">
                <Input
                  value={included}
                  onChangeText={setIncluded}
                  placeholder="e.g., Music curation, requests, wireless mics"
                  multiline
                />
              </Field>
              <Field label="Equipment / instruments / gear">
                <Input
                  value={equipment}
                  onChangeText={setEquipment}
                  placeholder="e.g., Pioneer setup, 2x QSC K12 speakers"
                  multiline
                />
              </Field>
              <Field label="Sound / lighting included?">
                <ChipSingle
                  options={yesNo}
                  selected={soundLighting}
                  onChange={(v) => setSoundLighting(v as typeof soundLighting)}
                />
              </Field>
              <Field label="Setup / breakdown included?">
                <ChipSingle
                  options={yesNo}
                  selected={setupIncluded}
                  onChange={(v) => setSetupIncluded(v as typeof setupIncluded)}
                />
              </Field>
              <Field label="MC / announcements included?">
                <ChipSingle
                  options={yesNo}
                  selected={mcIncluded}
                  onChange={(v) => setMcIncluded(v as typeof mcIncluded)}
                />
              </Field>

              <StepTitle title="Requirements & logistics" sub="What you need from the venue." topGap />
              <Field label="Space requirements">
                <Input
                  value={spaceRequirements}
                  onChangeText={setSpaceRequirements}
                  placeholder="e.g., 10x10 ft covered area, 6-ft table"
                />
              </Field>
              <Field label="Power requirements">
                <Input
                  value={powerRequirements}
                  onChangeText={setPowerRequirements}
                  placeholder="e.g., Two 120V outlets within 25 ft"
                />
              </Field>
              <Field label="Load-in / setup time">
                <Input
                  value={loadInTime}
                  onChangeText={setLoadInTime}
                  placeholder="e.g., 90 minutes before start"
                />
              </Field>
              <Field label="Parking / load-in access">
                <Input
                  value={parkingAccess}
                  onChangeText={setParkingAccess}
                  placeholder="e.g., Loading dock or close parking needed"
                />
              </Field>
              <Field label="Travel / delivery available?">
                <ChipSingle
                  options={yesNo}
                  selected={travelAvailable}
                  onChange={(v) => setTravelAvailable(v as typeof travelAvailable)}
                />
              </Field>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <StepTitle title="Pricing" sub="Where your pricing starts." />
              <Field label="Pricing type">
                <ChipSingle
                  options={PRICING_TYPES}
                  selected={pricingType}
                  onChange={setPricingType}
                />
              </Field>
              <Field label="Starting price (USD)" required>
                <Input
                  value={priceMin}
                  onChangeText={(v) => setPriceMin(v.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g., 800"
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="Packages available?">
                <ChipSingle
                  options={yesNo}
                  selected={packagesAvailable}
                  onChange={(v) => setPackagesAvailable(v as typeof packagesAvailable)}
                />
              </Field>
              <Field label="What's included in the starting price">
                <Input
                  value={priceIncludes}
                  onChangeText={setPriceIncludes}
                  placeholder="e.g., 4 hours, sound system, setup"
                  multiline
                />
              </Field>

              <StepTitle title="Policies & notes" sub="The fine print clients should know." topGap />
              <Field label="Travel fees">
                <Input
                  value={travelFees}
                  onChangeText={setTravelFees}
                  placeholder="e.g., Free within 30 miles, $1/mile after"
                />
              </Field>
              <Field label="Overtime / extra time">
                <Input
                  value={overtime}
                  onChangeText={setOvertime}
                  placeholder="e.g., $150/hr past booked time"
                />
              </Field>
              <Field label="Additional fees (travel, overtime, etc.)">
                <Input
                  value={additionalFees}
                  onChangeText={setAdditionalFees}
                  placeholder="e.g., Lighting add-on $200"
                  multiline
                />
              </Field>
              <Field label="Cancellation / rescheduling policy">
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder="e.g., Deposit refundable up to 30 days out"
                  multiline
                />
              </Field>
              <Field label="Deposit / payment terms">
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder="e.g., 25% deposit to book, balance day-of"
                />
              </Field>
              <Field label="Other important notes">
                <Input
                  value={otherNotes}
                  onChangeText={setOtherNotes}
                  placeholder="Anything else clients should know"
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <StepTitle
                title="Photos & media"
                sub="Add a short video or demo reel — listings with media get 3× more inquiries."
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label="Video / demo reel (optional)">
                <Input
                  value={videoUrl}
                  onChangeText={setVideoUrl}
                  placeholder="https://youtube.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label="Audio samples (optional)">
                <Input
                  value={audioUrl}
                  onChangeText={setAudioUrl}
                  placeholder="https://soundcloud.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label="Rider / tech sheet link (optional)">
                <Input
                  value={riderUrl}
                  onChangeText={setRiderUrl}
                  placeholder="https://drive.google.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>

              <StepTitle title="FAQs" sub="Answer what clients will ask first." topGap />
              <FaqsSection vendorId={profile.id} />

              <StepTitle title="Review" sub="Almost there." topGap />
              <ReviewChecklist missing={missingForPublish()} />
            </>
          ) : null}

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
                  style={darkPillFor(busy)}
                >
                  <Text style={darkPillText}>{busy ? "Saving…" : "Save changes"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={withdrawToDraft}
                  disabled={busy}
                  activeOpacity={0.7}
                  style={lightPillFor(busy)}
                >
                  <Text style={lightPillText}>Withdraw to draft</Text>
                </TouchableOpacity>
              </>
            ) : status === "approved" ? (
              <TouchableOpacity
                onPress={saveChanges}
                disabled={busy}
                activeOpacity={0.85}
                style={darkPillFor(busy)}
              >
                <Text style={darkPillText}>{busy ? "Saving…" : "Save changes"}</Text>
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
                  style={lightPillFor(busy)}
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
                <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 14}}>
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
                <Text style={{ fontFamily: "LibreBaskerville-Bold", color: "#dc2828", fontSize: 14}}>
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
