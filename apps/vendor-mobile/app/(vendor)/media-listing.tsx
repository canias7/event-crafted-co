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
                  placeholder="e.g., Luna Photography"
                />
              </Field>
              <Field label="Short tagline" required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder="e.g., Timeless moments. Beautifully captured."
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
                  placeholder="e.g., 6"
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
                  placeholder="Describe your work, your process, and what clients can expect."
                  multiline
                />
              </Field>
              <Field label="What you do (one line)">
                <Input
                  value={oneLiner}
                  onChangeText={setOneLiner}
                  placeholder="e.g., Documentary wedding photography and films"
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
              <Field label="Style / approach">
                <Input
                  value={styleApproach}
                  onChangeText={setStyleApproach}
                  placeholder="e.g., Candid and editorial with warm tones"
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
                sub="Select what you offer and how you deliver."
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
              <Field label="Turnaround time">
                <Input
                  value={turnaround}
                  onChangeText={setTurnaround}
                  placeholder="e.g., Sneak peeks in 48h, full gallery in 4 weeks"
                />
              </Field>
              <Field label="Packages available?">
                <ChipSingle
                  options={yesNo}
                  selected={packagesAvailable}
                  onChange={(v) => setPackagesAvailable(v as typeof packagesAvailable)}
                />
              </Field>

              <StepTitle title="Portfolio & style" sub="Your craft, specifically." topGap />
              <Field label="Photography / videography style">
                <Input
                  value={shootStyle}
                  onChangeText={setShootStyle}
                  placeholder="e.g., Documentary, editorial, cinematic"
                />
              </Field>
              <Field label="Editing style / aesthetic">
                <Input
                  value={editingStyle}
                  onChangeText={setEditingStyle}
                  placeholder="e.g., True-to-color, warm film emulation"
                />
              </Field>
              <Field label="Equipment / tech you use">
                <Input
                  value={equipment}
                  onChangeText={setEquipment}
                  placeholder="e.g., Sony A1 bodies, prime lenses, pro audio"
                  multiline
                />
              </Field>
              <Field label="Second shooter / assistant available?">
                <ChipSingle
                  options={yesNo}
                  selected={secondShooter}
                  onChange={(v) => setSecondShooter(v as typeof secondShooter)}
                />
              </Field>

              <StepTitle title="Details & logistics" sub="How bookings work." topGap />
              <Field label="Travel / destination available?">
                <ChipSingle
                  options={yesNo}
                  selected={travelAvailable}
                  onChange={(v) => setTravelAvailable(v as typeof travelAvailable)}
                />
              </Field>
              <Field label="Travel fees">
                <Input
                  value={travelFees}
                  onChangeText={setTravelFees}
                  placeholder="e.g., Free within 50 miles, quoted beyond"
                />
              </Field>
              <Field label="Backup equipment?">
                <ChipSingle
                  options={yesNo}
                  selected={backupEquipment}
                  onChange={(v) => setBackupEquipment(v as typeof backupEquipment)}
                />
              </Field>
              <Field label="Online gallery delivery?">
                <ChipSingle
                  options={yesNo}
                  selected={onlineGallery}
                  onChange={(v) => setOnlineGallery(v as typeof onlineGallery)}
                />
              </Field>
              <Field label="Prints / albums offered?">
                <ChipSingle
                  options={yesNo}
                  selected={printsAlbums}
                  onChange={(v) => setPrintsAlbums(v as typeof printsAlbums)}
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
                  placeholder="e.g., 1500"
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="What's included in the starting price">
                <Input
                  value={priceIncludes}
                  onChangeText={setPriceIncludes}
                  placeholder="e.g., 6 hours coverage, online gallery, print rights"
                  multiline
                />
              </Field>
              <Field label="Additional services / add-ons">
                <Input
                  value={addOns}
                  onChangeText={setAddOns}
                  placeholder="e.g., Second shooter +$400, album +$250"
                  multiline
                />
              </Field>
              <Field label="Deposit / payment terms">
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder="e.g., 30% retainer to book, balance 14 days out"
                />
              </Field>

              <StepTitle title="Policies & requirements" sub="The fine print." topGap />
              <Field label="Cancellation / rescheduling policy">
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder="e.g., Retainer transferable up to 60 days out"
                  multiline
                />
              </Field>
              <Field label="Licensing / insurance">
                <Input
                  value={licensingInsurance}
                  onChangeText={setLicensingInsurance}
                  placeholder="e.g., Fully insured, COI available on request"
                />
              </Field>
              <Field label="Usage rights">
                <Input
                  value={usageRights}
                  onChangeText={setUsageRights}
                  placeholder="e.g., Personal use included, commercial licensing available"
                />
              </Field>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <StepTitle
                title="Photos & media"
                sub="Listings with a strong portfolio get up to 3× more inquiries."
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label="Highlight reel / demo video (optional)">
                <Input
                  value={reelUrl}
                  onChangeText={setReelUrl}
                  placeholder="https://vimeo.com/…"
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
              <Field label="Brochure / pricing guide link (optional)">
                <Input
                  value={brochureUrl}
                  onChangeText={setBrochureUrl}
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
