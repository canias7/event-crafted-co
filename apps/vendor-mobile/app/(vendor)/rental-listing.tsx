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
    if (categories.length === 0)
      missing.push("Inventory categories (at least one)");
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
                sub="Tell clients the essentials about your rental business."
              />
              <CategoryField
                value={profile.category}
                onPress={() => setCategoryPickerOpen(true)}
              />
              <Field label="Business / listing name" required>
                <Input
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder="e.g., Party Perfect Rentals"
                />
              </Field>
              <Field label="Short tagline" required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder="e.g., Quality rentals. Styled for unforgettable events."
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
                  placeholder="e.g., 10"
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
                  placeholder="Describe your inventory, service, and what clients can expect."
                  multiline
                />
              </Field>
              <Field label="What you rent (one line)">
                <Input
                  value={oneLiner}
                  onChangeText={setOneLiner}
                  placeholder="e.g., Furniture, tents, and tabletop for events of any size"
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
              <Field label="Style / aesthetic">
                <Input
                  value={styleAesthetic}
                  onChangeText={setStyleAesthetic}
                  placeholder="e.g., Modern minimalist with warm woods"
                />
              </Field>
              <Field label="What makes you unique">
                <Input
                  value={unique}
                  onChangeText={(v) => setUnique(v.slice(0, 500))}
                  placeholder="Share what sets your inventory apart…"
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title="Inventory & categories"
                sub="Choose the categories you offer and add your inventory."
              />
              <Field label="Categories (select all that apply)" required>
                <ChipMulti
                  options={INVENTORY_CATEGORIES}
                  selected={categories}
                  onChange={setCategories}
                  allowCustom
                />
              </Field>
              <Field label="Inventory highlights">
                <Input
                  value={inventoryHighlights}
                  onChangeText={(v) => setInventoryHighlights(v.slice(0, 500))}
                  placeholder="Tell clients about your most popular items, styles, quantities, or package options…"
                  multiline
                />
              </Field>
              <Field label="Do you offer custom packages or bundles?">
                <ChipSingle
                  options={yesNo}
                  selected={customPackages}
                  onChange={(v) => setCustomPackages(v as typeof customPackages)}
                />
              </Field>

              <StepTitle title="Details & availability" sub="How renting works." topGap />
              <Field label="Rental period (select all that apply)">
                <ChipMulti
                  options={RENTAL_PERIODS}
                  selected={rentalPeriods}
                  onChange={setRentalPeriods}
                  allowCustom
                />
              </Field>
              <Field label="Minimum order / minimum spend">
                <Input
                  value={minOrder}
                  onChangeText={setMinOrder}
                  placeholder="e.g., $300 minimum order"
                />
              </Field>
              <Field label="Delivery / pickup options">
                <Input
                  value={deliveryPickup}
                  onChangeText={setDeliveryPickup}
                  placeholder="e.g., Delivery available, customer pickup welcome"
                />
              </Field>
              <Field label="Lead time required">
                <Input
                  value={leadTime}
                  onChangeText={setLeadTime}
                  placeholder="e.g., 1 week notice, 3 weeks for large orders"
                />
              </Field>

              <StepTitle title="What's included" sub="What comes with a rental." topGap />
              <Field label="Setup / breakdown available?">
                <ChipSingle
                  options={yesNo}
                  selected={setupAvailable}
                  onChange={(v) => setSetupAvailable(v as typeof setupAvailable)}
                />
              </Field>
              <Field label="Delivery included?">
                <ChipSingle
                  options={yesNo}
                  selected={deliveryIncluded}
                  onChange={(v) => setDeliveryIncluded(v as typeof deliveryIncluded)}
                />
              </Field>
              <Field label="Cleaning included?">
                <ChipSingle
                  options={yesNo}
                  selected={cleaningIncluded}
                  onChange={(v) => setCleaningIncluded(v as typeof cleaningIncluded)}
                />
              </Field>
              <Field label="Accessories / add-ons included">
                <Input
                  value={accessoriesIncluded}
                  onChangeText={setAccessoriesIncluded}
                  placeholder="e.g., Sidewalls with tents, cables with AV"
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <StepTitle title="Logistics & requirements" sub="How delivery works." />
              <Field label="Delivery areas & fees">
                <Input
                  value={deliveryAreasFees}
                  onChangeText={setDeliveryAreasFees}
                  placeholder="e.g., Free within 20 miles, $2/mile beyond"
                  multiline
                />
              </Field>
              <Field label="Pickup location">
                <Input
                  value={pickupLocation}
                  onChangeText={setPickupLocation}
                  placeholder="e.g., Warehouse in Midtown, Mon–Sat 9–5"
                />
              </Field>
              <Field label="Access / loading requirements">
                <Input
                  value={accessRequirements}
                  onChangeText={setAccessRequirements}
                  placeholder="e.g., Dock or double doors for staging pieces"
                />
              </Field>
              <Field label="Damage waiver / insurance">
                <Input
                  value={damageWaiver}
                  onChangeText={setDamageWaiver}
                  placeholder="e.g., 10% damage waiver optional, COI accepted"
                />
              </Field>
              <Field label="Storage requirements">
                <Input
                  value={storageRequirements}
                  onChangeText={setStorageRequirements}
                  placeholder="e.g., Covered area required overnight"
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
              <Field label="Starting price (USD)" required>
                <Input
                  value={priceMin}
                  onChangeText={(v) => setPriceMin(v.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g., 150"
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="Delivery fees">
                <Input
                  value={deliveryFees}
                  onChangeText={setDeliveryFees}
                  placeholder="e.g., From $75 round-trip"
                />
              </Field>
              <Field label="Setup fees">
                <Input
                  value={setupFees}
                  onChangeText={setSetupFees}
                  placeholder="e.g., $150 for full setup & breakdown"
                />
              </Field>
              <Field label="Deposit / payment terms">
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder="e.g., 50% to reserve, balance on delivery"
                />
              </Field>

              <StepTitle title="Policies & notes" sub="The fine print." topGap />
              <Field label="Cancellation / rescheduling policy">
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder="e.g., Full refund up to 14 days out"
                  multiline
                />
              </Field>
              <Field label="Damage policy">
                <Input
                  value={damagePolicy}
                  onChangeText={setDamagePolicy}
                  placeholder="e.g., Replacement cost for lost or damaged items"
                  multiline
                />
              </Field>
              <Field label="Overtime / late fees">
                <Input
                  value={overtimeFees}
                  onChangeText={setOvertimeFees}
                  placeholder="e.g., Late return charged at daily rate"
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
                sub="Showcase your inventory clearly — photos, quantities, and popular package ideas get more bookings."
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label="Brochure / price list (optional)">
                <Input
                  value={priceListUrl}
                  onChangeText={setPriceListUrl}
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
