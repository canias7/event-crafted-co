// Beauty & Grooming listing wizard — the dedicated builder for the
// "Beauty" and "Grooming Services" subcategories. They live under the
// Design & Decor group for marketplace browsing (unchanged), but
// they're people services — the decor form's inventory/damage-policy
// questions didn't fit, so these two subs route here instead (sub-level
// override in WizardKit).
//
// Five steps — Basics · About · Services · Pricing · Review — matching
// the other wizards' rail and styling. Answers live in
// vendor_profiles.category_details (jsonb); marketplace-native fields
// keep their real columns.

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
const THIS_ROUTE = "beauty-listing";

const STEPS = ["Basics", "About", "Services", "Pricing", "Review"] as const;

const SERVICES = [
  "Bridal hair",
  "Bridal makeup",
  "Hair styling",
  "Makeup",
  "Airbrush makeup",
  "Lashes",
  "Barbering",
  "Men's grooming",
  "Nails",
  "Skincare prep",
  "Group / party services",
];
const BEST_FOR = [
  "Weddings",
  "Bridal parties",
  "Photoshoots",
  "Proms & formals",
  "Corporate & TV",
  "Special occasions",
];
const PRICING_TYPES = ["Per person", "Per service", "Package", "Custom"];

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

export default function BeautyListingScreen() {
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
  const [specialties, setSpecialties] = useState("");
  const [unique, setUnique] = useState("");

  // Services
  const [services, setServices] = useState<string[]>([]);
  const [workSetting, setWorkSetting] = useState<
    "On-location" | "Studio" | "Both" | ""
  >("");
  const [maxPartySize, setMaxPartySize] = useState("");
  const [trialsAvailable, setTrialsAvailable] = useState<"Yes" | "No" | "">("");
  const [touchUps, setTouchUps] = useState<"Yes" | "No" | "">("");
  const [earlyStarts, setEarlyStarts] = useState<"Yes" | "No" | "">("");
  const [teamAvailable, setTeamAvailable] = useState<"Yes" | "No" | "">("");
  const [products, setProducts] = useState("");

  // Pricing
  const [pricingType, setPricingType] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [travelFees, setTravelFees] = useState("");
  const [priceIncludes, setPriceIncludes] = useState("");
  const [addOns, setAddOns] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [otherNotes, setOtherNotes] = useState("");

  // Review
  const [portfolioUrl, setPortfolioUrl] = useState("");
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
      setSpecialties(d.specialties ?? "");
      setUnique(d.unique ?? "");
      setServices(Array.isArray(d.services) ? d.services : []);
      setWorkSetting(d.work_setting ?? "");
      setMaxPartySize(d.max_party_size != null ? String(d.max_party_size) : "");
      setTrialsAvailable(d.trials_available ?? "");
      setTouchUps(d.touch_ups ?? "");
      setEarlyStarts(d.early_starts ?? "");
      setTeamAvailable(d.team_available ?? "");
      setProducts(d.products ?? "");
      setPricingType(d.pricing_type ?? "");
      setPriceMin(
        row.price_min_cents != null ? String(row.price_min_cents / 100) : "",
      );
      setMinSpend(d.min_spend ?? "");
      setTravelFees(d.travel_fees ?? "");
      setPriceIncludes(d.price_includes ?? "");
      setAddOns(d.add_ons ?? "");
      setPaymentSchedule(d.payment_schedule ?? "");
      setCancellationPolicy(d.cancellation_policy ?? "");
      setOtherNotes(d.other_notes ?? "");
      setPortfolioUrl(d.portfolio_url ?? "");
    }
    setLoading(false);
  }, [user, routeId]);

  useEffect(() => {
    load();
  }, [load]);

  function detailsPayload() {
    return {
      group: "beauty-grooming",
      tagline: tagline.trim(),
      service_areas: serviceAreas.trim(),
      website: website.trim(),
      instagram: instagram.trim(),
      years_in_business: yearsInBusiness.trim(),
      description: description.trim(),
      one_liner: oneLiner.trim(),
      best_for: bestFor,
      specialties: specialties.trim(),
      unique: unique.trim(),
      services,
      work_setting: workSetting,
      max_party_size: maxPartySize ? Number.parseInt(maxPartySize, 10) : null,
      trials_available: trialsAvailable,
      touch_ups: touchUps,
      early_starts: earlyStarts,
      team_available: teamAvailable,
      products: products.trim(),
      pricing_type: pricingType,
      min_spend: minSpend.trim(),
      travel_fees: travelFees.trim(),
      price_includes: priceIncludes.trim(),
      add_ons: addOns.trim(),
      payment_schedule: paymentSchedule.trim(),
      cancellation_policy: cancellationPolicy.trim(),
      other_notes: otherNotes.trim(),
      portfolio_url: portfolioUrl.trim(),
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
        : pricingType === "Per service"
          ? ["starting_at"]
          : pricingType === "Package"
            ? ["fixed_packages"]
            : pricingType === "Custom"
              ? ["custom_quote"]
              : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_profiles")
      .update({
        category: profile.category || "Beauty",
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
    if (services.length === 0) missing.push("Services (at least one)");
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
                  placeholder="e.g., Glow Beauty Studio"
                />
              </Field>
              <Field label="Short tagline" required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder="e.g., Camera-ready looks that last all night."
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
                  placeholder="e.g., 4"
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
                  placeholder="Describe your work, your approach, and what clients can expect."
                  multiline
                />
              </Field>
              <Field label="What you do (one line)">
                <Input
                  value={oneLiner}
                  onChangeText={setOneLiner}
                  placeholder="e.g., Bridal hair & makeup that lasts"
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
              <Field label="Specialties / signature style">
                <Input
                  value={specialties}
                  onChangeText={setSpecialties}
                  placeholder="e.g., Soft glam, natural skin-first looks"
                />
              </Field>
              <Field label="What makes you unique">
                <Input
                  value={unique}
                  onChangeText={(v) => setUnique(v.slice(0, 500))}
                  placeholder="Share what sets you apart…"
                  multiline
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title="Services"
                sub="Select what you offer and how you work."
              />
              <Field label="Services (select all that apply)" required>
                <ChipMulti
                  options={SERVICES}
                  selected={services}
                  onChange={setServices}
                  allowCustom
                />
              </Field>
              <Field label="On-location or studio?">
                <ChipSingle
                  options={["On-location", "Studio", "Both"]}
                  selected={workSetting}
                  onChange={(v) => setWorkSetting(v as typeof workSetting)}
                />
              </Field>
              <Field label="Largest party you can take">
                <Input
                  value={maxPartySize}
                  onChangeText={(v) => setMaxPartySize(v.replace(/[^0-9]/g, ""))}
                  placeholder="e.g., 8"
                  keyboardType="number-pad"
                />
              </Field>
              <Field label="Trials available?">
                <ChipSingle
                  options={yesNo}
                  selected={trialsAvailable}
                  onChange={(v) => setTrialsAvailable(v as typeof trialsAvailable)}
                />
              </Field>
              <Field label="Stay-through / touch-up services?">
                <ChipSingle
                  options={yesNo}
                  selected={touchUps}
                  onChange={(v) => setTouchUps(v as typeof touchUps)}
                />
              </Field>
              <Field label="Early start times available?">
                <ChipSingle
                  options={yesNo}
                  selected={earlyStarts}
                  onChange={(v) => setEarlyStarts(v as typeof earlyStarts)}
                />
              </Field>
              <Field label="Assistants / team available?">
                <ChipSingle
                  options={yesNo}
                  selected={teamAvailable}
                  onChange={(v) => setTeamAvailable(v as typeof teamAvailable)}
                />
              </Field>
              <Field label="Products you use">
                <Input
                  value={products}
                  onChangeText={setProducts}
                  placeholder="e.g., Charlotte Tilbury, NARS, pro-grade lace"
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
                  placeholder="e.g., 95"
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="Minimum spend / party minimum">
                <Input
                  value={minSpend}
                  onChangeText={setMinSpend}
                  placeholder="e.g., 4-person minimum for on-location"
                />
              </Field>
              <Field label="Travel fees">
                <Input
                  value={travelFees}
                  onChangeText={setTravelFees}
                  placeholder="e.g., Free within 20 miles, $1/mile after"
                />
              </Field>
              <Field label="What's included in the starting price">
                <Input
                  value={priceIncludes}
                  onChangeText={setPriceIncludes}
                  placeholder="e.g., Lashes included, touch-up kit"
                  multiline
                />
              </Field>
              <Field label="Add-ons">
                <Input
                  value={addOns}
                  onChangeText={setAddOns}
                  placeholder="e.g., Trial +$85, extensions styling +$40"
                  multiline
                />
              </Field>
              <Field label="Deposit / payment terms">
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder="e.g., 25% deposit to book, balance day-of"
                />
              </Field>
              <Field label="Cancellation / rescheduling policy">
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder="e.g., Deposit transferable up to 30 days out"
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
                sub="Close-ups of finished looks get up to 3× more inquiries."
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label="Portfolio link (optional)">
                <Input
                  value={portfolioUrl}
                  onChangeText={setPortfolioUrl}
                  placeholder="https://…"
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
