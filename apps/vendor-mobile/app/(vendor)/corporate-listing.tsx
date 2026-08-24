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
  darkPillText,
  lightPill,
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
    if (services.length === 0) missing.push("Services offered (at least one)");
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
                  placeholder="e.g., Premier Event Staffing Co."
                />
              </Field>
              <Field label="Short tagline" required>
                <Input
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder="e.g., Professional teams for flawless events."
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
                  placeholder="e.g., 8"
                  keyboardType="number-pad"
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <StepTitle
                title="About your business"
                sub="Show clients why teams book you."
              />
              <Field label="Full description" required>
                <Input
                  value={description}
                  onChangeText={(v) => setDescription(v.slice(0, 1000))}
                  placeholder="Describe your team, experience, and what clients can expect…"
                  multiline
                />
              </Field>
              <Field label="What you offer (one line)">
                <Input
                  value={whatYouOffer}
                  onChangeText={setWhatYouOffer}
                  placeholder="e.g., Trained event staff for functions of any size"
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
              <Field label="What makes you unique">
                <Input
                  value={unique}
                  onChangeText={(v) => setUnique(v.slice(0, 500))}
                  placeholder="Share what sets your team apart…"
                  multiline
                />
              </Field>
              <Field label="Tags & highlights (shown on your listing)">
                <TagList
                  items={tags}
                  onChange={setTags}
                  placeholder="Add a tag — e.g., Fully insured, Bilingual staff"
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle
                title="Services & team"
                sub="What you provide and who's behind it."
              />
              <Field label="Services offered (select all that apply)" required>
                <ChipMulti
                  options={SERVICES}
                  selected={services}
                  onChange={setServices}
                  allowCustom
                />
              </Field>
              <Field label="Team size available">
                <Input
                  value={teamSize}
                  onChangeText={setTeamSize}
                  placeholder="e.g., 40 trained staff on roster"
                />
              </Field>
              <Field label="Staff per event (min – max)">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={minStaff}
                      onChangeText={(v) => setMinStaff(v.replace(/[^0-9]/g, ""))}
                      placeholder="Min"
                      keyboardType="number-pad"
                    />
                  </View>
                  <Text style={{ color: INK_DIM }}>–</Text>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={maxStaff}
                      onChangeText={(v) => setMaxStaff(v.replace(/[^0-9]/g, ""))}
                      placeholder="Max"
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              </Field>
              <Field label="Uniforms / dress code">
                <Input
                  value={uniforms}
                  onChangeText={setUniforms}
                  placeholder="e.g., All black, branded polos, black tie available"
                />
              </Field>
              <Field label="Languages spoken">
                <Input
                  value={languages}
                  onChangeText={setLanguages}
                  placeholder="e.g., English, Spanish"
                />
              </Field>
              <Field label="Licenses / certifications">
                <Input
                  value={licenses}
                  onChangeText={setLicenses}
                  placeholder="e.g., Licensed security, TIPS certified, insured"
                  multiline
                />
              </Field>
              <Field label="Background-checked staff?">
                <ChipSingle
                  options={yesNo}
                  selected={backgroundChecks}
                  onChange={(v) => setBackgroundChecks(v as typeof backgroundChecks)}
                />
              </Field>

              <StepTitle
                title="What's included"
                sub="Add anything — it's your service."
                topGap
              />
              <Field label="What's included in a booking">
                <TagList
                  items={included}
                  onChange={setIncluded}
                  placeholder="Add an item — e.g., On-site supervisor, radios"
                />
              </Field>

              <StepTitle
                title="Logistics & requirements"
                sub="How booking works."
                topGap
              />
              <Field label="Minimum booking (hours / staff)">
                <Input
                  value={minBooking}
                  onChangeText={setMinBooking}
                  placeholder="e.g., 4-hour minimum, 2 staff minimum"
                />
              </Field>
              <Field label="Lead time required">
                <Input
                  value={leadTime}
                  onChangeText={setLeadTime}
                  placeholder="e.g., 1 week notice, 3 weeks for large teams"
                />
              </Field>
              <Field label="Travel fees">
                <Input
                  value={travelFees}
                  onChangeText={setTravelFees}
                  placeholder="e.g., Free within 30 miles"
                />
              </Field>
              <Field label="Requirements from the client">
                <Input
                  value={requirements}
                  onChangeText={setRequirements}
                  placeholder="e.g., Staging area for valet, break room for staff"
                  multiline
                />
              </Field>

              <StepTitle
                title="Make it yours"
                sub="Add any custom field, service, or policy — anything the form didn't ask."
                topGap
              />
              <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />
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
              <Field label="Overtime rates">
                <Input
                  value={overtimeFees}
                  onChangeText={setOvertimeFees}
                  placeholder="e.g., 1.5x after 8 hours"
                />
              </Field>
              <Field label="Additional fees (travel, holidays, etc.)">
                <Input
                  value={additionalFees}
                  onChangeText={setAdditionalFees}
                  placeholder="e.g., Holiday surcharge 20%"
                />
              </Field>
              <Field label="Deposit / payment terms">
                <Input
                  value={paymentSchedule}
                  onChangeText={setPaymentSchedule}
                  placeholder="e.g., 50% to book, balance on completion"
                />
              </Field>

              <StepTitle title="Policies & notes" sub="The fine print." topGap />
              <Field label="Cancellation / rescheduling policy">
                <Input
                  value={cancellationPolicy}
                  onChangeText={setCancellationPolicy}
                  placeholder="e.g., Full refund up to 7 days out"
                  multiline
                />
              </Field>
              <Field label="Insurance / liability">
                <Input
                  value={insurance}
                  onChangeText={setInsurance}
                  placeholder="e.g., $2M general liability, COI on request"
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
                sub="Show your team in action — uniforms, service moments, and setups build trust."
              />
              <ListingPhotosGrid vendorId={profile.id} onCount={setPhotoCount} />
              <Field label="Brochure / capabilities PDF (optional)">
                <Input
                  value={brochureUrl}
                  onChangeText={setBrochureUrl}
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
