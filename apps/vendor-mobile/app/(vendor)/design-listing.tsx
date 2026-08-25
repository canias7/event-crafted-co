// Design & Decor listing wizard — the category-specific builder for the
// Design & Decor group (Event Coordinators, Florists, Beauty, Decor
// Rentals, Grooming Services). Built to the user's reference design:
// five steps — Basics · About · Services · Pricing · Review. One shared
// form for the whole group; the vendor's chosen SUBcategory is their
// specialty.
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
const THIS_ROUTE = "design-listing";

const STEPS = ["Basics", "About", "Services", "Pricing", "Review"] as const;

const OFFERINGS = [
  "Full Event Design",
  "Decor Styling",
  "Floral Design",
  "Ceremony Design",
  "Reception Design",
  "Table Styling",
  "Backdrops / Arches",
  "Balloon Installations",
  "Signage",
  "Lighting Design",
  "Prop Styling",
  "Rentals Only",
];
const SERVICE_STYLES = [
  "Full Design & Planning",
  "Day-of Styling",
  "Consultation",
  "Decor Rental",
  "Setup & Breakdown",
];
const BEST_FOR = [
  "Weddings",
  "Parties",
  "Corporate events",
  "Baby showers",
  "Bridal showers",
  "Milestone events",
];
const DESIGN_STYLES = [
  "Modern",
  "Classic / Elegant",
  "Boho / Rustic",
  "Romantic",
  "Minimalist",
  "Luxury / Glam",
  "Vintage",
  "Tropical",
  "Industrial",
];
const PRICING_TYPES = ["Per event", "Package", "Custom"];

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

