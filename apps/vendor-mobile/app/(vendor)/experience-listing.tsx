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
import { useT } from "@/lib/i18n";
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
  darkPillFor,
  darkPillText,
  lightPill,
  lightPillFor,
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
  const { t: tw, tObject: twObject } = useT("listingWizard");
  const { t, tObject } = useT("experienceListing");
  // Options are saved in English; chips show them in the app's language.
  const valueLabels: Record<string, string> = {
    ...(twObject<Record<string, string>>("values") ?? {}),
    ...(tObject<Record<string, string>>("values") ?? {}),
  };
  const chipLabel = (v: string) => valueLabels[v] ?? v;
  const chipLabels = (opts: readonly string[]) => opts.map(chipLabel);
  const chipValue = (opts: readonly string[], label: string) =>
    opts.find((o) => chipLabel(o) === label) ?? label;

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
      dialog.show({ icon: "alert-circle", title: tw("dialogs.saveFailed"), message: error.message });
      return false;
    }
    if (status) {
      setProfile((p) => (p ? { ...p, application_status: status } : p));
    }
    return true;
  }

  function missingForPublish(): string[] {
    const missing: string[] = [];
    if (!businessName.trim()) missing.push(tw("missing.businessListingName"));
    if (!tagline.trim()) missing.push(tw("missing.shortTagline"));
    if (!location.trim()) missing.push(tw("missing.location"));
    if (!serviceAreas.trim()) missing.push(tw("missing.serviceAreas"));
    if (!yearsInBusiness.trim()) missing.push(tw("missing.yearsInBusiness"));
    if (!description.trim()) missing.push(tw("missing.fullDescription"));
    if (experienceTypes.length === 0)
      missing.push(t("missing.experienceTypeAtLeastOne"));
    if (
      pricingType !== "Custom" &&
      (!priceMin.trim() || Number.parseFloat(priceMin) <= 0)
    )
      missing.push(tw("missing.startingPriceOrChooseCustomPricing"));
    if (photoCount < MIN_PHOTOS) missing.push(tw("missing.minPhotos", { count: MIN_PHOTOS }));
    return missing;
  }

  async function saveDraftHeader() {
    if (busy) return;
    setBusy(true);
    const ok = await persist();
    setBusy(false);
    if (ok) dialog.show({ title: tw("dialogs.saved"), message: tw("dialogs.savedMessage") });
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
        title: tw("dialogs.categoryFailed"),
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
        title: tw("dialogs.cantPublish"),
        message: tw("dialogs.cantPublishMessage", {
          list: missing.map((m) => `• ${m}`).join("\n"),
        }),
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
      title: tw("dialogs.submitted"),
      message: tw("dialogs.submittedMessage"),
      buttonLabel: tw("dialogs.done"),
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
        title: tw("dialogs.savedAsDraft"),
        message: tw("dialogs.savedAsDraftMessage"),
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
        title: tw("dialogs.changesSaved"),
        message: tw("dialogs.changesSavedMessage"),
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
      title: tw("dialogs.deleteTitle"),
      message: tw("dialogs.deleteMessage"),
      confirmLabel: tw("deleteListing"),
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
            title: tw("dialogs.deleteFailed"),
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
          <Text style={{ fontFamily: SERIF, color: INK_DIM }}>{tw("loading")}</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ fontFamily: SERIF, color: INK_DIM, textAlign: "center" }}>
            {tw("loadFailed")}
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
        behavior="padding"
      >
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
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 24,
              color: INK,
            }}
          >
            {status === "draft" ? tw("newListing") : tw("editListing")}
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
            <Text style={{ fontFamily: "LibreBaskerville-Bold", fontSize: 13, color: INK }}>
              {status === "draft" ? tw("saveDraft") : tw("save")}
            </Text>
          </TouchableOpacity>
        </View>

        <StepRail steps={chipLabels(STEPS)} step={step} onJump={setStep} />

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
                title={tw("headings.basics")}
                sub={t("subs.tellClientsTheEssentialsAboutYour")}
              />
              <CategoryField
                value={profile.category}
                onPress={() => setCategoryPickerOpen(true)}
              />
              <Field label={tw("labels.businessListingName")} required>
                <Input
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder={t("placeholders.egCoastalWineTourExperiences")}
                />
              </Field>
              <Field label={tw("labels.shortTagline")} required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder={t("placeholders.egTasteExploreMakeMemories")}
                />
              </Field>
              <Field label={tw("labels.location")} required>
                <Input
                  value={location}
                  onChangeText={setLocation}
                  placeholder={tw("placeholders.enterCityOrZipCode")}
                />
              </Field>
              <Field label={tw("labels.serviceAreasCitiesRegionsStates")} required>
                <Input
                  value={serviceAreas}
                  onChangeText={setServiceAreas}
                  placeholder={tw("placeholders.addAreas")}
                />
              </Field>
              <Field label={tw("labels.website")}>
                <Input
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="www.yourwebsite.com"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label={tw("labels.instagramOptional")}>
                <Input
                  value={instagram}
                  onChangeText={setInstagram}
                  placeholder="@yourhandle"
                  autoCapitalize="none"
                />
              </Field>
              <Field label={tw("labels.yearsInBusiness")} required>
                <Input
                  value={yearsInBusiness}
                  onChangeText={(v) => setYearsInBusiness(v.replace(/[^0-9]/g, "").slice(0, 3))}
                  placeholder={tw("placeholders.eg5")}
                  keyboardType="number-pad"
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <StepTitle
                title={t("headings.aboutYourExperience")}
                sub={t("subs.makeClientsFeelWhatBookingYou")}
              />
              <Field label={tw("labels.fullDescription")} required>
                <Input
                  value={description}
                  onChangeText={(v) => setDescription(v.slice(0, 1000))}
                  placeholder={t("placeholders.describeTheExperienceFromArrivalTo")}
                  multiline
                />
              </Field>
              <Field label={tw("labels.whatYouOfferOneLine")}>
                <Input
                  value={whatYouOffer}
                  onChangeText={setWhatYouOffer}
                  placeholder={t("placeholders.egGuidedTastingsWithACertified")}
                />
              </Field>
              <Field label={tw("labels.bestForSelectAllThatApply")}>
                <ChipMulti
                  options={chipLabels(BEST_FOR)}
                  selected={bestFor.map(chipLabel)}
                  onChange={(next) => setBestFor(next.map((l) => chipValue(BEST_FOR, l)))}
                  allowCustom
                />
              </Field>
              <Field label={tw("labels.whatMakesYouUnique")}>
                <Input
                  value={unique}
                  onChangeText={(v) => setUnique(v.slice(0, 500))}
                  placeholder={t("placeholders.highlightWhatMakesYourExperienceOne")}
                  multiline
                />
              </Field>
              <Field label={tw("labels.tagsHighlightsShownOnYourListing")}>
                <TagList
                  items={tags}
                  onChange={setTags}
                  placeholder={t("placeholders.addATagEGByob")}
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title={t("headings.experienceDetails")}
                sub={t("subs.tellClientsMoreAboutYourExperience")}
              />
              <Field label={t("labels.experienceTypeSelectAllThatApply")} required>
                <ChipMulti
                  options={chipLabels(EXPERIENCE_TYPES)}
                  selected={experienceTypes.map(chipLabel)}
                  onChange={(next) => setExperienceTypes(next.map((l) => chipValue(EXPERIENCE_TYPES, l)))}
                  allowCustom
                />
              </Field>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label={t("labels.duration")} required>
                    <Input
                      value={duration}
                      onChangeText={setDuration}
                      placeholder={t("placeholders.eg2Hours")}
                    />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label={t("labels.groupSizeMinMax")}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Input
                          value={groupMin}
                          onChangeText={(v) => setGroupMin(v.replace(/[^0-9]/g, ""))}
                          placeholder={tw("placeholders.min")}
                          keyboardType="number-pad"
                        />
                      </View>
                      <Text style={{ fontFamily: SERIF, color: INK_DIM }}>–</Text>
                      <View style={{ flex: 1 }}>
                        <Input
                          value={groupMax}
                          onChangeText={(v) => setGroupMax(v.replace(/[^0-9]/g, ""))}
                          placeholder={tw("placeholders.max")}
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                  </Field>
                </View>
              </View>
              <Field label={t("labels.ageRequirementsIfAny")}>
                <Input
                  value={ageRequirements}
                  onChangeText={setAgeRequirements}
                  placeholder={t("placeholders.eg18")}
                />
              </Field>
              <Field label={t("labels.skillLevelRequiredIfAny")}>
                <ChipSingle
                  options={chipLabels(SKILL_LEVELS)}
                  selected={chipLabel(skillLevel)}
                  onChange={(l) => setSkillLevel(chipValue(SKILL_LEVELS, l))}
                />
              </Field>

              <StepTitle
                title={tw("headings.whatsIncluded")}
                sub={t("subs.addAnythingItsYourExperience")}
                topGap
              />
              <Field label={t("labels.whatsIncludedInTheExperience")}>
                <TagList
                  items={included}
                  onChange={setIncluded}
                  placeholder={t("placeholders.addAnItemEGAll")}
                />
              </Field>
              <Field label={t("labels.equipmentMaterialsProvided")}>
                <Input
                  value={equipmentProvided}
                  onChangeText={setEquipmentProvided}
                  placeholder={t("placeholders.egGlasswareApronsAllSupplies")}
                  multiline
                />
              </Field>
              <Field label={t("labels.staffGuideIncluded")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(staffIncluded)}
                  onChange={(v) => setStaffIncluded(chipValue(yesNo, v) as typeof staffIncluded)}
                />
              </Field>

              <StepTitle
                title={tw("headings.logisticsRequirements")}
                sub={t("subs.howHostingWorks")}
                topGap
              />
              <Field label={t("labels.whereDoesItHappen")}>
                <ChipSingle
                  options={chipLabels(LOCATION_MODES)}
                  selected={chipLabel(locationMode)}
                  onChange={(l) => setLocationMode(chipValue(LOCATION_MODES, l))}
                />
              </Field>
              <Field label={tw("labels.travelFees")}>
                <Input
                  value={travelFees}
                  onChangeText={setTravelFees}
                  placeholder={t("placeholders.egFreeWithin25Miles1")}
                />
              </Field>
              <Field label={t("labels.accessSpaceRequirements")}>
                <Input
                  value={spaceRequirements}
                  onChangeText={setSpaceRequirements}
                  placeholder={t("placeholders.egTableSpaceFor12Access")}
                />
              </Field>
              <Field label={t("labels.weatherConsiderations")}>
                <Input
                  value={weather}
                  onChangeText={setWeather}
                  placeholder={t("placeholders.egCoveredAreaNeededIfOutdoors")}
                />
              </Field>
              <Field label={tw("labels.leadTimeRequired")}>
                <Input
                  value={leadTime}
                  onChangeText={setLeadTime}
                  placeholder={tw("placeholders.eg2WeeksNotice")}
                />
              </Field>

              <StepTitle
                title={tw("headings.makeItYours")}
                sub={t("subs.addAnyCustomFieldActivityOr")}
                topGap
              />
              <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />
            </>
          ) : null}

          {step === 3 ? (
            <>
              <StepTitle title={tw("headings.pricing")} sub={tw("subs.whereYourPricingStarts")} />
              <Field label={tw("labels.pricingType")}>
                <ChipSingle
                  options={chipLabels(PRICING_TYPES)}
                  selected={chipLabel(pricingType)}
                  onChange={(l) => setPricingType(chipValue(PRICING_TYPES, l))}
                />
              </Field>
              <Field label={tw("labels.startingPriceUsd")} required>
                <Input
                  value={priceMin}
                  onChangeText={(v) => setPriceMin(v.replace(/[^0-9.]/g, ""))}
                  placeholder={t("placeholders.eg75")}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label={t("labels.minimumSpendGroupSize")}>
                <Input
                  value={minSpend}
                  onChangeText={setMinSpend}
                  placeholder={t("placeholders.eg500MinimumOr6Guests")}
                />
              </Field>
              <Field label={tw("labels.additionalFeesTravelOvertimeEtc")}>
                <Input
                  value={additionalFees}
                  onChangeText={setAdditionalFees}
                  placeholder={t("placeholders.egWeekendSurcharge50")}
                />
              </Field>
              <Field label={tw("labels.depositPaymentTerms")}>
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder={t("placeholders.eg50ToBookBalanceDay")}
                />
              </Field>

              <StepTitle title={tw("headings.policiesNotes")} sub={tw("subs.theFinePrint")} topGap />
              <Field label={tw("labels.cancellationReschedulingPolicy")}>
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder={tw("placeholders.egFullRefundUpTo7")}
                  multiline
                />
              </Field>
              <Field label={t("labels.ageWaiverLiability")}>
                <Input
                  value={liability}
                  onChangeText={setLiability}
                  placeholder={t("placeholders.egWaiverSignedAtBooking")}
                />
              </Field>
              <Field label={t("labels.healthSafetyRequirements")}>
                <Input
                  value={healthSafety}
                  onChangeText={setHealthSafety}
                  placeholder={t("placeholders.egAllergiesCollectedInAdvance")}
                />
              </Field>
              <Field label={tw("labels.otherImportantNotes")}>
                <Input
                  value={otherNotes}
                  onChangeText={setOtherNotes}
                  placeholder={tw("placeholders.anythingElseClientsShouldKnow")}
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <StepTitle
                title={tw("headings.photosMedia")}
                sub={t("subs.showTheMomentGuestsMidExperience")}
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label={t("labels.itineraryDetailsPdfOptional")}>
                <Input
                  value={itineraryUrl}
                  onChangeText={setItineraryUrl}
                  placeholder="https://drive.google.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label={tw("labels.videoOptional")}>
                <Input
                  value={videoUrl}
                  onChangeText={setVideoUrl}
                  placeholder="https://youtube.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>

              <StepTitle title={tw("headings.faqs")} sub={tw("subs.answerWhatClientsWillAskFirst")} topGap />
              <FaqsSection vendorId={profile.id} />

              <StepTitle title={tw("headings.review")} sub={tw("subs.almostThere")} topGap />
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
                <Text style={darkPillText}>{tw("continue")}</Text>
              </TouchableOpacity>
            ) : status === "pending" ? (
              <>
                <TouchableOpacity
                  onPress={saveChanges}
                  disabled={busy}
                  activeOpacity={0.85}
                  style={darkPillFor(busy)}
                >
                  <Text style={darkPillText}>{busy ? tw("saving") : tw("saveChanges")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={withdrawToDraft}
                  disabled={busy}
                  activeOpacity={0.7}
                  style={lightPillFor(busy)}
                >
                  <Text style={lightPillText}>{tw("withdrawToDraft")}</Text>
                </TouchableOpacity>
              </>
            ) : status === "approved" ? (
              <TouchableOpacity
                onPress={saveChanges}
                disabled={busy}
                activeOpacity={0.85}
                style={darkPillFor(busy)}
              >
                <Text style={darkPillText}>{busy ? tw("saving") : tw("saveChanges")}</Text>
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
                      ? tw("publishing")
                      : status === "rejected"
                        ? tw("resubmit")
                        : tw("publish")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveDraftHeader}
                  disabled={busy}
                  activeOpacity={0.7}
                  style={lightPillFor(busy)}
                >
                  <Text style={lightPillText}>{tw("saveDraft")}</Text>
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
                  {tw("backTo", { step: chipLabel(STEPS[step - 1]) })}
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
                <Text style={{ fontFamily: "LibreBaskerville-Bold", color: "#b23a34", fontSize: 14}}>
                  {tw("deleteListing")}
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
