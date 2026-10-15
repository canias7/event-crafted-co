// Rentals listing wizard — the category-specific builder for the
// Rentals group (Furniture Rentals, Tents & Outdoor, Lighting & AV
// Equipment, Dance Floors & Staging, Transportation). Built to the
// user's reference design: five steps — Basics · About · Inventory ·
// Pricing · Review. One shared form for the whole group; the vendor's
// chosen SUBcategory is their rental specialty.
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
import { C } from "@/lib/theme";
import { FaqsSection } from "@/components/listing/Sections";
import {
  PAGE,
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
const THIS_ROUTE = "rental-listing";

const STEPS = ["Basics", "About", "Inventory", "Pricing", "Review"] as const;

const INVENTORY_CATEGORIES = [
  "Tables",
  "Chairs",
  "Lounge Furniture",
  "Linens & Tablecloths",
  "Tabletop & Dinnerware",
  "Decor & Accents",
  "Tents & Canopies",
  "Lighting",
  "Dance Floors",
  "Staging & Platforms",
  "Audio Visual",
  "Heaters & Fans",
  "Generators",
];
const RENTAL_PERIODS = ["Daily", "Weekend", "Weekly"];
const BEST_FOR = [
  "Weddings",
  "Parties",
  "Corporate events",
  "Festivals",
  "Backyard events",
  "Production sets",
];
const PRICING_TYPES = ["Per item", "Package / Set", "Custom"];

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

export default function RentalListingScreen() {
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
  const { t, tObject } = useT("rentalListing");
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
  const [oneLiner, setOneLiner] = useState("");
  const [bestFor, setBestFor] = useState<string[]>([]);
  const [styleAesthetic, setStyleAesthetic] = useState("");
  const [unique, setUnique] = useState("");

  // Inventory
  const [categories, setCategories] = useState<string[]>([]);
  const [inventoryHighlights, setInventoryHighlights] = useState("");
  const [customPackages, setCustomPackages] = useState<"Yes" | "No" | "">("");
  const [rentalPeriods, setRentalPeriods] = useState<string[]>([]);
  const [minOrder, setMinOrder] = useState("");
  const [deliveryPickup, setDeliveryPickup] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [setupAvailable, setSetupAvailable] = useState<"Yes" | "No" | "">("");
  const [deliveryIncluded, setDeliveryIncluded] = useState<"Yes" | "No" | "">("");
  const [cleaningIncluded, setCleaningIncluded] = useState<"Yes" | "No" | "">("");
  const [accessoriesIncluded, setAccessoriesIncluded] = useState("");

  // Pricing + logistics + policies
  const [deliveryAreasFees, setDeliveryAreasFees] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [accessRequirements, setAccessRequirements] = useState("");
  const [damageWaiver, setDamageWaiver] = useState("");
  const [storageRequirements, setStorageRequirements] = useState("");
  const [pricingType, setPricingType] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [deliveryFees, setDeliveryFees] = useState("");
  const [setupFees, setSetupFees] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [damagePolicy, setDamagePolicy] = useState("");
  const [overtimeFees, setOvertimeFees] = useState("");
  const [otherNotes, setOtherNotes] = useState("");

  // Review
  const [priceListUrl, setPriceListUrl] = useState("");
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
      setOneLiner(d.one_liner ?? "");
      setBestFor(Array.isArray(d.best_for) ? d.best_for : []);
      setStyleAesthetic(d.style_aesthetic ?? "");
      setUnique(d.unique ?? "");
      setCategories(Array.isArray(d.categories) ? d.categories : []);
      setInventoryHighlights(d.inventory_highlights ?? "");
      setCustomPackages(d.custom_packages ?? "");
      setRentalPeriods(Array.isArray(d.rental_periods) ? d.rental_periods : []);
      setMinOrder(d.min_order ?? "");
      setDeliveryPickup(d.delivery_pickup ?? "");
      setLeadTime(d.lead_time ?? "");
      setSetupAvailable(d.setup_available ?? "");
      setDeliveryIncluded(d.delivery_included ?? "");
      setCleaningIncluded(d.cleaning_included ?? "");
      setAccessoriesIncluded(d.accessories_included ?? "");
      setDeliveryAreasFees(d.delivery_areas_fees ?? "");
      setPickupLocation(d.pickup_location ?? "");
      setAccessRequirements(d.access_requirements ?? "");
      setDamageWaiver(d.damage_waiver ?? "");
      setStorageRequirements(d.storage_requirements ?? "");
      setPricingType(d.pricing_type ?? "");
      setPriceMin(
        row.price_min_cents != null ? String(row.price_min_cents / 100) : "",
      );
      setDeliveryFees(d.delivery_fees ?? "");
      setSetupFees(d.setup_fees ?? "");
      setPaymentSchedule(d.payment_schedule ?? "");
      setCancellationPolicy(d.cancellation_policy ?? "");
      setDamagePolicy(d.damage_policy ?? "");
      setOvertimeFees(d.overtime_fees ?? "");
      setOtherNotes(d.other_notes ?? "");
      setPriceListUrl(d.price_list_url ?? "");
      setVideoUrl(d.video_url ?? "");
    }
    setLoading(false);
  }, [user, routeId]);

  useEffect(() => {
    load();
  }, [load]);

  function detailsPayload() {
    return {
      group: "rentals",
      tagline: tagline.trim(),
      service_areas: serviceAreas.trim(),
      website: website.trim(),
      instagram: instagram.trim(),
      years_in_business: yearsInBusiness.trim(),
      description: description.trim(),
      one_liner: oneLiner.trim(),
      best_for: bestFor,
      style_aesthetic: styleAesthetic.trim(),
      unique: unique.trim(),
      categories,
      inventory_highlights: inventoryHighlights.trim(),
      custom_packages: customPackages,
      rental_periods: rentalPeriods,
      min_order: minOrder.trim(),
      delivery_pickup: deliveryPickup.trim(),
      lead_time: leadTime.trim(),
      setup_available: setupAvailable,
      delivery_included: deliveryIncluded,
      cleaning_included: cleaningIncluded,
      accessories_included: accessoriesIncluded.trim(),
      delivery_areas_fees: deliveryAreasFees.trim(),
      pickup_location: pickupLocation.trim(),
      access_requirements: accessRequirements.trim(),
      damage_waiver: damageWaiver.trim(),
      storage_requirements: storageRequirements.trim(),
      pricing_type: pricingType,
      delivery_fees: deliveryFees.trim(),
      setup_fees: setupFees.trim(),
      payment_schedule: paymentSchedule.trim(),
      cancellation_policy: cancellationPolicy.trim(),
      damage_policy: damagePolicy.trim(),
      overtime_fees: overtimeFees.trim(),
      other_notes: otherNotes.trim(),
      price_list_url: priceListUrl.trim(),
      video_url: videoUrl.trim(),
    };
  }

  async function persist(status?: "pending" | "draft"): Promise<boolean> {
    if (!profile?.id) return false;
    const minCents = priceMin
      ? Math.round(Number.parseFloat(priceMin) * 100)
      : null;
    const pricingModels =
      pricingType === "Per item"
        ? ["starting_at"]
        : pricingType === "Package / Set"
          ? ["fixed_packages"]
          : pricingType === "Custom"
            ? ["custom_quote"]
            : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        category: profile.category || "Furniture Rentals",
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
    if (categories.length === 0)
      missing.push(t("missing.inventoryCategoriesAtLeastOne"));
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
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: SERIF, color: INK_DIM }}>{tw("loading")}</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
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
              backgroundColor: busy ? C.page : C.field,
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
                  placeholder={t("placeholders.egPartyPerfectRentals")}
                />
              </Field>
              <Field label={tw("labels.shortTagline")} required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder={t("placeholders.egQualityRentalsStyledForUnforgettable")}
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
                  placeholder={t("placeholders.eg10")}
                  keyboardType="number-pad"
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <StepTitle
                title={tw("headings.aboutYourBusiness")}
                sub={tw("subs.giveClientsTheStory")}
              />
              <Field label={tw("labels.fullDescription")} required>
                <Input
                  value={description}
                  onChangeText={(v) => setDescription(v.slice(0, 1000))}
                  placeholder={t("placeholders.describeYourInventoryServiceAndWhat")}
                  multiline
                />
              </Field>
              <Field label={t("labels.whatYouRentOneLine")}>
                <Input
                  value={oneLiner}
                  onChangeText={setOneLiner}
                  placeholder={t("placeholders.egFurnitureTentsAndTabletopFor")}
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
              <Field label={tw("labels.styleAesthetic")}>
                <Input
                  value={styleAesthetic}
                  onChangeText={setStyleAesthetic}
                  placeholder={t("placeholders.egModernMinimalistWithWarmWoods")}
                />
              </Field>
              <Field label={tw("labels.whatMakesYouUnique")}>
                <Input
                  value={unique}
                  onChangeText={(v) => setUnique(v.slice(0, 500))}
                  placeholder={t("placeholders.shareWhatSetsYourInventoryApart")}
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title={t("headings.inventoryCategories")}
                sub={t("subs.chooseTheCategoriesYouOfferAnd")}
              />
              <Field label={t("labels.categoriesSelectAllThatApply")} required>
                <ChipMulti
                  options={chipLabels(INVENTORY_CATEGORIES)}
                  selected={categories.map(chipLabel)}
                  onChange={(next) => setCategories(next.map((l) => chipValue(INVENTORY_CATEGORIES, l)))}
                  allowCustom
                />
              </Field>
              <Field label={tw("labels.inventoryHighlights")}>
                <Input
                  value={inventoryHighlights}
                  onChangeText={(v) => setInventoryHighlights(v.slice(0, 500))}
                  placeholder={t("placeholders.tellClientsAboutYourMostPopular")}
                  multiline
                />
              </Field>
              <Field label={t("labels.doYouOfferCustomPackagesOr")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(customPackages)}
                  onChange={(v) => setCustomPackages(chipValue(yesNo, v) as typeof customPackages)}
                />
              </Field>

              <StepTitle title={t("headings.detailsAvailability")} sub={t("subs.howRentingWorks")} topGap />
              <Field label={t("labels.rentalPeriodSelectAllThatApply")}>
                <ChipMulti
                  options={chipLabels(RENTAL_PERIODS)}
                  selected={rentalPeriods.map(chipLabel)}
                  onChange={(next) => setRentalPeriods(next.map((l) => chipValue(RENTAL_PERIODS, l)))}
                  allowCustom
                />
              </Field>
              <Field label={t("labels.minimumOrderMinimumSpend")}>
                <Input
                  value={minOrder}
                  onChangeText={setMinOrder}
                  placeholder={t("placeholders.eg300MinimumOrder")}
                />
              </Field>
              <Field label={t("labels.deliveryPickupOptions")}>
                <Input
                  value={deliveryPickup}
                  onChangeText={setDeliveryPickup}
                  placeholder={t("placeholders.egDeliveryAvailableCustomerPickupWelcome")}
                />
              </Field>
              <Field label={tw("labels.leadTimeRequired")}>
                <Input
                  value={leadTime}
                  onChangeText={setLeadTime}
                  placeholder={t("placeholders.eg1WeekNotice3Weeks")}
                />
              </Field>

              <StepTitle title={tw("headings.whatsIncluded")} sub={t("subs.whatComesWithARental")} topGap />
              <Field label={t("labels.setupBreakdownAvailable")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(setupAvailable)}
                  onChange={(v) => setSetupAvailable(chipValue(yesNo, v) as typeof setupAvailable)}
                />
              </Field>
              <Field label={t("labels.deliveryIncluded")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(deliveryIncluded)}
                  onChange={(v) => setDeliveryIncluded(chipValue(yesNo, v) as typeof deliveryIncluded)}
                />
              </Field>
              <Field label={t("labels.cleaningIncluded")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(cleaningIncluded)}
                  onChange={(v) => setCleaningIncluded(chipValue(yesNo, v) as typeof cleaningIncluded)}
                />
              </Field>
              <Field label={t("labels.accessoriesAddOnsIncluded")}>
                <Input
                  value={accessoriesIncluded}
                  onChangeText={setAccessoriesIncluded}
                  placeholder={t("placeholders.egSidewallsWithTentsCablesWith")}
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <StepTitle title={tw("headings.logisticsRequirements")} sub={tw("subs.howDeliveryWorks")} />
              <Field label={t("labels.deliveryAreasFees")}>
                <Input
                  value={deliveryAreasFees}
                  onChangeText={setDeliveryAreasFees}
                  placeholder={t("placeholders.egFreeWithin20Miles2")}
                  multiline
                />
              </Field>
              <Field label={t("labels.pickupLocation")}>
                <Input
                  value={pickupLocation}
                  onChangeText={setPickupLocation}
                  placeholder={t("placeholders.egWarehouseInMidtownMonSat")}
                />
              </Field>
              <Field label={tw("labels.accessLoadingRequirements")}>
                <Input
                  value={accessRequirements}
                  onChangeText={setAccessRequirements}
                  placeholder={t("placeholders.egDockOrDoubleDoorsFor")}
                />
              </Field>
              <Field label={t("labels.damageWaiverInsurance")}>
                <Input
                  value={damageWaiver}
                  onChangeText={setDamageWaiver}
                  placeholder={t("placeholders.eg10DamageWaiverOptionalCoi")}
                />
              </Field>
              <Field label={t("labels.storageRequirements")}>
                <Input
                  value={storageRequirements}
                  onChangeText={setStorageRequirements}
                  placeholder={t("placeholders.egCoveredAreaRequiredOvernight")}
                />
              </Field>

              <StepTitle title={tw("headings.pricing")} sub={tw("subs.whereYourPricingStarts")} topGap />
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
                  placeholder={t("placeholders.eg150")}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label={t("labels.deliveryFees")}>
                <Input
                  value={deliveryFees}
                  onChangeText={setDeliveryFees}
                  placeholder={t("placeholders.egFrom75RoundTrip")}
                />
              </Field>
              <Field label={t("labels.setupFees")}>
                <Input
                  value={setupFees}
                  onChangeText={setSetupFees}
                  placeholder={t("placeholders.eg150ForFullSetupBreakdown")}
                />
              </Field>
              <Field label={tw("labels.depositPaymentTerms")}>
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder={t("placeholders.eg50ToReserveBalanceOn")}
                />
              </Field>

              <StepTitle title={tw("headings.policiesNotes")} sub={tw("subs.theFinePrint")} topGap />
              <Field label={tw("labels.cancellationReschedulingPolicy")}>
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder={t("placeholders.egFullRefundUpTo14")}
                  multiline
                />
              </Field>
              <Field label={tw("labels.damagePolicy")}>
                <Input
                  value={damagePolicy}
                  onChangeText={setDamagePolicy}
                  placeholder={t("placeholders.egReplacementCostForLostOr")}
                  multiline
                />
              </Field>
              <Field label={t("labels.overtimeLateFees")}>
                <Input
                  value={overtimeFees}
                  onChangeText={setOvertimeFees}
                  placeholder={t("placeholders.egLateReturnChargedAtDaily")}
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
                sub={t("subs.showcaseYourInventoryClearlyPhotosQuantities")}
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label={t("labels.brochurePriceListOptional")}>
                <Input
                  value={priceListUrl}
                  onChangeText={setPriceListUrl}
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
                <Text style={{ fontFamily: "LibreBaskerville-Bold", color: C.error, fontSize: 14}}>
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
