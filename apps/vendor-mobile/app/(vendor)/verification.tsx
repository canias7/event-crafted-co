// Verification — structured "get the verified badge" flow, per the
// reference mock. Pro/Premium vendors submit one account-level request:
// identity (legal name, DOB, government ID photos) + business info +
// proof documents. Admins review in the admin panel; approval stamps
// vendor_profiles.verified_at (the public badge) and optionally the
// Insured marker. Statuses: under_review → approved / needs_info
// (vendor edits + resubmits).
//
// Documents land in the PRIVATE vendor-verifications bucket under the
// user's folder — only the owner and admins can read them (RLS).
// Applying is a Pro/Premium perk (Free sees the upgrade pitch; the
// insert policy also enforces Pro+ server-side) — but approval is
// always a manual admin decision, never bought.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { compressForUpload } from "@/lib/imageManipulation";
import { Field, Input, useBrandDialog } from "@/components/listing/WizardKit";
import { PLANS_PAUSED } from "@/lib/plans";
import { useT } from "@/lib/i18n";
import { C } from "@/lib/theme";

const PAGE = C.page;
const CARD = C.card;
const SURFACE = C.surface;
const BORDER = C.border;
const INK = C.text;
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = C.textDim;
const GOLD = C.gold;
const GOLD_SOFT = C.pending;
const BRONZE = C.accentText;
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

type Step = "intro" | "identity" | "business" | "review";

interface RequestRow {
  id: string;
  status: "under_review" | "approved" | "needs_info" | "rejected";
  legal_first_name: string;
  legal_last_name: string;
  dob: string | null;
  business_name: string;
  business_category: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  website: string | null;
  documents: { name: string; path: string }[];
  admin_note: string | null;
  submitted_at: string;
}

interface LocalDoc {
  // Either an already-uploaded path (resubmit) or a local uri to upload.
  name: string;
  path?: string;
  uri?: string;
}

