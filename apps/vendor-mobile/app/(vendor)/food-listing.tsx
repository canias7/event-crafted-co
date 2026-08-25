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
  darkPillText,
  lightPill,
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
    if (!oneLiner.trim()) missing.push("What you do (one line)");
    if (!serviceAreas.trim()) missing.push("Service areas");
    if (!yearsInBusiness.trim()) missing.push("Years in business");
    if (!description.trim()) missing.push("Full description");
    if (offerings.length === 0) missing.push("At least one offering");
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
              borderColor: BORDER,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              backgroundColor: "#ffffff",
              opacity: busy ? 0.5 : 1,
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
                sub="Tell clients the essentials about your business."
              />
              <CategoryField
                value={profile.category}
                onPress={() => setCategoryPickerOpen(true)}
              />
              <Field label="Business / listing name" required>
                <Input
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder="e.g., Bella's Catering"
                />
              </Field>
              <Field label="Short tagline" required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder="e.g., Elevated flavors. Unforgettable events."
                />
              </Field>
              <Field label="What you do (one line)" required>
                <Input
                  value={oneLiner}
                  onChangeText={setOneLiner}
                  placeholder="e.g., Full-service catering for weddings and events"
                />
              </Field>
              <Field label="Service areas (cities, regions, states)" required>
                <Input
                  value={serviceAreas}
                  onChangeText={setServiceAreas}
                  placeholder="Add areas"
                />
              </Field>
              <Field label="Years in business" required>
                <Input
                  value={yearsInBusiness}
                  onChangeText={(v) => setYearsInBusiness(v.replace(/[^0-9]/g, "").slice(0, 3))}
                  placeholder="e.g., 8"
                  keyboardType="number-pad"
                />
              </Field>
              <Field label="Website">
                <Input
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="www.yourbusiness.com"
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

              <StepTitle
                title="About your business"
                sub="Give clients the story."
                topGap
              />
              <Field label="Full description" required>
                <Input
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe your food, your service, and what clients can expect."
                  multiline
                />
              </Field>
              <Field label="Best for (select all that apply)">
                <ChipMulti options={BEST_FOR} selected={bestFor} onChange={setBestFor} />
              </Field>
              <Field label="What makes you unique">
                <Input
                  value={unique}
                  onChangeText={setUnique}
                  placeholder="e.g., Wood-fired everything, recipes from my grandmother"
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <StepTitle title="Menu & offerings" sub="Show clients what you serve." />
              <Field label="What you offer (select all that apply)" required>
                <ChipMulti
                  options={OFFERINGS}
                  selected={offerings}
                  onChange={setOfferings}
                  allowCustom
                />
              </Field>
              <Field label="Cuisine / style">
                <Input
                  value={cuisineStyle}
                  onChangeText={setCuisineStyle}
                  placeholder="e.g., Modern Italian, Southern comfort, Fusion"
                />
              </Field>
              <Field label="Sample menu / popular items">
                <Input
                  value={sampleMenu}
                  onChangeText={(v) => setSampleMenu(v.slice(0, 500))}
                  placeholder="List a few popular dishes or share a sample menu…"
                  multiline
                />
              </Field>
              <Field label="Dietary accommodations (select all that apply)">
                <ChipMulti
                  options={DIETARY}
                  selected={dietary}
                  onChange={setDietary}
                  allowCustom
                />
              </Field>
              <Field label="Custom menu available?">
                <ChipSingle
                  options={yesNo}
                  selected={customMenu}
                  onChange={(v) => setCustomMenu(v as typeof customMenu)}
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle title="Service details" sub="How you show up on the day." />
              <Field label="Service style (select all that apply)">
                <ChipMulti
                  options={SERVICE_STYLES}
                  selected={serviceStyles}
                  onChange={setServiceStyles}
                  allowCustom
                />
              </Field>
              <Field label="Setup / breakdown included?">
                <ChipSingle
                  options={yesNo}
                  selected={setupIncluded}
                  onChange={(v) => setSetupIncluded(v as typeof setupIncluded)}
                />
              </Field>
              <Field label="Staffing included?">
                <ChipSingle
                  options={yesNo}
                  selected={staffingIncluded}
                  onChange={(v) => setStaffingIncluded(v as typeof staffingIncluded)}
                />
              </Field>
              <Field label="Minimum guest count">
                <Input
                  value={minGuests}
                  onChangeText={(v) => setMinGuests(v.replace(/[^0-9]/g, ""))}
                  placeholder="e.g., 25"
                  keyboardType="number-pad"
                />
              </Field>
              <Field label="Lead time required">
                <Input
                  value={leadTime}
                  onChangeText={setLeadTime}
                  placeholder="e.g., 2 weeks notice"
                />
              </Field>

              <StepTitle title="Equipment & logistics" sub="What you need on-site." topGap />
              <Field label="Kitchen access required?">
                <ChipSingle
                  options={yesNo}
                  selected={kitchenAccess}
                  onChange={(v) => setKitchenAccess(v as typeof kitchenAccess)}
                />
              </Field>
              <Field label="On-site cooking?">
                <ChipSingle
                  options={yesNo}
                  selected={onSiteCooking}
                  onChange={(v) => setOnSiteCooking(v as typeof onSiteCooking)}
                />
              </Field>
              <Field label="Power / water needs">
                <Input
                  value={powerWater}
                  onChangeText={setPowerWater}
                  placeholder="e.g., One 120V outlet; water hookup preferred"
                />
              </Field>
              <Field label="Travel / delivery available?">
                <ChipSingle
                  options={yesNo}
                  selected={travelAvailable}
                  onChange={(v) => setTravelAvailable(v as typeof travelAvailable)}
                />
              </Field>

              <StepTitle title="Licensing & policies" sub="The paperwork side." topGap />
              <Field label="Liquor license (if applicable)">
                <ChipSingle
                  options={yesNo}
                  selected={liquorLicense}
                  onChange={(v) => setLiquorLicense(v as typeof liquorLicense)}
                />
              </Field>
              <Field label="BYO alcohol allowed?">
                <ChipSingle
                  options={yesNo}
                  selected={byoAlcohol}
                  onChange={(v) => setByoAlcohol(v as typeof byoAlcohol)}
                />
              </Field>
              <Field label="Insurance certificate available?">
                <ChipSingle
                  options={yesNo}
                  selected={insuranceCert}
                  onChange={(v) => setInsuranceCert(v as typeof insuranceCert)}
                />
              </Field>
              <Field label="Tasting available?">
                <ChipSingle
                  options={yesNo}
                  selected={tastingAvailable}
                  onChange={(v) => setTastingAvailable(v as typeof tastingAvailable)}
                />
              </Field>
              <Field label="Cancellation policy">
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder="e.g., Full refund up to 30 days out"
                  multiline
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
                  placeholder="e.g., 45"
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="Minimum spend / minimum hours">
                <Input
                  value={minSpend}
                  onChangeText={setMinSpend}
                  placeholder="e.g., $1,500 minimum or 4-hour minimum"
                />
              </Field>
              <Field label="What's included in pricing">
                <Input
                  value={priceIncludes}
                  onChangeText={setPriceIncludes}
                  placeholder="e.g., Staff, setup, disposables, cake cutting"
                  multiline
                />
              </Field>
              <Field label="Additional fees (travel, overtime, staff, etc.)">
                <Input
                  value={additionalFees}
                  onChangeText={setAdditionalFees}
                  placeholder="e.g., $1/mile beyond 25 miles, $50/hr overtime"
                  multiline
                />
              </Field>
              <Field label="Payment schedule / deposit">
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder="e.g., 30% deposit to book, balance 7 days out"
                />
              </Field>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <StepTitle
                title="Photos & media"
                sub="Add food photos and signature items — listings with menus get 3× more inquiries."
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
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
