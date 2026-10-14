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
  const { t: tw, tObject: twObject } = useT("listingWizard");
  const { t, tObject } = useT("entertainmentListing");
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
    if (!actName.trim()) missing.push(t("missing.actBusinessName"));
    if (!tagline.trim()) missing.push(tw("missing.shortTagline"));
    if (!location.trim()) missing.push(tw("missing.location"));
    if (!serviceAreas.trim()) missing.push(tw("missing.serviceAreas"));
    if (!yearsInBusiness.trim()) missing.push(tw("missing.yearsInBusiness"));
    if (!description.trim()) missing.push(tw("missing.fullDescription"));
    if (whatYouDo.length === 0) missing.push(t("missing.whatYouDoAtLeastOne"));
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
              <Field label={t("labels.actBusinessName")} required>
                <Input
                  value={actName}
                  onChangeText={setActName}
                  placeholder={t("placeholders.egDjAlexBeats")}
                />
              </Field>
              <Field label={tw("labels.shortTagline")} required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder={t("placeholders.egHighEnergyDjUnforgettableMoments")}
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
                title={t("headings.aboutYourAct")}
                sub={t("subs.helpClientsKnowWhoYouAre")}
              />
              <Field label={tw("labels.fullDescription")} required>
                <Input
                  value={description}
                  onChangeText={(v) => setDescription(v.slice(0, 1000))}
                  placeholder={t("placeholders.tellClientsAboutYourExperienceStyle")}
                  multiline
                />
              </Field>
              <Field label={t("labels.whatYouDoSelectAllThat")} required>
                <ChipMulti
                  options={chipLabels(WHAT_YOU_DO)}
                  selected={whatYouDo.map(chipLabel)}
                  onChange={(next) => setWhatYouDo(next.map((l) => chipValue(WHAT_YOU_DO, l)))}
                  allowCustom
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
              <Field label={t("labels.styleGenreVibe")}>
                <Input
                  value={styleGenre}
                  onChangeText={setStyleGenre}
                  placeholder={t("placeholders.egTop40JazzAcousticHigh")}
                />
              </Field>
              <Field label={t("labels.whatMakesYouUnique")}>
                <Input
                  value={unique}
                  onChangeText={(v) => setUnique(v.slice(0, 500))}
                  placeholder={t("placeholders.shareWhatSetsYouApartFrom")}
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title={t("headings.performanceDetails")}
                sub={t("subs.whatABookingWithYouLooks")}
              />
              <Field label={t("labels.typeOfPerformanceAct")}>
                <Input
                  value={actType}
                  onChangeText={setActType}
                  placeholder={t("placeholders.egOpenFormatDjSetWith")}
                />
              </Field>
              <Field label={t("labels.typicalPerformanceLength")}>
                <Input
                  value={performanceLength}
                  onChangeText={setPerformanceLength}
                  placeholder={t("placeholders.eg4HoursTwo45Minute")}
                />
              </Field>
              <Field label={t("labels.setOptionsPackages")}>
                <Input
                  value={setOptions}
                  onChangeText={setSetOptions}
                  placeholder={t("placeholders.egCeremonyCocktailHourReception")}
                  multiline
                />
              </Field>
              <Field label={t("labels.numberOfPerformersMembers")}>
                <Input
                  value={performerCount}
                  onChangeText={(v) => setPerformerCount(v.replace(/[^0-9]/g, ""))}
                  placeholder={t("placeholders.eg1")}
                  keyboardType="number-pad"
                />
              </Field>
              <Field label={t("labels.audienceSizeMinMax")}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={audienceMin}
                      onChangeText={(v) => setAudienceMin(v.replace(/[^0-9]/g, ""))}
                      placeholder={tw("placeholders.min")}
                      keyboardType="number-pad"
                    />
                  </View>
                  <Text style={{ fontFamily: SERIF, color: INK_DIM }}>–</Text>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={audienceMax}
                      onChangeText={(v) => setAudienceMax(v.replace(/[^0-9]/g, ""))}
                      placeholder={tw("placeholders.max")}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              </Field>

              <StepTitle title={tw("headings.whatsIncluded")} sub={t("subs.whatComesWithTheBooking")} topGap />
              <Field label={t("labels.whatsIncludedInYourPerformance")}>
                <Input
                  value={included}
                  onChangeText={setIncluded}
                  placeholder={t("placeholders.egMusicCurationRequestsWirelessMics")}
                  multiline
                />
              </Field>
              <Field label={t("labels.equipmentInstrumentsGear")}>
                <Input
                  value={equipment}
                  onChangeText={setEquipment}
                  placeholder={t("placeholders.egPioneerSetup2xQscK12")}
                  multiline
                />
              </Field>
              <Field label={t("labels.soundLightingIncluded")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(soundLighting)}
                  onChange={(v) => setSoundLighting(chipValue(yesNo, v) as typeof soundLighting)}
                />
              </Field>
              <Field label={tw("labels.setupBreakdownIncluded")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(setupIncluded)}
                  onChange={(v) => setSetupIncluded(chipValue(yesNo, v) as typeof setupIncluded)}
                />
              </Field>
              <Field label={t("labels.mcAnnouncementsIncluded")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(mcIncluded)}
                  onChange={(v) => setMcIncluded(chipValue(yesNo, v) as typeof mcIncluded)}
                />
              </Field>

              <StepTitle title={t("headings.requirementsLogistics")} sub={t("subs.whatYouNeedFromTheVenue")} topGap />
              <Field label={t("labels.spaceRequirements")}>
                <Input
                  value={spaceRequirements}
                  onChangeText={setSpaceRequirements}
                  placeholder={t("placeholders.eg10x10FtCoveredArea6")}
                />
              </Field>
              <Field label={t("labels.powerRequirements")}>
                <Input
                  value={powerRequirements}
                  onChangeText={setPowerRequirements}
                  placeholder={t("placeholders.egTwo120vOutletsWithin25")}
                />
              </Field>
              <Field label={t("labels.loadInSetupTime")}>
                <Input
                  value={loadInTime}
                  onChangeText={setLoadInTime}
                  placeholder={t("placeholders.eg90MinutesBeforeStart")}
                />
              </Field>
              <Field label={t("labels.parkingLoadInAccess")}>
                <Input
                  value={parkingAccess}
                  onChangeText={setParkingAccess}
                  placeholder={t("placeholders.egLoadingDockOrCloseParking")}
                />
              </Field>
              <Field label={tw("labels.travelDeliveryAvailable")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(travelAvailable)}
                  onChange={(v) => setTravelAvailable(chipValue(yesNo, v) as typeof travelAvailable)}
                />
              </Field>
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
                  placeholder={t("placeholders.eg800")}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label={tw("labels.packagesAvailable")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(packagesAvailable)}
                  onChange={(v) => setPackagesAvailable(chipValue(yesNo, v) as typeof packagesAvailable)}
                />
              </Field>
              <Field label={tw("labels.whatsIncludedInTheStartingPrice")}>
                <Input
                  value={priceIncludes}
                  onChangeText={setPriceIncludes}
                  placeholder={t("placeholders.eg4HoursSoundSystemSetup")}
                  multiline
                />
              </Field>

              <StepTitle title={tw("headings.policiesNotes")} sub={t("subs.theFinePrintClientsShouldKnow")} topGap />
              <Field label={tw("labels.travelFees")}>
                <Input
                  value={travelFees}
                  onChangeText={setTravelFees}
                  placeholder={t("placeholders.egFreeWithin30Miles1")}
                />
              </Field>
              <Field label={t("labels.overtimeExtraTime")}>
                <Input
                  value={overtime}
                  onChangeText={setOvertime}
                  placeholder={t("placeholders.eg150HrPastBookedTime")}
                />
              </Field>
              <Field label={tw("labels.additionalFeesTravelOvertimeEtc")}>
                <Input
                  value={additionalFees}
                  onChangeText={setAdditionalFees}
                  placeholder={t("placeholders.egLightingAddOn200")}
                  multiline
                />
              </Field>
              <Field label={tw("labels.cancellationReschedulingPolicy")}>
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder={t("placeholders.egDepositRefundableUpTo30")}
                  multiline
                />
              </Field>
              <Field label={tw("labels.depositPaymentTerms")}>
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder={tw("placeholders.eg25DepositToBookBalance")}
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
                sub={t("subs.addAShortVideoOrDemo")}
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label={t("labels.videoDemoReelOptional")}>
                <Input
                  value={videoUrl}
                  onChangeText={setVideoUrl}
                  placeholder="https://youtube.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label={t("labels.audioSamplesOptional")}>
                <Input
                  value={audioUrl}
                  onChangeText={setAudioUrl}
                  placeholder="https://soundcloud.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label={t("labels.riderTechSheetLinkOptional")}>
                <Input
                  value={riderUrl}
                  onChangeText={setRiderUrl}
                  placeholder="https://drive.google.com/…"
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
