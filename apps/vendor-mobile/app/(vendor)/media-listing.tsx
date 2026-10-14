// Media listing wizard — the category-specific builder for the Media
// group (Photography, Videography, Photo Booths). Built to the user's
// reference design: five steps — Basics · About · Services · Pricing ·
// Review. One shared form for the whole group; the vendor's chosen
// SUBcategory is their media type.
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
const THIS_ROUTE = "media-listing";

const STEPS = ["Basics", "About", "Services", "Pricing", "Review"] as const;

const OFFERINGS = [
  "Photography",
  "Videography",
  "Photo Booths",
  "Drone Aerial",
  "Content Creation",
  "Live Streaming",
  "360° / Virtual Tours",
  "Editing Only",
];
const SERVICE_STYLES = [
  "Full-day coverage",
  "Partial-day coverage",
  "Hourly",
  "Single shooter",
  "Second shooter included",
  "Assistant team",
  "Raw footage included",
  "Highlight reel",
];
const BEST_FOR = [
  "Weddings",
  "Corporate events",
  "Parties",
  "Portraits",
  "Brand content",
  "Real estate",
];
const PRICING_TYPES = ["Hourly", "Flat rate", "Package", "Custom"];

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

export default function MediaListingScreen() {
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
  const { t, tObject } = useT("mediaListing");
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
  const [styleApproach, setStyleApproach] = useState("");
  const [unique, setUnique] = useState("");

  // Services
  const [offerings, setOfferings] = useState<string[]>([]);
  const [serviceStyles, setServiceStyles] = useState<string[]>([]);
  const [turnaround, setTurnaround] = useState("");
  const [packagesAvailable, setPackagesAvailable] = useState<"Yes" | "No" | "">("");
  const [shootStyle, setShootStyle] = useState("");
  const [editingStyle, setEditingStyle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [secondShooter, setSecondShooter] = useState<"Yes" | "No" | "">("");
  const [travelAvailable, setTravelAvailable] = useState<"Yes" | "No" | "">("");
  const [travelFees, setTravelFees] = useState("");
  const [backupEquipment, setBackupEquipment] = useState<"Yes" | "No" | "">("");
  const [onlineGallery, setOnlineGallery] = useState<"Yes" | "No" | "">("");
  const [printsAlbums, setPrintsAlbums] = useState<"Yes" | "No" | "">("");

  // Pricing + policies
  const [pricingType, setPricingType] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceIncludes, setPriceIncludes] = useState("");
  const [addOns, setAddOns] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [licensingInsurance, setLicensingInsurance] = useState("");
  const [usageRights, setUsageRights] = useState("");

  // Review
  const [reelUrl, setReelUrl] = useState("");
  const [btsUrl, setBtsUrl] = useState("");
  const [brochureUrl, setBrochureUrl] = useState("");
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
      setStyleApproach(d.style_approach ?? "");
      setUnique(d.unique ?? "");
      setOfferings(Array.isArray(d.offerings) ? d.offerings : []);
      setServiceStyles(Array.isArray(d.service_styles) ? d.service_styles : []);
      setTurnaround(d.turnaround ?? "");
      setPackagesAvailable(d.packages_available ?? "");
      setShootStyle(d.shoot_style ?? "");
      setEditingStyle(d.editing_style ?? "");
      setEquipment(d.equipment ?? "");
      setSecondShooter(d.second_shooter ?? "");
      setTravelAvailable(d.travel_available ?? "");
      setTravelFees(d.travel_fees ?? "");
      setBackupEquipment(d.backup_equipment ?? "");
      setOnlineGallery(d.online_gallery ?? "");
      setPrintsAlbums(d.prints_albums ?? "");
      setPricingType(d.pricing_type ?? "");
      setPriceMin(
        row.price_min_cents != null ? String(row.price_min_cents / 100) : "",
      );
      setPriceIncludes(d.price_includes ?? "");
      setAddOns(d.add_ons ?? "");
      setPaymentSchedule(d.payment_schedule ?? "");
      setCancellationPolicy(d.cancellation_policy ?? "");
      setLicensingInsurance(d.licensing_insurance ?? "");
      setUsageRights(d.usage_rights ?? "");
      setReelUrl(d.reel_url ?? "");
      setBtsUrl(d.bts_url ?? "");
      setBrochureUrl(d.brochure_url ?? "");
    }
    setLoading(false);
  }, [user, routeId]);

  useEffect(() => {
    load();
  }, [load]);

  function detailsPayload() {
    return {
      group: "media",
      tagline: tagline.trim(),
      service_areas: serviceAreas.trim(),
      website: website.trim(),
      instagram: instagram.trim(),
      years_in_business: yearsInBusiness.trim(),
      description: description.trim(),
      one_liner: oneLiner.trim(),
      best_for: bestFor,
      style_approach: styleApproach.trim(),
      unique: unique.trim(),
      offerings,
      service_styles: serviceStyles,
      turnaround: turnaround.trim(),
      packages_available: packagesAvailable,
      shoot_style: shootStyle.trim(),
      editing_style: editingStyle.trim(),
      equipment: equipment.trim(),
      second_shooter: secondShooter,
      travel_available: travelAvailable,
      travel_fees: travelFees.trim(),
      backup_equipment: backupEquipment,
      online_gallery: onlineGallery,
      prints_albums: printsAlbums,
      pricing_type: pricingType,
      price_includes: priceIncludes.trim(),
      add_ons: addOns.trim(),
      payment_schedule: paymentSchedule.trim(),
      cancellation_policy: cancellationPolicy.trim(),
      licensing_insurance: licensingInsurance.trim(),
      usage_rights: usageRights.trim(),
      reel_url: reelUrl.trim(),
      bts_url: btsUrl.trim(),
      brochure_url: brochureUrl.trim(),
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
        : pricingType === "Flat rate" || pricingType === "Package"
          ? ["fixed_packages"]
          : pricingType === "Custom"
            ? ["custom_quote"]
            : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        category: profile.category || "Photography",
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
    if (offerings.length === 0) missing.push(tw("missing.whatYouOfferAtLeastOne"));
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
                  placeholder={t("placeholders.egLunaPhotography")}
                />
              </Field>
              <Field label={tw("labels.shortTagline")} required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder={t("placeholders.egTimelessMomentsBeautifullyCaptured")}
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
                  placeholder={t("placeholders.eg6")}
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
                  placeholder={t("placeholders.describeYourWorkYourProcessAnd")}
                  multiline
                />
              </Field>
              <Field label={tw("labels.whatYouDoOneLine")}>
                <Input
                  value={oneLiner}
                  onChangeText={setOneLiner}
                  placeholder={t("placeholders.egDocumentaryWeddingPhotographyAndFilms")}
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
              <Field label={t("labels.styleApproach")}>
                <Input
                  value={styleApproach}
                  onChangeText={setStyleApproach}
                  placeholder={t("placeholders.egCandidAndEditorialWithWarm")}
                />
              </Field>
              <Field label={tw("labels.whatMakesYouUnique")}>
                <Input
                  value={unique}
                  onChangeText={(v) => setUnique(v.slice(0, 500))}
                  placeholder={tw("placeholders.shareWhatSetsYourWorkApart")}
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title={tw("headings.servicesOfferings")}
                sub={t("subs.selectWhatYouOfferAndHow")}
              />
              <Field label={tw("labels.whatYouOfferSelectAllThat")} required>
                <ChipMulti
                  options={chipLabels(OFFERINGS)}
                  selected={offerings.map(chipLabel)}
                  onChange={(next) => setOfferings(next.map((l) => chipValue(OFFERINGS, l)))}
                  allowCustom
                />
              </Field>
              <Field label={tw("labels.serviceStyleSelectAllThatApply")}>
                <ChipMulti
                  options={chipLabels(SERVICE_STYLES)}
                  selected={serviceStyles.map(chipLabel)}
                  onChange={(next) => setServiceStyles(next.map((l) => chipValue(SERVICE_STYLES, l)))}
                  allowCustom
                />
              </Field>
              <Field label={t("labels.turnaroundTime")}>
                <Input
                  value={turnaround}
                  onChangeText={setTurnaround}
                  placeholder={t("placeholders.egSneakPeeksIn48hFull")}
                />
              </Field>
              <Field label={tw("labels.packagesAvailable")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(packagesAvailable)}
                  onChange={(v) => setPackagesAvailable(chipValue(yesNo, v) as typeof packagesAvailable)}
                />
              </Field>

              <StepTitle title={t("headings.portfolioStyle")} sub={t("subs.yourCraftSpecifically")} topGap />
              <Field label={t("labels.photographyVideographyStyle")}>
                <Input
                  value={shootStyle}
                  onChangeText={setShootStyle}
                  placeholder={t("placeholders.egDocumentaryEditorialCinematic")}
                />
              </Field>
              <Field label={t("labels.editingStyleAesthetic")}>
                <Input
                  value={editingStyle}
                  onChangeText={setEditingStyle}
                  placeholder={t("placeholders.egTrueToColorWarmFilm")}
                />
              </Field>
              <Field label={t("labels.equipmentTechYouUse")}>
                <Input
                  value={equipment}
                  onChangeText={setEquipment}
                  placeholder={t("placeholders.egSonyA1BodiesPrimeLenses")}
                  multiline
                />
              </Field>
              <Field label={t("labels.secondShooterAssistantAvailable")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(secondShooter)}
                  onChange={(v) => setSecondShooter(chipValue(yesNo, v) as typeof secondShooter)}
                />
              </Field>

              <StepTitle title={t("headings.detailsLogistics")} sub={t("subs.howBookingsWork")} topGap />
              <Field label={t("labels.travelDestinationAvailable")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(travelAvailable)}
                  onChange={(v) => setTravelAvailable(chipValue(yesNo, v) as typeof travelAvailable)}
                />
              </Field>
              <Field label={tw("labels.travelFees")}>
                <Input
                  value={travelFees}
                  onChangeText={setTravelFees}
                  placeholder={t("placeholders.egFreeWithin50MilesQuoted")}
                />
              </Field>
              <Field label={t("labels.backupEquipment")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(backupEquipment)}
                  onChange={(v) => setBackupEquipment(chipValue(yesNo, v) as typeof backupEquipment)}
                />
              </Field>
              <Field label={t("labels.onlineGalleryDelivery")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(onlineGallery)}
                  onChange={(v) => setOnlineGallery(chipValue(yesNo, v) as typeof onlineGallery)}
                />
              </Field>
              <Field label={t("labels.printsAlbumsOffered")}>
                <ChipSingle
                  options={chipLabels(yesNo)}
                  selected={chipLabel(printsAlbums)}
                  onChange={(v) => setPrintsAlbums(chipValue(yesNo, v) as typeof printsAlbums)}
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
                  placeholder={t("placeholders.eg1500")}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label={tw("labels.whatsIncludedInTheStartingPrice")}>
                <Input
                  value={priceIncludes}
                  onChangeText={setPriceIncludes}
                  placeholder={t("placeholders.eg6HoursCoverageOnlineGallery")}
                  multiline
                />
              </Field>
              <Field label={t("labels.additionalServicesAddOns")}>
                <Input
                  value={addOns}
                  onChangeText={setAddOns}
                  placeholder={t("placeholders.egSecondShooter400Album250")}
                  multiline
                />
              </Field>
              <Field label={tw("labels.depositPaymentTerms")}>
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder={t("placeholders.eg30RetainerToBookBalance")}
                />
              </Field>

              <StepTitle title={t("headings.policiesRequirements")} sub={tw("subs.theFinePrint")} topGap />
              <Field label={tw("labels.cancellationReschedulingPolicy")}>
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder={t("placeholders.egRetainerTransferableUpTo60")}
                  multiline
                />
              </Field>
              <Field label={t("labels.licensingInsurance")}>
                <Input
                  value={licensingInsurance}
                  onChangeText={setLicensingInsurance}
                  placeholder={t("placeholders.egFullyInsuredCoiAvailableOn")}
                />
              </Field>
              <Field label={t("labels.usageRights")}>
                <Input
                  value={usageRights}
                  onChangeText={setUsageRights}
                  placeholder={t("placeholders.egPersonalUseIncludedCommercialLicensing")}
                />
              </Field>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <StepTitle
                title={tw("headings.photosMedia")}
                sub={t("subs.listingsWithAStrongPortfolioGet")}
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label={t("labels.highlightReelDemoVideoOptional")}>
                <Input
                  value={reelUrl}
                  onChangeText={setReelUrl}
                  placeholder="https://vimeo.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label={tw("labels.behindTheScenesOptional")}>
                <Input
                  value={btsUrl}
                  onChangeText={setBtsUrl}
                  placeholder="https://instagram.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label={t("labels.brochurePricingGuideLinkOptional")}>
                <Input
                  value={brochureUrl}
                  onChangeText={setBrochureUrl}
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
