// Corporate Services listing wizard — the category-specific builder
// for the Corporate Services group (Staffing, Speakers / Hosts,
// Security, Valet). Follows the same five-step formula as the other
// wizards — Basics · About · Services · Pricing · Review — tailored to
// B2B event services, with the full "make it yours" customization from
// the Experiences form: custom chips everywhere, vendor-defined
// what's-included, tags & highlights, and a CustomFieldsEditor.
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
const THIS_ROUTE = "corporate-listing";

const STEPS = ["Basics", "About", "Services", "Pricing", "Review"] as const;

const SERVICES = [
  "Event Staffing",
  "Waitstaff / Servers",
  "Bartending Staff",
  "Registration / Check-in",
  "Brand Ambassadors",
  "Keynote Speakers",
  "MCs / Hosts",
  "Panel Moderators",
  "Security Guards",
  "Crowd Management",
  "Valet Parking",
  "Shuttle / Transportation",
];
const BEST_FOR = [
  "Conferences",
  "Corporate galas",
  "Product launches",
  "Trade shows",
  "Holiday parties",
  "Weddings & private events",
];
const PRICING_TYPES = ["Per hour", "Per staff member", "Flat rate", "Custom"];

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

export default function CorporateListingScreen() {
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
  const { t, tObject } = useT("corporateListing");
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

  // Services & team
  const [services, setServices] = useState<string[]>([]);
  const [teamSize, setTeamSize] = useState("");
  const [minStaff, setMinStaff] = useState("");
  const [maxStaff, setMaxStaff] = useState("");
  const [uniforms, setUniforms] = useState("");
  const [languages, setLanguages] = useState("");
  const [licenses, setLicenses] = useState("");
  const [backgroundChecks, setBackgroundChecks] = useState<"Yes" | "No" | "">("");
  const [included, setIncluded] = useState<string[]>([]);

  // Logistics
  const [minBooking, setMinBooking] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [travelFees, setTravelFees] = useState("");
  const [requirements, setRequirements] = useState("");

  // Pricing + policies
  const [pricingType, setPricingType] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [overtimeFees, setOvertimeFees] = useState("");
  const [additionalFees, setAdditionalFees] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [insurance, setInsurance] = useState("");
  const [otherNotes, setOtherNotes] = useState("");

  // Make it yours
  const [tags, setTags] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  // Review
  const [brochureUrl, setBrochureUrl] = useState("");
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
      setServices(Array.isArray(d.services) ? d.services : []);
      setTeamSize(d.team_size ?? "");
      setMinStaff(d.min_staff ?? "");
      setMaxStaff(d.max_staff ?? "");
      setUniforms(d.uniforms ?? "");
      setLanguages(d.languages ?? "");
      setLicenses(d.licenses ?? "");
      setBackgroundChecks(d.background_checks ?? "");
      setIncluded(Array.isArray(d.included) ? d.included : []);
      setMinBooking(d.min_booking ?? "");
      setLeadTime(d.lead_time ?? "");
      setTravelFees(d.travel_fees ?? "");
      setRequirements(d.requirements ?? "");
      setPricingType(d.pricing_type ?? "");
      setPriceMin(
        row.price_min_cents != null ? String(row.price_min_cents / 100) : "",
      );
      setOvertimeFees(d.overtime_fees ?? "");
      setAdditionalFees(d.additional_fees ?? "");
      setPaymentSchedule(d.payment_schedule ?? "");
      setCancellationPolicy(d.cancellation_policy ?? "");
      setInsurance(d.insurance ?? "");
      setOtherNotes(d.other_notes ?? "");
      setTags(Array.isArray(d.tags) ? d.tags : []);
      setCustomFields(Array.isArray(d.custom_fields) ? d.custom_fields : []);
      setBrochureUrl(d.brochure_url ?? "");
      setVideoUrl(d.video_url ?? "");
    }
    setLoading(false);
  }, [user, routeId]);

  useEffect(() => {
    load();
  }, [load]);

  function detailsPayload() {
    return {
      group: "corporate-services",
      tagline: tagline.trim(),
      service_areas: serviceAreas.trim(),
      website: website.trim(),
      instagram: instagram.trim(),
      years_in_business: yearsInBusiness.trim(),
      description: description.trim(),
      what_you_offer: whatYouOffer.trim(),
      best_for: bestFor,
      unique: unique.trim(),
      services,
      team_size: teamSize.trim(),
      min_staff: minStaff.trim(),
      max_staff: maxStaff.trim(),
      uniforms: uniforms.trim(),
      languages: languages.trim(),
      licenses: licenses.trim(),
      background_checks: backgroundChecks,
      included,
      min_booking: minBooking.trim(),
      lead_time: leadTime.trim(),
      travel_fees: travelFees.trim(),
      requirements: requirements.trim(),
      pricing_type: pricingType,
      overtime_fees: overtimeFees.trim(),
      additional_fees: additionalFees.trim(),
      payment_schedule: paymentSchedule.trim(),
      cancellation_policy: cancellationPolicy.trim(),
      insurance: insurance.trim(),
      other_notes: otherNotes.trim(),
      tags,
      custom_fields: cleanCustomFields(customFields),
      brochure_url: brochureUrl.trim(),
      video_url: videoUrl.trim(),
    };
  }

  async function persist(status?: "pending" | "draft"): Promise<boolean> {
    if (!profile?.id) return false;
    const minCents = priceMin
      ? Math.round(Number.parseFloat(priceMin) * 100)
      : null;
    const pricingModels =
      pricingType === "Per hour" || pricingType === "Per staff member"
        ? ["hourly"]
        : pricingType === "Flat rate"
          ? ["starting_at"]
          : pricingType === "Custom"
            ? ["custom_quote"]
            : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        category: profile.category || "Staffing",
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
    if (services.length === 0) missing.push(t("missing.servicesOfferedAtLeastOne"));
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
                sub={tw("subs.tellClientsTheEssentialsAboutYour")}
              />
              <CategoryField
                value={profile.category}
                onPress={() => setCategoryPickerOpen(true)}
              />
              <Field label={tw("labels.businessListingName")} required>
                <Input
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder={t("placeholders.egPremierEventStaffingCo")}
                />
              </Field>
              <Field label={tw("labels.shortTagline")} required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder={t("placeholders.egProfessionalTeamsForFlawlessEvents")}
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
                  placeholder={tw("placeholders.eg8")}
                  keyboardType="number-pad"
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <StepTitle
                title={tw("headings.aboutYourBusiness")}
                sub={t("subs.showClientsWhyTeamsBookYou")}
              />
              <Field label={tw("labels.fullDescription")} required>
                <Input
                  value={description}
                  onChangeText={(v) => setDescription(v.slice(0, 1000))}
                  placeholder={t("placeholders.describeYourTeamExperienceAndWhat")}
                  multiline
                />
              </Field>
              <Field label={tw("labels.whatYouOfferOneLine")}>
                <Input
                  value={whatYouOffer}
                  onChangeText={setWhatYouOffer}
                  placeholder={t("placeholders.egTrainedEventStaffForFunctions")}
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
                  placeholder={t("placeholders.shareWhatSetsYourTeamApart")}
                  multiline
                />
              </Field>
              <Field label={tw("labels.tagsHighlightsShownOnYourListing")}>
                <TagList
                  items={tags}
                  onChange={setTags}
                  placeholder={t("placeholders.addATagEGFully")}
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title={t("headings.servicesTeam")}
                sub={t("subs.whatYouProvideAndWhosBehind")}
              />
              <Field label={t("labels.servicesOfferedSelectAllThatApply")} required>
                <ChipMulti
                  options={chipLabels(SERVICES)}
                  selected={services.map(chipLabel)}
                  onChange={(next) => setServices(next.map((l) => chipValue(SERVICES, l)))}
                  allowCustom
                />
              </Field>
              <Field label={t("labels.teamSizeAvailable")}>
                <Input
                  value={teamSize}
                  onChangeText={setTeamSize}
                  placeholder={t("placeholders.eg40TrainedStaffOnRoster")}
                />
              </Field>
              <Field label={t("labels.staffPerEventMinMax")}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={minStaff}
                      onChangeText={(v) => setMinStaff(v.replace(/[^0-9]/g, ""))}
                      placeholder={tw("placeholders.min")}
                      keyboardType="number-pad"
                    />
                  </View>
                  <Text style={{ fontFamily: SERIF, color: INK_DIM }}>–</Text>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={maxStaff}
                      onChangeText={(v) => setMaxStaff(v.replace(/[^0-9]/g, ""))}
                      placeholder={tw("placeholders.max")}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              </Field>
              <Field label={t("labels.uniformsDressCode")}>
                <Input
                  value={uniforms}
                  onChangeText={setUniforms}
                  placeholder={t("placeholders.egAllBlackBrandedPolosBlack")}
                />
              </Field>
              <Field label={t("labels.languagesSpoken")}>
                <Input
                  value={languages}
                  onChangeText={setLanguages}
                  placeholder={t("placeholders.egEnglishSpanish")}
                />
              </Field>
              <Field label={t("labels.licensesCertifications")}>
                <Input
                  value={licenses}
                  onChangeText={setLicenses}
                  placeholder={t("placeholders.egLicensedSecurityTipsCertifiedInsured")}
                  multiline
                />
              </Field>
              <Field label={t("labels.backgroundCheckedStaff")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(backgroundChecks)}
                  onChange={(v) => setBackgroundChecks(chipValue(yesNo, v) as typeof backgroundChecks)}
                />
              </Field>

              <StepTitle
                title={tw("headings.whatsIncluded")}
                sub={t("subs.addAnythingItsYourService")}
                topGap
              />
              <Field label={t("labels.whatsIncludedInABooking")}>
                <TagList
                  items={included}
                  onChange={setIncluded}
                  placeholder={t("placeholders.addAnItemEGOn")}
                />
              </Field>

              <StepTitle
                title={tw("headings.logisticsRequirements")}
                sub={t("subs.howBookingWorks")}
                topGap
              />
              <Field label={t("labels.minimumBookingHoursStaff")}>
                <Input
                  value={minBooking}
                  onChangeText={setMinBooking}
                  placeholder={t("placeholders.eg4HourMinimum2Staff")}
                />
              </Field>
              <Field label={tw("labels.leadTimeRequired")}>
                <Input
                  value={leadTime}
                  onChangeText={setLeadTime}
                  placeholder={t("placeholders.eg1WeekNotice3Weeks")}
                />
              </Field>
              <Field label={tw("labels.travelFees")}>
                <Input
                  value={travelFees}
                  onChangeText={setTravelFees}
                  placeholder={t("placeholders.egFreeWithin30Miles")}
                />
              </Field>
              <Field label={t("labels.requirementsFromTheClient")}>
                <Input
                  value={requirements}
                  onChangeText={setRequirements}
                  placeholder={t("placeholders.egStagingAreaForValetBreak")}
                  multiline
                />
              </Field>

              <StepTitle
                title={tw("headings.makeItYours")}
                sub={t("subs.addAnyCustomFieldServiceOr")}
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
                  placeholder={tw("placeholders.eg45")}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label={t("labels.overtimeRates")}>
                <Input
                  value={overtimeFees}
                  onChangeText={setOvertimeFees}
                  placeholder={t("placeholders.eg15xAfter8Hours")}
                />
              </Field>
              <Field label={t("labels.additionalFeesTravelHolidaysEtc")}>
                <Input
                  value={additionalFees}
                  onChangeText={setAdditionalFees}
                  placeholder={t("placeholders.egHolidaySurcharge20")}
                />
              </Field>
              <Field label={tw("labels.depositPaymentTerms")}>
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder={t("placeholders.eg50ToBookBalanceOn")}
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
              <Field label={t("labels.insuranceLiability")}>
                <Input
                  value={insurance}
                  onChangeText={setInsurance}
                  placeholder={t("placeholders.eg2mGeneralLiabilityCoiOn")}
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
                sub={t("subs.showYourTeamInActionUniforms")}
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label={t("labels.brochureCapabilitiesPdfOptional")}>
                <Input
                  value={brochureUrl}
                  onChangeText={setBrochureUrl}
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
