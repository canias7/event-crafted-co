// Food & Beverage listing wizard — the category-specific builder for
// the Food & Beverage group (Catering, Bartending / Mobile Bars,
// Desserts & Cakes, Food Trucks / Specialty). Built to the user's
// reference design: five steps — Basics · Menu · Service · Pricing ·
// Review. One shared form for the whole group; the vendor's chosen
// SUBcategory is their business type, the form doesn't re-ask it.
//
// Storage: F&B answers live in vendor_profiles.category_details (jsonb).
// Marketplace-native fields keep their real columns: business_name,
// location (mirrors the service areas — mobile vendors have no fixed
// address), price_min/max_cents, pricing_models/custom_pricing.
// Photos & FAQs reuse the generic builder's tables and components.

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
const THIS_ROUTE = "food-listing";

const STEPS = ["Basics", "Menu", "Service", "Pricing", "Review"] as const;

const OFFERINGS = [
  "Full-service catering",
  "Buffet",
  "Plated meals",
  "Stations",
  "Drop-off / Delivery",
  "Food truck / Mobile",
  "Dessert table",
  "Bar / Beverage service",
  "Cake cutting",
];
const DIETARY = [
  "Vegan",
  "Vegetarian",
  "Gluten-free",
  "Dairy-free",
  "Halal",
  "Kosher",
  "Nut-free",
];
const SERVICE_STYLES = [
  "Full-service / Staffed",
  "Drop-off / Delivery",
  "Buffet / Family-style",
  "Plated / Stations",
  "Food truck / Mobile",
];
const BEST_FOR = [
  "Weddings",
  "Corporate events",
  "Birthdays",
  "Private parties",
  "Galas & fundraisers",
  "Festivals & markets",
];
const PRICING_TYPES = [
  "Per person",
  "Per hour",
  "Flat rate / Package",
  "Starting at",
  "Custom",
];

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

const COLS =
  "id, category, business_name, location, price_min_cents, price_max_cents, application_status, category_details";

