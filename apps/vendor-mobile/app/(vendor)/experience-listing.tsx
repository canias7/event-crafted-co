// Experiences listing wizard — the category-specific builder for the
// Experiences group (Tastings, Specialty Services). Built to the user's
// reference design: five steps — Basics · About · Details · Pricing ·
// Review — with heavy "make it yours" customization: every chip group
// accepts custom entries, what's-included and tags are fully
// vendor-defined, and a CustomFieldsEditor lets vendors add any field,
// activity, or policy of their own.
//
// Storage: answers live in vendor_profiles.category_details (jsonb).
// Marketplace-native fields keep their real columns: business_name,
// location, price_min_cents, pricing_models/custom_pricing. Photos &
// FAQs reuse the generic builder's tables and components.

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
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
  TagList,
  ReviewChecklist,
  useBrandDialog,
  ListingPhotosGrid,
  CategoryField,
  CategoryPickerModal,
  CustomFieldsEditor,
  cleanCustomFields,
  editorRouteFor,
  darkPill,
  darkPillText,
  lightPill,
  lightPillText,
} from "@/components/listing/WizardKit";
import type { CustomField } from "@/components/listing/WizardKit";

// This file's own route — category changes that resolve elsewhere hand
// the listing over.
const THIS_ROUTE = "experience-listing";

const STEPS = ["Basics", "About", "Details", "Pricing", "Review"] as const;

const EXPERIENCE_TYPES = [
  "Workshop / Class",
  "Tour / Sightseeing",
  "Food & Drink",
  "Wellness / Fitness",
  "Adventure / Outdoor",
  "Art / Creative",
  "Cultural / Educational",
  "Team Building",
  "Personalized Experience",
];
const BEST_FOR = [
  "Weddings",
  "Parties",
  "Corporate events",
  "Date nights",
  "Team outings",
  "Private groups",
];
const SKILL_LEVELS = ["Any level", "Beginner friendly", "Intermediate", "Advanced"];
const LOCATION_MODES = ["We come to you", "At our location", "Both"];
const PRICING_TYPES = ["Per person", "Per group", "Flat rate", "Custom"];

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