export default function DesignListingScreen() {
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
  const [oneLiner, setOneLiner] = useState("");
  const [styleAesthetic, setStyleAesthetic] = useState("");
  const [unique, setUnique] = useState("");

  // Services
  const [offerings, setOfferings] = useState<string[]>([]);
  const [serviceStyles, setServiceStyles] = useState<string[]>([]);
  const [bestFor, setBestFor] = useState<string[]>([]);
  const [customServices, setCustomServices] = useState<"Yes" | "No" | "">("");
  const [designStyles, setDesignStyles] = useState<string[]>([]);
  const [colorPalette, setColorPalette] = useState("");
  const [trendFocus, setTrendFocus] = useState("");
  const [inspiration, setInspiration] = useState("");
  const [inventory, setInventory] = useState("");
  const [inventoryHighlights, setInventoryHighlights] = useState("");
  const [customBuilds, setCustomBuilds] = useState<"Yes" | "No" | "">("");

  // Pricing + logistics + policies
  const [deliverySetup, setDeliverySetup] = useState("");
  const [travelFees, setTravelFees] = useState("");
  const [storageRequired, setStorageRequired] = useState<"Yes" | "No" | "">("");
  const [accessRequirements, setAccessRequirements] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [pricingType, setPricingType] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceIncludes, setPriceIncludes] = useState("");
  const [additionalFees, setAdditionalFees] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [damagePolicy, setDamagePolicy] = useState("");
  const [otherNotes, setOtherNotes] = useState("");

  // Review
  const [beforeAfterUrl, setBeforeAfterUrl] = useState("");
  const [btsUrl, setBtsUrl] = useState("");
  const [lookbookUrl, setLookbookUrl] = useState("");
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
      setStyleAesthetic(d.style_aesthetic ?? "");
      setUnique(d.unique ?? "");
      setOfferings(Array.isArray(d.offerings) ? d.offerings : []);
      setServiceStyles(Array.isArray(d.service_styles) ? d.service_styles : []);
      setBestFor(Array.isArray(d.best_for) ? d.best_for : []);
      setCustomServices(d.custom_services ?? "");
      setDesignStyles(Array.isArray(d.design_styles) ? d.design_styles : []);
      setColorPalette(d.color_palette ?? "");
      setTrendFocus(d.trend_focus ?? "");
      setInspiration(d.inspiration ?? "");
      setInventory(d.inventory ?? "");
      setInventoryHighlights(d.inventory_highlights ?? "");
      setCustomBuilds(d.custom_builds ?? "");
      setDeliverySetup(d.delivery_setup ?? "");
      setTravelFees(d.travel_fees ?? "");
      setStorageRequired(d.storage_required ?? "");
      setAccessRequirements(d.access_requirements ?? "");
      setLeadTime(d.lead_time ?? "");
      setPricingType(d.pricing_type ?? "");
      setPriceMin(
        row.price_min_cents != null ? String(row.price_min_cents / 100) : "",
      );
      setPriceIncludes(d.price_includes ?? "");
      setAdditionalFees(d.additional_fees ?? "");
      setPaymentSchedule(d.payment_schedule ?? "");
      setCancellationPolicy(d.cancellation_policy ?? "");
      setDamagePolicy(d.damage_policy ?? "");
      setOtherNotes(d.other_notes ?? "");
      setBeforeAfterUrl(d.before_after_url ?? "");
      setBtsUrl(d.bts_url ?? "");
      setLookbookUrl(d.lookbook_url ?? "");
    }
    setLoading(false);
  }, [user, routeId]);

  useEffect(() => {
    load();
  }, [load]);

  function detailsPayload() {
    return {
      group: "design-decor",
      tagline: tagline.trim(),
      service_areas: serviceAreas.trim(),
      website: website.trim(),
      instagram: instagram.trim(),
      years_in_business: yearsInBusiness.trim(),
      description: description.trim(),
      one_liner: oneLiner.trim(),
      style_aesthetic: styleAesthetic.trim(),
      unique: unique.trim(),
      offerings,
      service_styles: serviceStyles,
      best_for: bestFor,
      custom_services: customServices,
      design_styles: designStyles,
      color_palette: colorPalette.trim(),
      trend_focus: trendFocus.trim(),
      inspiration: inspiration.trim(),
      inventory: inventory.trim(),
      inventory_highlights: inventoryHighlights.trim(),
      custom_builds: customBuilds,
      delivery_setup: deliverySetup.trim(),
      travel_fees: travelFees.trim(),
      storage_required: storageRequired,
      access_requirements: accessRequirements.trim(),
      lead_time: leadTime.trim(),
      pricing_type: pricingType,
      price_includes: priceIncludes.trim(),
      additional_fees: additionalFees.trim(),
      payment_schedule: paymentSchedule.trim(),
      cancellation_policy: cancellationPolicy.trim(),
      damage_policy: damagePolicy.trim(),
      other_notes: otherNotes.trim(),
      before_after_url: beforeAfterUrl.trim(),
      bts_url: btsUrl.trim(),
      lookbook_url: lookbookUrl.trim(),
    };
  }

  async function persist(status?: "pending" | "draft"): Promise<boolean> {
    if (!profile?.id) return false;
    const minCents = priceMin
      ? Math.round(Number.parseFloat(priceMin) * 100)
      : null;
    const pricingModels =
      pricingType === "Per event" || pricingType === "Package"
        ? ["fixed_packages"]
        : pricingType === "Custom"
          ? ["custom_quote"]
          : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        category: profile.category || "Decor Rentals",
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
    if (offerings.length === 0) missing.push("What you offer (at least one)");
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
                  placeholder="e.g., Bloom & Design Co."
                />
              </Field>
              <Field label="Short tagline" required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder="e.g., Thoughtful design. Stunning spaces."
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
                  placeholder="e.g., 7"
                  keyboardType="number-pad"
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <StepTitle
                title="About your business"
                sub="Give clients the story."
              />
              <Field label="Full description" required>
                <Input
                  value={description}
                  onChangeText={(v) => setDescription(v.slice(0, 1000))}
                  placeholder="Describe your design work and what clients can expect."
                  multiline
                />
              </Field>
              <Field label="What you do (one line)">
                <Input
                  value={oneLiner}
                  onChangeText={setOneLiner}
                  placeholder="e.g., Full event design, florals, and decor rentals"
                />
              </Field>
              <Field label="Style / aesthetic">
                <Input
                  value={styleAesthetic}
                  onChangeText={setStyleAesthetic}
                  placeholder="e.g., Organic modern with sculptural florals"
                />
              </Field>
              <Field label="What makes you unique">
                <Input
                  value={unique}
                  onChangeText={(v) => setUnique(v.slice(0, 500))}
                  placeholder="Share what sets your work apart…"
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title="Services & offerings"
                sub="Select what you offer and how you work."
              />
              <Field label="What you offer (select all that apply)" required>
                <ChipMulti
                  options={OFFERINGS}
                  selected={offerings}
                  onChange={setOfferings}
                  allowCustom
                />
              </Field>
              <Field label="Service style (select all that apply)">
                <ChipMulti
                  options={SERVICE_STYLES}
                  selected={serviceStyles}
                  onChange={setServiceStyles}
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
              <Field label="Custom services available?">
                <ChipSingle
                  options={yesNo}
                  selected={customServices}
                  onChange={(v) => setCustomServices(v as typeof customServices)}
                />
              </Field>

              <StepTitle title="Design & style" sub="Your look, specifically." topGap />
              <Field label="Design styles (select all that apply)">
                <ChipMulti
                  options={DESIGN_STYLES}
                  selected={designStyles}
                  onChange={setDesignStyles}
                  allowCustom
                />
              </Field>
              <Field label="Color palette preferences">
                <Input
                  value={colorPalette}
                  onChangeText={setColorPalette}
                  placeholder="e.g., Neutrals with jewel-tone accents"
                />
              </Field>
              <Field label="Trend focus">
                <Input
                  value={trendFocus}
                  onChangeText={setTrendFocus}
                  placeholder="e.g., Modern, classic, boho…"
                />
              </Field>
              <Field label="Inspiration sources">
                <Input
                  value={inspiration}
                  onChangeText={setInspiration}
                  placeholder="e.g., Architecture, editorial fashion, nature"
                />
              </Field>

              <StepTitle title="Inventory & rentals" sub="What you provide." topGap />
              <Field label="What you provide / rent">
                <Input
                  value={inventory}
                  onChangeText={setInventory}
                  placeholder="e.g., Arches, candle collections, vases, linens, furniture"
                  multiline
                />
              </Field>
              <Field label="Inventory highlights">
                <Input
                  value={inventoryHighlights}
                  onChangeText={setInventoryHighlights}
                  placeholder="e.g., 12-ft floral wall, vintage velvet lounge set"
                  multiline
                />
              </Field>
              <Field label="Custom builds available?">
                <ChipSingle
                  options={yesNo}
                  selected={customBuilds}
                  onChange={(v) => setCustomBuilds(v as typeof customBuilds)}
                />
              </Field>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <StepTitle title="Logistics & requirements" sub="How delivery works." />
              <Field label="Delivery / setup / breakdown">
                <Input
                  value={deliverySetup}
                  onChangeText={setDeliverySetup}
                  placeholder="e.g., Delivery + full setup included, breakdown same night"
                  multiline
                />
              </Field>
              <Field label="Travel fees">
                <Input
                  value={travelFees}
                  onChangeText={setTravelFees}
                  placeholder="e.g., Free within 25 miles, quoted beyond"
                />
              </Field>
              <Field label="Storage required?">
                <ChipSingle
                  options={yesNo}
                  selected={storageRequired}
                  onChange={(v) => setStorageRequired(v as typeof storageRequired)}
                />
              </Field>
              <Field label="Access / loading requirements">
                <Input
                  value={accessRequirements}
                  onChangeText={setAccessRequirements}
                  placeholder="e.g., Elevator or ground-floor access for large pieces"
                />
              </Field>
              <Field label="Lead time required">
                <Input
                  value={leadTime}
                  onChangeText={setLeadTime}
                  placeholder="e.g., 3 weeks notice for full design"
                />
              </Field>

              <StepTitle title="Pricing" sub="Where your pricing starts." topGap />
              <Field label="Pricing type">
                <ChipSingle
                  options={PRICING_TYPES}
                  selected={pricingType}
                  onChange={setPricingType}
                />
              </Field>
              <Field label="Starting price or minimum spend (USD)" required>
                <Input
                  value={priceMin}
                  onChangeText={(v) => setPriceMin(v.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g., 1200"
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="What's included in pricing">
                <Input
                  value={priceIncludes}
                  onChangeText={setPriceIncludes}
                  placeholder="e.g., Design consult, delivery, setup, breakdown"
                  multiline
                />
              </Field>
              <Field label="Additional fees (delivery, labor, overtime)">
                <Input
                  value={additionalFees}
                  onChangeText={setAdditionalFees}
                  placeholder="e.g., Late-night breakdown +$150"
                  multiline
                />
              </Field>
              <Field label="Deposit / payment terms">
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder="e.g., 50% deposit to reserve, balance 7 days out"
                />
              </Field>

              <StepTitle title="Policies & notes" sub="The fine print." topGap />
              <Field label="Cancellation / rescheduling policy">
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder="e.g., Deposit transferable up to 30 days out"
                  multiline
                />
              </Field>
              <Field label="Damage policy">
                <Input
                  value={damagePolicy}
                  onChangeText={setDamagePolicy}
                  placeholder="e.g., Replacement cost for damaged rentals"
                  multiline
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
                sub="High-quality photos and a clear style get up to 3× more inquiries."
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label="Before / after (optional)">
                <Input
                  value={beforeAfterUrl}
                  onChangeText={setBeforeAfterUrl}
                  placeholder="https://…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label="Behind the scenes (optional)">
                <Input
                  value={btsUrl}
                  onChangeText={setBtsUrl}
                  placeholder="https://instagram.com/…"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label="Brochure / lookbook (optional)">
                <Input
                  value={lookbookUrl}
                  onChangeText={setLookbookUrl}
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