export default function FoodListingScreen() {
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
  const { t, tObject } = useT("foodListing");
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
  const [oneLiner, setOneLiner] = useState("");
  const [serviceAreas, setServiceAreas] = useState("");
  const [yearsInBusiness, setYearsInBusiness] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  // About
  const [description, setDescription] = useState("");
  const [bestFor, setBestFor] = useState<string[]>([]);
  const [unique, setUnique] = useState("");

  // Menu
  const [offerings, setOfferings] = useState<string[]>([]);
  const [cuisineStyle, setCuisineStyle] = useState("");
  const [sampleMenu, setSampleMenu] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [customMenu, setCustomMenu] = useState<"Yes" | "No" | "">("");

  // Service
  const [serviceStyles, setServiceStyles] = useState<string[]>([]);
  const [setupIncluded, setSetupIncluded] = useState<"Yes" | "No" | "">("");
  const [staffingIncluded, setStaffingIncluded] = useState<"Yes" | "No" | "">("");
  const [minGuests, setMinGuests] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [kitchenAccess, setKitchenAccess] = useState<"Yes" | "No" | "">("");
  const [onSiteCooking, setOnSiteCooking] = useState<"Yes" | "No" | "">("");
  const [powerWater, setPowerWater] = useState("");
  const [travelAvailable, setTravelAvailable] = useState<"Yes" | "No" | "">("");
  const [liquorLicense, setLiquorLicense] = useState<"Yes" | "No" | "">("");
  const [byoAlcohol, setByoAlcohol] = useState<"Yes" | "No" | "">("");
  const [insuranceCert, setInsuranceCert] = useState<"Yes" | "No" | "">("");
  const [tastingAvailable, setTastingAvailable] = useState<"Yes" | "No" | "">("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");

  // Pricing
  const [pricingType, setPricingType] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [priceIncludes, setPriceIncludes] = useState("");
  const [additionalFees, setAdditionalFees] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("");

  // Review
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
      setOneLiner(d.one_liner ?? "");
      setServiceAreas(d.service_areas ?? row.location ?? "");
      setYearsInBusiness(d.years_in_business ?? "");
      setWebsite(d.website ?? "");
      setInstagram(d.instagram ?? "");
      setDescription(d.description ?? "");
      setBestFor(Array.isArray(d.best_for) ? d.best_for : []);
      setUnique(d.unique ?? "");
      setOfferings(Array.isArray(d.offerings) ? d.offerings : []);
      setCuisineStyle(d.cuisine_style ?? "");
      setSampleMenu(d.sample_menu ?? "");
      setDietary(Array.isArray(d.dietary) ? d.dietary : []);
      setCustomMenu(d.custom_menu ?? "");
      setServiceStyles(Array.isArray(d.service_styles) ? d.service_styles : []);
      setSetupIncluded(d.setup_included ?? "");
      setStaffingIncluded(d.staffing_included ?? "");
      setMinGuests(d.min_guests != null ? String(d.min_guests) : "");
      setLeadTime(d.lead_time ?? "");
      setKitchenAccess(d.kitchen_access ?? "");
      setOnSiteCooking(d.on_site_cooking ?? "");
      setPowerWater(d.power_water ?? "");
      setTravelAvailable(d.travel_available ?? "");
      setLiquorLicense(d.liquor_license ?? "");
      setByoAlcohol(d.byo_alcohol ?? "");
      setInsuranceCert(d.insurance_cert ?? "");
      setTastingAvailable(d.tasting_available ?? "");
      setCancellationPolicy(d.cancellation_policy ?? "");
      setPricingType(d.pricing_type ?? "");
      setPriceMin(
        row.price_min_cents != null ? String(row.price_min_cents / 100) : "",
      );
      setMinSpend(d.min_spend ?? "");
      setPriceIncludes(d.price_includes ?? "");
      setAdditionalFees(d.additional_fees ?? "");
      setPaymentSchedule(d.payment_schedule ?? "");
      setVideoUrl(d.video_url ?? "");
    }
    setLoading(false);
  }, [user, routeId]);

  useEffect(() => {
    load();
  }, [load]);

  function detailsPayload() {
    return {
      group: "food-beverage",
      tagline: tagline.trim(),
      one_liner: oneLiner.trim(),
      service_areas: serviceAreas.trim(),
      years_in_business: yearsInBusiness.trim(),
      website: website.trim(),
      instagram: instagram.trim(),
      description: description.trim(),
      best_for: bestFor,
      unique: unique.trim(),
      offerings,
      cuisine_style: cuisineStyle.trim(),
      sample_menu: sampleMenu.trim(),
      dietary,
      custom_menu: customMenu,
      service_styles: serviceStyles,
      setup_included: setupIncluded,
      staffing_included: staffingIncluded,
      min_guests: minGuests ? Number.parseInt(minGuests, 10) : null,
      lead_time: leadTime.trim(),
      kitchen_access: kitchenAccess,
      on_site_cooking: onSiteCooking,
      power_water: powerWater.trim(),
      travel_available: travelAvailable,
      liquor_license: liquorLicense,
      byo_alcohol: byoAlcohol,
      insurance_cert: insuranceCert,
      tasting_available: tastingAvailable,
      cancellation_policy: cancellationPolicy.trim(),
      pricing_type: pricingType,
      min_spend: minSpend.trim(),
      price_includes: priceIncludes.trim(),
      additional_fees: additionalFees.trim(),
      payment_schedule: paymentSchedule.trim(),
      video_url: videoUrl.trim(),
    };
  }

  async function persist(status?: "pending" | "draft"): Promise<boolean> {
    if (!profile?.id) return false;
    const minCents = priceMin
      ? Math.round(Number.parseFloat(priceMin) * 100)
      : null;
    // Pricing type → marketplace pricing_models so cards/search render
    // F&B listings like any other.
    const pricingModels =
      pricingType === "Per person"
        ? ["per_person"]
        : pricingType === "Per hour"
          ? ["hourly"]
          : pricingType === "Flat rate / Package"
            ? ["fixed_packages"]
            : pricingType === "Starting at"
              ? ["starting_at"]
              : pricingType === "Custom"
                ? ["custom_quote"]
                : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        category: profile.category || "Catering",
        business_name: businessName.trim() || null,
        // Mobile vendors have no fixed address — the marketplace location
        // is their service area.
        location: serviceAreas.trim() || null,
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
    if (!oneLiner.trim()) missing.push(t("missing.whatYouDoOneLine"));
    if (!serviceAreas.trim()) missing.push(tw("missing.serviceAreas"));
    if (!yearsInBusiness.trim()) missing.push(tw("missing.yearsInBusiness"));
    if (!description.trim()) missing.push(tw("missing.fullDescription"));
    if (offerings.length === 0) missing.push(t("missing.atLeastOneOffering"));
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
                  placeholder={t("placeholders.egBellasCatering")}
                />
              </Field>
              <Field label={tw("labels.shortTagline")} required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder={t("placeholders.egElevatedFlavorsUnforgettableEvents")}
                />
              </Field>
              <Field label={tw("labels.whatYouDoOneLine")} required>
                <Input
                  value={oneLiner}
                  onChangeText={setOneLiner}
                  placeholder={t("placeholders.egFullServiceCateringForWeddings")}
                />
              </Field>
              <Field label={tw("labels.serviceAreasCitiesRegionsStates")} required>
                <Input
                  value={serviceAreas}
                  onChangeText={setServiceAreas}
                  placeholder={tw("placeholders.addAreas")}
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
              <Field label={tw("labels.website")}>
                <Input
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="www.yourbusiness.com"
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

              <StepTitle
                title={tw("headings.aboutYourBusiness")}
                sub={tw("subs.giveClientsTheStory")}
                topGap
              />
              <Field label={tw("labels.fullDescription")} required>
                <Input
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t("placeholders.describeYourFoodYourServiceAnd")}
                  multiline
                />
              </Field>
              <Field label={tw("labels.bestForSelectAllThatApply")}>
                <ChipMulti options={chipLabels(BEST_FOR)} selected={bestFor.map(chipLabel)} onChange={(next) => setBestFor(next.map((l) => chipValue(BEST_FOR, l)))} />
              </Field>
              <Field label={tw("labels.whatMakesYouUnique")}>
                <Input
                  value={unique}
                  onChangeText={setUnique}
                  placeholder={t("placeholders.egWoodFiredEverythingRecipesFrom")}
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <StepTitle title={t("headings.menuOfferings")} sub={t("subs.showClientsWhatYouServe")} />
              <Field label={tw("labels.whatYouOfferSelectAllThat")} required>
                <ChipMulti
                  options={chipLabels(OFFERINGS)}
                  selected={offerings.map(chipLabel)}
                  onChange={(next) => setOfferings(next.map((l) => chipValue(OFFERINGS, l)))}
                  allowCustom
                />
              </Field>
              <Field label={t("labels.cuisineStyle")}>
                <Input
                  value={cuisineStyle}
                  onChangeText={setCuisineStyle}
                  placeholder={t("placeholders.egModernItalianSouthernComfortFusion")}
                />
              </Field>
              <Field label={t("labels.sampleMenuPopularItems")}>
                <Input
                  value={sampleMenu}
                  onChangeText={(v) => setSampleMenu(v.slice(0, 500))}
                  placeholder={t("placeholders.listAFewPopularDishesOr")}
                  multiline
                />
              </Field>
              <Field label={t("labels.dietaryAccommodationsSelectAllThatApply")}>
                <ChipMulti
                  options={chipLabels(DIETARY)}
                  selected={dietary.map(chipLabel)}
                  onChange={(next) => setDietary(next.map((l) => chipValue(DIETARY, l)))}
                  allowCustom
                />
              </Field>
              <Field label={t("labels.customMenuAvailable")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(customMenu)}
                  onChange={(v) => setCustomMenu(chipValue(yesNo, v) as typeof customMenu)}
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle title={t("headings.serviceDetails")} sub={t("subs.howYouShowUpOnThe")} />
              <Field label={tw("labels.serviceStyleSelectAllThatApply")}>
                <ChipMulti
                  options={chipLabels(SERVICE_STYLES)}
                  selected={serviceStyles.map(chipLabel)}
                  onChange={(next) => setServiceStyles(next.map((l) => chipValue(SERVICE_STYLES, l)))}
                  allowCustom
                />
              </Field>
              <Field label={tw("labels.setupBreakdownIncluded")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(setupIncluded)}
                  onChange={(v) => setSetupIncluded(chipValue(yesNo, v) as typeof setupIncluded)}
                />
              </Field>
              <Field label={t("labels.staffingIncluded")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(staffingIncluded)}
                  onChange={(v) => setStaffingIncluded(chipValue(yesNo, v) as typeof staffingIncluded)}
                />
              </Field>
              <Field label={t("labels.minimumGuestCount")}>
                <Input
                  value={minGuests}
                  onChangeText={(v) => setMinGuests(v.replace(/[^0-9]/g, ""))}
                  placeholder={t("placeholders.eg25")}
                  keyboardType="number-pad"
                />
              </Field>
              <Field label={tw("labels.leadTimeRequired")}>
                <Input
                  value={leadTime}
                  onChangeText={setLeadTime}
                  placeholder={tw("placeholders.eg2WeeksNotice")}
                />
              </Field>

              <StepTitle title={t("headings.equipmentLogistics")} sub={t("subs.whatYouNeedOnSite")} topGap />
              <Field label={t("labels.kitchenAccessRequired")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(kitchenAccess)}
                  onChange={(v) => setKitchenAccess(chipValue(yesNo, v) as typeof kitchenAccess)}
                />
              </Field>
              <Field label={t("labels.onSiteCooking")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(onSiteCooking)}
                  onChange={(v) => setOnSiteCooking(chipValue(yesNo, v) as typeof onSiteCooking)}
                />
              </Field>
              <Field label={t("labels.powerWaterNeeds")}>
                <Input
                  value={powerWater}
                  onChangeText={setPowerWater}
                  placeholder={t("placeholders.egOne120vOutletWaterHookup")}
                />
              </Field>
              <Field label={tw("labels.travelDeliveryAvailable")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(travelAvailable)}
                  onChange={(v) => setTravelAvailable(chipValue(yesNo, v) as typeof travelAvailable)}
                />
              </Field>

              <StepTitle title={t("headings.licensingPolicies")} sub={t("subs.thePaperworkSide")} topGap />
              <Field label={t("labels.liquorLicenseIfApplicable")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(liquorLicense)}
                  onChange={(v) => setLiquorLicense(chipValue(yesNo, v) as typeof liquorLicense)}
                />
              </Field>
              <Field label={t("labels.byoAlcoholAllowed")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(byoAlcohol)}
                  onChange={(v) => setByoAlcohol(chipValue(yesNo, v) as typeof byoAlcohol)}
                />
              </Field>
              <Field label={t("labels.insuranceCertificateAvailable")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(insuranceCert)}
                  onChange={(v) => setInsuranceCert(chipValue(yesNo, v) as typeof insuranceCert)}
                />
              </Field>
              <Field label={t("labels.tastingAvailable")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(tastingAvailable)}
                  onChange={(v) => setTastingAvailable(chipValue(yesNo, v) as typeof tastingAvailable)}
                />
              </Field>
              <Field label={t("labels.cancellationPolicy")}>
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder={t("placeholders.egFullRefundUpTo30")}
                  multiline
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
                  placeholder={tw("placeholders.eg45")}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label={t("labels.minimumSpendMinimumHours")}>
                <Input
                  value={minSpend}
                  onChangeText={setMinSpend}
                  placeholder={t("placeholders.eg1500MinimumOr4")}
                />
              </Field>
              <Field label={tw("labels.whatsIncludedInPricing")}>
                <Input
                  value={priceIncludes}
                  onChangeText={setPriceIncludes}
                  placeholder={t("placeholders.egStaffSetupDisposablesCakeCutting")}
                  multiline
                />
              </Field>
              <Field label={t("labels.additionalFeesTravelOvertimeStaffEtc")}>
                <Input
                  value={additionalFees}
                  onChangeText={setAdditionalFees}
                  placeholder={t("placeholders.eg1MileBeyond25Miles")}
                  multiline
                />
              </Field>
              <Field label={t("labels.paymentScheduleDeposit")}>
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder={t("placeholders.eg30DepositToBookBalance")}
                />
              </Field>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <StepTitle
                title={tw("headings.photosMedia")}
                sub={t("subs.addFoodPhotosAndSignatureItems")}
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
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