export default function ExperienceListingScreen() {
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
  const [businessName, setBusinessName] = useState("");
  const [tagline, setTagline] = useState("");
  const [location, setLocation] = useState("");
  const [serviceAreas, setServiceAreas] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [yearsInBusiness, setYearsInBusiness] = useState("");

  // About
  const [description, setDescription] = useState("");
  const [whatYouOffer, setWhatYouOffer] = useState("");
  const [bestFor, setBestFor] = useState<string[]>([]);
  const [unique, setUnique] = useState("");

  // Details
  const [experienceTypes, setExperienceTypes] = useState<string[]>([]);
  const [duration, setDuration] = useState("");
  const [groupMin, setGroupMin] = useState("");
  const [groupMax, setGroupMax] = useState("");
  const [ageRequirements, setAgeRequirements] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [included, setIncluded] = useState<string[]>([]);
  const [equipmentProvided, setEquipmentProvided] = useState("");
  const [staffIncluded, setStaffIncluded] = useState<"Yes" | "No" | "">("");
  const [locationMode, setLocationMode] = useState("");
  const [travelFees, setTravelFees] = useState("");
  const [spaceRequirements, setSpaceRequirements] = useState("");
  const [weather, setWeather] = useState("");
  const [leadTime, setLeadTime] = useState("");

  // Pricing + policies
  const [pricingType, setPricingType] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [additionalFees, setAdditionalFees] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [liability, setLiability] = useState("");
  const [healthSafety, setHealthSafety] = useState("");
  const [otherNotes, setOtherNotes] = useState("");

  // Make it yours — anywhere-custom
  const [tags, setTags] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  // Review
  const [itineraryUrl, setItineraryUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
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
      setBusinessName(row.business_name ?? "");
      setTagline(d.tagline ?? "");
      setLocation(row.location ?? "");
      setServiceAreas(d.service_areas ?? "");
      setWebsite(d.website ?? "");
      setInstagram(d.instagram ?? "");
      setYearsInBusiness(d.years_in_business ?? "");
      setDescription(d.description ?? "");
      setWhatYouOffer(d.what_you_offer ?? "");
      setBestFor(Array.isArray(d.best_for) ? d.best_for : []);
      setUnique(d.unique ?? "");
      setExperienceTypes(
        Array.isArray(d.experience_types) ? d.experience_types : [],
      );
      setDuration(d.duration ?? "");
      setGroupMin(d.group_min ?? "");
      setGroupMax(d.group_max ?? "");
      setAgeRequirements(d.age_requirements ?? "");
      setSkillLevel(d.skill_level ?? "");
      setIncluded(Array.isArray(d.included) ? d.included : []);
      setEquipmentProvided(d.equipment_provided ?? "");
      setStaffIncluded(d.staff_included ?? "");
      setLocationMode(d.location_mode ?? "");
      setTravelFees(d.travel_fees ?? "");
      setSpaceRequirements(d.space_requirements ?? "");
      setWeather(d.weather ?? "");
      setLeadTime(d.lead_time ?? "");
      setPricingType(d.pricing_type ?? "");
      setPriceMin(
        row.price_min_cents != null ? String(row.price_min_cents / 100) : "",
      );
      setMinSpend(d.min_spend ?? "");
      setAdditionalFees(d.additional_fees ?? "");
      setPaymentSchedule(d.payment_schedule ?? "");
      setCancellationPolicy(d.cancellation_policy ?? "");
      setLiability(d.liability ?? "");
      setHealthSafety(d.health_safety ?? "");
      setOtherNotes(d.other_notes ?? "");
      setTags(Array.isArray(d.tags) ? d.tags : []);
      setCustomFields(Array.isArray(d.custom_fields) ? d.custom_fields : []);
      setItineraryUrl(d.itinerary_url ?? "");
      setVideoUrl(d.video_url ?? "");
    }
    setLoading(false);
  }, [user, routeId]);

  useEffect(() => {
    load();
  }, [load]);

  function detailsPayload() {
    return {
      group: "experiences",
      tagline: tagline.trim(),
      service_areas: serviceAreas.trim(),
      website: website.trim(),
      instagram: instagram.trim(),
      years_in_business: yearsInBusiness.trim(),
      description: description.trim(),
      what_you_offer: whatYouOffer.trim(),
      best_for: bestFor,
      unique: unique.trim(),
      experience_types: experienceTypes,
      duration: duration.trim(),
      group_min: groupMin.trim(),
      group_max: groupMax.trim(),
      age_requirements: ageRequirements.trim(),
      skill_level: skillLevel,
      included,
      equipment_provided: equipmentProvided.trim(),
      staff_included: staffIncluded,
      location_mode: locationMode,
      travel_fees: travelFees.trim(),
      space_requirements: spaceRequirements.trim(),
      weather: weather.trim(),
      lead_time: leadTime.trim(),
      pricing_type: pricingType,
      min_spend: minSpend.trim(),
      additional_fees: additionalFees.trim(),
      payment_schedule: paymentSchedule.trim(),
      cancellation_policy: cancellationPolicy.trim(),
      liability: liability.trim(),
      health_safety: healthSafety.trim(),
      other_notes: otherNotes.trim(),
      tags,
      custom_fields: cleanCustomFields(customFields),
      itinerary_url: itineraryUrl.trim(),
      video_url: videoUrl.trim(),
    };
  }

  async function persist(status?: "pending" | "draft"): Promise<boolean> {
    if (!profile?.id) return false;
    const minCents = priceMin
      ? Math.round(Number.parseFloat(priceMin) * 100)
      : null;
    const pricingModels =
      pricingType === "Per person"
        ? ["per_person"]
        : pricingType === "Per group" || pricingType === "Flat rate"
          ? ["starting_at"]
          : pricingType === "Custom"
            ? ["custom_quote"]
            : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        category: profile.category || "Tastings",
        business_name: businessName.trim() || null,
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
    if (!businessName.trim()) missing.push("Business / listing name");
    if (!tagline.trim()) missing.push("Short tagline");
    if (!location.trim()) missing.push("Location");
    if (!serviceAreas.trim()) missing.push("Service areas");
    if (!yearsInBusiness.trim()) missing.push("Years in business");
    if (!description.trim()) missing.push("Full description");
    if (experienceTypes.length === 0)
      missing.push("Experience type (at least one)");
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
  // category that resolves elsewhere hands the listing to that editor.
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
    Alert.alert(
      "Delete this listing?",
      "All photos, packages, FAQs, and inquiries tied to this listing will be permanently removed. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
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
        },
      ],
    );
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
                sub="Tell clients the essentials about your experience."
              />
              <CategoryField
                value={profile.category}
                onPress={() => setCategoryPickerOpen(true)}
              />
              <Field label="Business / listing name" required>
                <Input
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder="e.g., Coastal Wine Tour Experiences"
                />
              </Field>
              <Field label="Short tagline" required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder="e.g., Taste. Explore. Make Memories."
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
                title="About your experience"
                sub="Make clients feel what booking you is like."
              />
              <Field label="Full description" required>
                <Input
                  value={description}
                  onChangeText={(v) => setDescription(v.slice(0, 1000))}
                  placeholder="Describe the experience from arrival to send-off…"
                  multiline
                />
              </Field>
              <Field label="What you offer (one line)">
                <Input
                  value={whatYouOffer}
                  onChangeText={setWhatYouOffer}
                  placeholder="e.g., Guided tastings with a certified sommelier"
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
              <Field label="What makes you unique">
                <Input
                  value={unique}
                  onChangeText={(v) => setUnique(v.slice(0, 500))}
                  placeholder="Highlight what makes your experience one-of-a-kind — unique activities get 3x more bookings."
                  multiline
                />
              </Field>
              <Field label="Tags & highlights (shown on your listing)">
                <TagList
                  items={tags}
                  onChange={setTags}
                  placeholder="Add a tag — e.g., BYOB friendly, sunset slot"
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title="Experience details"
                sub="Tell clients more about your experience."
              />
              <Field label="Experience type (select all that apply)" required>
                <ChipMulti
                  options={EXPERIENCE_TYPES}
                  selected={experienceTypes}
                  onChange={setExperienceTypes}
                  allowCustom
                />
              </Field>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Duration" required>
                    <Input
                      value={duration}
                      onChangeText={setDuration}
                      placeholder="e.g., 2 hours"
                    />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Group size (min – max)">
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Input
                          value={groupMin}
                          onChangeText={(v) => setGroupMin(v.replace(/[^0-9]/g, ""))}
                          placeholder="Min"
                          keyboardType="number-pad"
                        />
                      </View>
                      <Text style={{ color: INK_DIM }}>–</Text>
                      <View style={{ flex: 1 }}>
                        <Input
                          value={groupMax}
                          onChangeText={(v) => setGroupMax(v.replace(/[^0-9]/g, ""))}
                          placeholder="Max"
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                  </Field>
                </View>
              </View>
              <Field label="Age requirements (if any)">
                <Input
                  value={ageRequirements}
                  onChangeText={setAgeRequirements}
                  placeholder="e.g., 18+"
                />
              </Field>
              <Field label="Skill level required (if any)">
                <ChipSingle
                  options={SKILL_LEVELS}
                  selected={skillLevel}
                  onChange={setSkillLevel}
                />
              </Field>

              <StepTitle
                title="What's included"
                sub="Add anything — it's your experience."
                topGap
              />
              <Field label="What's included in the experience">
                <TagList
                  items={included}
                  onChange={setIncluded}
                  placeholder="Add an item — e.g., All tastings, take-home kit"
                />
              </Field>
              <Field label="Equipment / materials provided">
                <Input
                  value={equipmentProvided}
                  onChangeText={setEquipmentProvided}
                  placeholder="e.g., Glassware, aprons, all supplies"
                  multiline
                />
              </Field>
              <Field label="Staff / guide included?">
                <ChipSingle
                  options={yesNo}
                  selected={staffIncluded}
                  onChange={(v) => setStaffIncluded(v as typeof staffIncluded)}
                />
              </Field>

              <StepTitle
                title="Logistics & requirements"
                sub="How hosting works."
                topGap
              />
              <Field label="Where does it happen?">
                <ChipSingle
                  options={LOCATION_MODES}
                  selected={locationMode}
                  onChange={setLocationMode}
                />
              </Field>
              <Field label="Travel fees">
                <Input
                  value={travelFees}
                  onChangeText={setTravelFees}
                  placeholder="e.g., Free within 25 miles, $1/mile beyond"
                />
              </Field>
              <Field label="Access / space requirements">
                <Input
                  value={spaceRequirements}
                  onChangeText={setSpaceRequirements}
                  placeholder="e.g., Table space for 12, access to power"
                />
              </Field>
              <Field label="Weather considerations">
                <Input
                  value={weather}
                  onChangeText={setWeather}
                  placeholder="e.g., Covered area needed if outdoors"
                />
              </Field>
              <Field label="Lead time required">
                <Input
                  value={leadTime}
                  onChangeText={setLeadTime}
                  placeholder="e.g., 2 weeks notice"
                />
              </Field>

              <StepTitle
                title="Make it yours"
                sub="Add any custom field, activity, or policy — anything the form didn't ask."
                topGap
              />
              <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />
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
                  placeholder="e.g., 75"
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="Minimum spend / group size">
                <Input
                  value={minSpend}
                  onChangeText={setMinSpend}
                  placeholder="e.g., $500 minimum or 6 guests"
                />
              </Field>
              <Field label="Additional fees (travel, overtime, etc.)">
                <Input
                  value={additionalFees}
                  onChangeText={setAdditionalFees}
                  placeholder="e.g., Weekend surcharge $50"
                />
              </Field>
              <Field label="Deposit / payment terms">
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder="e.g., 50% to book, balance day-of"
                />
              </Field>

              <StepTitle title="Policies & notes" sub="The fine print." topGap />
              <Field label="Cancellation / rescheduling policy">
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder="e.g., Full refund up to 7 days out"
                  multiline
                />
              </Field>
              <Field label="Age waiver / liability">
                <Input
                  value={liability}
                  onChangeText={setLiability}
                  placeholder="e.g., Waiver signed at booking"
                />
              </Field>
              <Field label="Health / safety requirements">
                <Input
                  value={healthSafety}
                  onChangeText={setHealthSafety}
                  placeholder="e.g., Allergies collected in advance"
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
                sub="Show the moment — guests mid-experience beats empty setups."
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label="Itinerary / details PDF (optional)">
                <Input
                  value={itineraryUrl}
                  onChangeText={setItineraryUrl}
                  placeholder="https://drive.google.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label="Video (optional)">
                <Input
                  value={videoUrl}
                  onChangeText={setVideoUrl}
                  placeholder="https://youtube.com/…"
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