function parseDob(input: string): string | null {
  // Accepts MM/DD/YYYY → YYYY-MM-DD. Returns null when unparseable.
  const m = input.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const month = Number(mm), day = Number(dd), year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  return `${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Proof documents are stored as "Document 1", "Document 2"… (the admin
// panel reads them in English); show them in the app's language.
function docLabel(name: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const m = name.match(/^Document (\d+)$/);
  return m ? t("docs.numbered", { n: m[1] }) : name;
}

function dobToDisplay(iso: string | null): string {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-");
  return `${mo}/${d}/${y}`;
}

export default function VerificationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const dialog = useBrandDialog();
  const { t } = useT("verification");

  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [editing, setEditing] = useState(false); // needs_info resubmission
  const [step, setStep] = useState<Step>("intro");
  const [submitting, setSubmitting] = useState(false);

  // identity
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dobText, setDobText] = useState("");
  const [idFront, setIdFront] = useState<LocalDoc | null>(null);
  const [idBack, setIdBack] = useState<LocalDoc | null>(null);

  // business
  const [bizName, setBizName] = useState("");
  const [bizCategory, setBizCategory] = useState("");
  const [bizEmail, setBizEmail] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [bizAddress, setBizAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [docs, setDocs] = useState<LocalDoc[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [{ data: prof }, { data: req }, { data: listing }] = await Promise.all([
      supabase
        .from("profiles")
        .select("subscription_tier, unlimited_listings")
        .eq("id", user.id)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_verification_requests")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_profiles")
        .select("business_name, category, location")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    const p = prof as { subscription_tier?: string; unlimited_listings?: boolean } | null;
    const tier = p?.subscription_tier ?? "free";
    setEligible(tier === "pro" || tier === "studio" || !!p?.unlimited_listings);
    const r = req as RequestRow | null;
    setRequest(r);
    if (r) {
      // Prefill for a needs_info edit round.
      setFirstName(r.legal_first_name);
      setLastName(r.legal_last_name);
      setDobText(dobToDisplay(r.dob));
      setBizName(r.business_name);
      setBizCategory(r.business_category ?? "");
      setBizEmail(r.business_email ?? "");
      setBizPhone(r.business_phone ?? "");
      setBizAddress(r.business_address ?? "");
      setWebsite(r.website ?? "");
      setDocs((r.documents ?? []).map((d) => ({ name: d.name, path: d.path })));
    } else {
      // Prefill business info from the primary listing.
      const l = listing as { business_name?: string; category?: string; location?: string } | null;
      if (l) {
        setBizName((cur) => cur || l.business_name || "");
        setBizCategory((cur) => cur || l.category || "");
        setBizAddress((cur) => cur || l.location || "");
      }
      setBizEmail((cur) => cur || user.email || "");
    }
    setLoading(false);
  }, [user?.id, user?.email]);

  useEffect(() => {
    load();
  }, [load]);

  async function pickImage(onPicked: (doc: LocalDoc) => void, label: string) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      dialog.show({
        icon: "image",
        title: t("alerts.library.title"),
        message: t("alerts.library.message"),
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (result.canceled || result.assets.length === 0) return;
    onPicked({ name: label, uri: result.assets[0].uri });
  }

  // Uploads a local image into the private bucket; returns the path.
  async function uploadDoc(doc: LocalDoc, slug: string): Promise<string> {
    if (doc.path) return doc.path; // already uploaded (resubmit round)
    const { uri, mime } = await compressForUpload({ uri: doc.uri! });
    const bytes = await (await fetch(uri)).arrayBuffer();
    if (bytes.byteLength === 0) throw new Error(t("alerts.emptyFile"));
    const path = `${user!.id}/${slug}-${Date.now()}.jpg`;
    const up = await supabase.storage
      .from("vendor-verifications")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) throw new Error(up.error.message);
    return path;
  }

  async function submit() {
    if (!user?.id || submitting) return;
    setSubmitting(true);
    try {
      const idFrontPath = await uploadDoc(idFront!, "id-front");
      const idBackPath = idBack ? await uploadDoc(idBack, "id-back") : null;
      const docPaths: { name: string; path: string }[] = [];
      for (let i = 0; i < docs.length; i++) {
        docPaths.push({ name: docs[i].name, path: await uploadDoc(docs[i], `doc-${i}`) });
      }
      const payload = {
        status: "under_review",
        legal_first_name: firstName.trim(),
        legal_last_name: lastName.trim(),
        dob: parseDob(dobText),
        id_front_path: idFrontPath,
        id_back_path: idBackPath,
        business_name: bizName.trim(),
        business_category: bizCategory.trim() || null,
        business_email: bizEmail.trim() || null,
        business_phone: bizPhone.trim() || null,
        business_address: bizAddress.trim() || null,
        website: website.trim() || null,
        documents: docPaths,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const q = request
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("vendor_verification_requests")
            .update(payload)
            .eq("id", request.id)
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("vendor_verification_requests")
            .insert({ ...payload, user_id: user.id });
      const { error } = await q;
      if (error) throw new Error(error.message);
      setEditing(false);
      await load();
      dialog.show({
        icon: "check-circle",
        title: t("alerts.submitted.title"),
        message: t("alerts.submitted.message"),
      });
    } catch (e) {
      dialog.show({
        icon: "alert-circle",
        title: t("alerts.submitFailed.title"),
        message: e instanceof Error ? e.message : t("alerts.submitFailed.message"),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const identityComplete = !!(firstName.trim() && lastName.trim() && idFront);
  const businessComplete = !!(bizName.trim() && docs.length > 0);

  if (loading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: PAGE, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  // ---- shared chrome ----
  function Header({ title, onBack }: { title: string; onBack: () => void }) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <Pressable onPress={onBack} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={INK} />
        </Pressable>
        <Text style={{ flexShrink: 1, textAlign: "center", marginHorizontal: 8, fontFamily: SERIF_BOLD, fontSize: 20, color: INK }}>
          {title}
        </Text>
        <View style={{ width: 26 }} />
      </View>
    );
  }

  // ---- not eligible (Free plan) ----
  if (!eligible && !request) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 132 }}
          showsVerticalScrollIndicator={false}
        >
          <Header title={t("title")} onBack={() => router.back()} />
          <View style={{ alignItems: "center", marginTop: 28 }}>
            <MaterialCommunityIcons name="shield-check-outline" size={70} color={GOLD} />
          </View>
          <Text
            style={{
              marginTop: 16,
              textAlign: "center",
              fontFamily: SERIF_BOLD,
              fontSize: 24,
              color: INK,
            }}
          >
            {t("intro.title")}
          </Text>
          <Text
            style={{ fontFamily: SERIF, marginTop: 8, textAlign: "center", fontSize: 14, lineHeight: 21, color: INK_DIM }}
          >
            {PLANS_PAUSED ? t("upsell.bodyPaused") : t("upsell.body")}
          </Text>
          {/* Plans paused (lib/plans.ts): no upgrade button. */}
          {!PLANS_PAUSED ? (
          <Pressable
            onPress={() => router.push("/(vendor)/subscription" as never)}
            style={{
              marginTop: 28,
              backgroundColor: GOLD,
              borderRadius: 999,
              height: 52,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, color: C.onGold, fontSize: 15}}>
              {t("upsell.cta")}
            </Text>
          </Pressable>
          ) : null}
        </ScrollView>
        {dialog.element}
      </SafeAreaView>
    );
  }

  // ---- status view (existing request, not editing) ----
  if (request && !editing) {
    const s = request.status;
    const icon =
      s === "approved" ? "check-circle" : s === "needs_info" ? "alert-circle" : "clock";
    const iconColor = s === "approved" ? INK : s === "needs_info" ? C.error : BRONZE;
    const title =
      s === "approved"
        ? t("status.approved.title")
        : s === "needs_info"
          ? t("status.needsInfo.title")
          : s === "rejected"
            ? t("status.rejected.title")
            : t("status.underReview.title");
    const body =
      s === "approved"
        ? t("status.approved.body")
        : s === "needs_info"
          ? request.admin_note
            ? t("status.needsInfo.note", { note: request.admin_note })
            : t("status.needsInfo.body")
          : s === "rejected"
            ? request.admin_note ?? t("status.rejected.body")
            : t("status.underReview.body");
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 132 }}
          showsVerticalScrollIndicator={false}
        >
          <Header title={t("title")} onBack={() => router.back()} />
          <View
            style={{
              marginTop: 24,
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 20,
              padding: 16,
              alignItems: "center",
            }}
          >
            <Feather name={icon as never} size={44} color={iconColor} />
            <Text
              style={{
                marginTop: 12,
                fontFamily: SERIF_BOLD,
                fontSize: 24,
                color: INK,
                textAlign: "center",
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                fontFamily: SERIF,
                marginTop: 8,
                fontSize: 14,
                lineHeight: 20,
                color: INK_DIM,
                textAlign: "center",
              }}
            >
              {body}
            </Text>
            {s === "approved" ? (
              <View
                style={{
                  marginTop: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  backgroundColor: GOLD_SOFT,
                  borderRadius: 999,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                }}
              >
                <MaterialCommunityIcons name="shield-check" size={16} color={BRONZE} />
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: BRONZE }}>
                  {t("status.badge")}
                </Text>
              </View>
            ) : null}
          </View>
          {(s === "needs_info" || s === "rejected") ? (
            <Pressable
              onPress={() => {
                setEditing(true);
                setStep("identity");
              }}
              style={{
                marginTop: 20,
                backgroundColor: GOLD,
                borderRadius: 999,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: C.onGold, fontSize: 15}}>
                {t("status.resubmit")}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
        {dialog.element}
      </SafeAreaView>
    );
  }

  // ---- application flow ----
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === "intro" ? (
          <>
            <Header title={t("title")} onBack={() => router.back()} />
            <View style={{ alignItems: "center", marginTop: 20 }}>
              <MaterialCommunityIcons name="shield-check" size={76} color={GOLD} />
            </View>
            <Text
              style={{
                marginTop: 16,
                textAlign: "center",
                fontFamily: SERIF_BOLD,
                fontSize: 24,
                color: INK,
              }}
            >
              {t("intro.title")}
            </Text>
            <Text
              style={{ fontFamily: SERIF, marginTop: 6, textAlign: "center", fontSize: 13, lineHeight: 19, color: INK_DIM }}
            >
              {t("intro.subtitle")}
            </Text>
            <View style={{ marginTop: 24, gap: 16 }}>
              {[
                { icon: "user-check", key: "identity" },
                { icon: "briefcase", key: "business" },
                { icon: "file-text", key: "documents" },
              ].map((r) => (
                <View key={r.key} style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      backgroundColor: SURFACE,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather name={r.icon as never} size={18} color={INK} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 16, color: INK }}>
                      {t(`intro.steps.${r.key}.title`)}
                    </Text>
                    <Text style={{ fontFamily: SERIF, marginTop: 1, fontSize: 13, color: INK_DIM }}>{t(`intro.steps.${r.key}.subtitle`)}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View
              style={{
                marginTop: 24,
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 20,
                padding: 16,
              }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK, marginBottom: 8 }}>
                {t("intro.benefitsTitle")}
              </Text>
              {(["badge", "visibility", "trust"] as const).map((b) => (
                <View key={b} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <Feather name="check" size={13} color={GOLD} />
                  <Text style={{ flexShrink: 1, fontFamily: SERIF, fontSize: 13, color: INK }}>{t(`intro.benefits.${b}`)}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => setStep("identity")}
              style={{
                marginTop: 24,
                backgroundColor: GOLD,
                borderRadius: 999,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: C.onGold, fontSize: 15}}>
                {t("intro.start")}
              </Text>
            </Pressable>
          </>
        ) : null}

        {step === "identity" ? (
          <>
            <Header
              title={t("identity.title")}
              onBack={() => (editing && request ? setEditing(false) : setStep("intro"))}
            />
            <Text style={{ fontFamily: SERIF, textAlign: "center", fontSize: 13, color: INK_DIM, marginBottom: 16 }}>
              {t("identity.subtitle")}
            </Text>
            <Field label={t("identity.firstName.label")} required>
              <Input value={firstName} onChangeText={setFirstName} placeholder={t("identity.firstName.placeholder")} />
            </Field>
            <Field label={t("identity.lastName.label")} required>
              <Input value={lastName} onChangeText={setLastName} placeholder={t("identity.lastName.placeholder")} />
            </Field>
            <Field label={t("identity.dob")}>
              <Input
                value={dobText}
                onChangeText={setDobText}
                placeholder="07/14/1996"
                keyboardType="numbers-and-punctuation"
              />
            </Field>
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK, marginTop: 8, marginBottom: 8 }}>
              {t("identity.govId")}
            </Text>
            <DocTile
              label={t("identity.uploadFront")}
              doc={idFront}
              onPick={() => pickImage(setIdFront, "ID front")}
              onClear={() => setIdFront(null)}
            />
            <DocTile
              label={t("identity.uploadBack")}
              doc={idBack}
              onPick={() => pickImage(setIdBack, "ID back")}
              onClear={() => setIdBack(null)}
            />
            <Pressable
              onPress={() => {
                if (!identityComplete) {
                  dialog.show({
                    icon: "list",
                    title: t("alerts.almostThere"),
                    message: t("alerts.identityRequired"),
                  });
                  return;
                }
                if (dobText.trim() && !parseDob(dobText)) {
                  dialog.show({
                    icon: "calendar",
                    title: t("alerts.checkDate.title"),
                    message: t("alerts.checkDate.message"),
                  });
                  return;
                }
                setStep("business");
              }}
              style={{
                marginTop: 20,
                backgroundColor: GOLD,
                borderRadius: 999,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: C.onGold, fontSize: 15}}>{t("continue")}</Text>
            </Pressable>
          </>
        ) : null}

        {step === "business" ? (
          <>
            <Header title={t("business.title")} onBack={() => setStep("identity")} />
            <Text style={{ fontFamily: SERIF, textAlign: "center", fontSize: 13, color: INK_DIM, marginBottom: 16 }}>
              {t("business.subtitle")}
            </Text>
            <Field label={t("business.name.label")} required>
              <Input value={bizName} onChangeText={setBizName} placeholder={t("business.name.placeholder")} />
            </Field>
            <Field label={t("business.category.label")}>
              <Input value={bizCategory} onChangeText={setBizCategory} placeholder={t("business.category.placeholder")} />
            </Field>
            <Field label={t("business.email.label")}>
              <Input
                value={bizEmail}
                onChangeText={setBizEmail}
                placeholder={t("business.email.placeholder")}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Field>
            <Field label={t("business.phone")}>
              <Input
                value={bizPhone}
                onChangeText={setBizPhone}
                placeholder="(704) 555-1234"
                keyboardType="phone-pad"
              />
            </Field>
            <Field label={t("business.address.label")}>
              <Input value={bizAddress} onChangeText={setBizAddress} placeholder={t("business.address.placeholder")} />
            </Field>
            <Field label={t("business.website.label")}>
              <Input
                value={website}
                onChangeText={setWebsite}
                placeholder={t("business.website.placeholder")}
                autoCapitalize="none"
              />
            </Field>
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK, marginTop: 8 }}>
              {t("business.proof.title")}
            </Text>
            <Text style={{ fontFamily: SERIF, fontSize: 13, color: INK_DIM, marginTop: 2, marginBottom: 8 }}>
              {t("business.proof.body")}
            </Text>
            {docs.map((d, i) => (
              <DocTile
                key={`${d.name}-${i}`}
                label={docLabel(d.name, t)}
                doc={d}
                onPick={() => {}}
                onClear={() => setDocs((cur) => cur.filter((_, j) => j !== i))}
              />
            ))}
            {docs.length < 4 ? (
              <Pressable
                onPress={() =>
                  pickImage(
                    (doc) =>
                      setDocs((cur) => [
                        ...cur,
                        { ...doc, name: `Document ${cur.length + 1}` },
                      ]),
                    "Document",
                  )
                }
                style={{
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: GOLD,
                  backgroundColor: "rgba(201,168,106,0.12)",
                  borderRadius: 12,
                  paddingVertical: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  marginBottom: 8,
                }}
              >
                <Feather name="plus" size={15} color={INK} />
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>
                  {docs.length === 0 ? t("business.proof.addFirst") : t("business.proof.addAnother")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                if (!businessComplete) {
                  dialog.show({
                    icon: "list",
                    title: t("alerts.almostThere"),
                    message: t("alerts.businessRequired"),
                  });
                  return;
                }
                setStep("review");
              }}
              style={{
                marginTop: 16,
                backgroundColor: GOLD,
                borderRadius: 999,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: C.onGold, fontSize: 15}}>{t("continue")}</Text>
            </Pressable>
          </>
        ) : null}

        {step === "review" ? (
          <>
            <Header title={t("review.title")} onBack={() => setStep("business")} />
            <Text style={{ fontFamily: SERIF, textAlign: "center", fontSize: 13, color: INK_DIM, marginBottom: 16 }}>
              {t("review.subtitle")}
            </Text>
            <SummaryCard
              title={t("review.identity")}
              lines={[
                `${firstName.trim()} ${lastName.trim()}`.trim(),
                dobText.trim() ? t("review.dob", { dob: dobText.trim() }) : "",
                idBack ? t("review.idFrontBack") : t("review.idFront"),
              ].filter(Boolean)}
              onEdit={() => setStep("identity")}
            />
            <SummaryCard
              title={t("review.business")}
              lines={[
                bizName.trim(),
                bizCategory.trim(),
                bizAddress.trim(),
                bizEmail.trim(),
              ].filter(Boolean)}
              onEdit={() => setStep("business")}
            />
            <SummaryCard
              title={t("review.documents", { count: docs.length })}
              lines={docs.map((d) => docLabel(d.name, t))}
              onEdit={() => setStep("business")}
            />
            <View
              style={{
                marginTop: 6,
                backgroundColor: GOLD_SOFT,
                borderWidth: 1,
                borderColor: GOLD,
                borderRadius: 20,
                padding: 16,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Feather name="check-circle" size={14} color={BRONZE} />
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>
                  {t("review.nextTitle")}
                </Text>
              </View>
              <Text style={{ fontFamily: SERIF, marginTop: 6, fontSize: 13, lineHeight: 18, color: INK_DIM }}>
                {t("review.nextBody")}
              </Text>
            </View>
            <Pressable
              onPress={() => void submit()}
              disabled={submitting}
              style={{
                marginTop: 20,
                backgroundColor: submitting ? C.goldMuted : GOLD,
                borderRadius: 999,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {submitting ? (
                <ActivityIndicator color={C.onGold} />
              ) : (
                <Text style={{ fontFamily: SERIF_BOLD, color: C.onGold, fontSize: 15}}>
                  {t("review.submit")}
                </Text>
              )}
            </Pressable>
            <Text
              style={{ fontFamily: SERIF, marginTop: 10, textAlign: "center", fontSize: 12, color: INK_DIM, lineHeight: 16 }}
            >
              {t("review.terms")}
            </Text>
          </>
        ) : null}
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

function DocTile({
  label,
  doc,
  onPick,
  onClear,
}: {
  label: string;
  doc: LocalDoc | null;
  onPick: () => void;
  onClear: () => void;
}) {
  const { t } = useT("verification");
  const has = !!doc && (!!doc.uri || !!doc.path);
  return (
    <Pressable
      onPress={has ? undefined : onPick}
      style={{
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: has ? INK : BORDER,
        borderStyle: has ? "solid" : "dashed",
        borderRadius: 12,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
      }}
    >
      {doc?.uri ? (
        <Image
          source={{ uri: doc.uri }}
          style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: SURFACE }}
        />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            backgroundColor: SURFACE,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={has ? "file-text" : "upload"} size={17} color={INK} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 11 }}>
        <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>{label}</Text>
        <Text style={{ fontFamily: SERIF, marginTop: 1, fontSize: 12, color: INK_DIM }}>
          {has ? (doc?.path && !doc?.uri ? t("docs.onFile") : t("docs.ready")) : t("docs.hint")}
        </Text>
      </View>
      {has ? (
        <Pressable onPress={onClear} hitSlop={8}>
          <Feather name="x" size={16} color={INK_DIM} />
        </Pressable>
      ) : (
        <Feather name="chevron-right" size={18} color={INK_DIM} />
      )}
    </Pressable>
  );
}

function SummaryCard({
  title,
  lines,
  onEdit,
}: {
  title: string;
  lines: string[];
  onEdit: () => void;
}) {
  const { t } = useT("verification");
  return (
    <View
      style={{
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ flexShrink: 1, fontFamily: SERIF_BOLD, fontSize: 16, color: INK }}>
          {title}
        </Text>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: BRONZE }}>{t("review.edit")}</Text>
        </Pressable>
      </View>
      {lines.map((l) => (
        <Text key={l} style={{ fontFamily: SERIF, marginTop: 4, fontSize: 13, color: INK_DIM }}>
          {l}
        </Text>
      ))}
    </View>
  );
}
