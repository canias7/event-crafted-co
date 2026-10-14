// Sub-sections rendered on the native listing builder. Each manages
// one slice of the listing detail (packages, FAQs, policies, team
// bios). All four mirror the web equivalents in
// apps/web/src/components/vendor/{Package,VendorFaqs,VendorPolicy,VendorTeam}*
// — same data model, leaner mobile UI.

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/i18n";
import { C, IS_DARK } from "@/lib/theme";

const PLACEHOLDER = C.placeholder;
// Pressed row: the surface tint in light (as before); a fade in dark,
// where NativeWind's bg-muted would flash light.
const ROW_PRESS = IS_DARK ? "active:opacity-70" : "active:bg-muted";

// ----------------------------------------------------------------------------
// Section header — section title + add button.
function SectionHeader({
  title,
  subtitle,
  onAdd,
}: {
  title: string;
  subtitle?: string;
  onAdd?: () => void;
}) {
  const { t } = useT("listingSections");
  return (
    <View className="flex-row items-end justify-between">
      <View className="flex-1 pr-3">
        <Text className="text-lg" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>{title}</Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onAdd ? (
        <Pressable
          onPress={onAdd}
          hitSlop={6}
          className="rounded-full border px-3 h-9 justify-center active:opacity-70" style={{ borderColor: C.border, backgroundColor: C.field }}
        >
          <Text className="text-xs" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>{t("add")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ============================================================================
// PACKAGES
// vendor_packages: name, description, price_cents, includes (jsonb[]),
// display_order, is_active. Public read on active rows; vendor team
// can CRUD their own.
// ============================================================================

interface Pack {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  includes: string[];
  display_order: number;
  is_active: boolean;
}

interface PackDraft {
  id?: string;
  name: string;
  description: string;
  price: string; // dollars as string
  includes: string; // newline-separated for the textarea
  is_active: boolean;
}

const EMPTY_PACK: PackDraft = {
  name: "",
  description: "",
  price: "",
  includes: "",
  is_active: true,
};

export function PackagesSection({ vendorId }: { vendorId: string }) {
  const { t } = useT("listingSections");
  const [items, setItems] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PackDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("vendor_packages")
      .select(
        "id, name, description, price_cents, includes, display_order, is_active",
      )
      .eq("vendor_id", vendorId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    setItems((data as unknown as Pack[]) ?? []);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!editing) return;
    const trimmed = editing.name.trim();
    const cents = Math.round(Number.parseFloat(editing.price || "0") * 100);
    if (!trimmed) {
      Alert.alert(t("packages.nameRequired"));
      return;
    }
    if (!Number.isFinite(cents) || cents < 0) {
      Alert.alert(t("packages.priceNumber"));
      return;
    }
    setBusy(true);
    try {
      const includes = editing.includes
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        vendor_id: vendorId,
        name: trimmed,
        description: editing.description.trim() || null,
        price_cents: cents,
        includes,
        is_active: editing.is_active,
      };
      if (editing.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("vendor_packages")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const nextOrder =
          items.length === 0
            ? 0
            : Math.max(...items.map((i) => i.display_order)) + 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("vendor_packages")
          .insert({ ...payload, display_order: nextOrder });
        if (error) throw error;
      }
      setEditing(null);
      await load();
    } catch (err) {
      Alert.alert(
        t("packages.saveError"),
        (err as { message?: string })?.message ?? t("tryAgain"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    Alert.alert(t("packages.deleteTitle"), t("cantUndo"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from("vendor_packages")
            .delete()
            .eq("id", id);
          if (error) Alert.alert(t("deleteError"), error.message);
          else load();
        },
      },
    ]);
  }

  return (
    <View className="gap-3">
      <SectionHeader
        title={t("packages.title")}
        subtitle={t("packages.subtitle")}
        onAdd={() => setEditing({ ...EMPTY_PACK })}
      />
      {loading ? (
        <Text className="text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>{t("loading")}</Text>
      ) : items.length === 0 ? (
        <Text className="text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
          {t("packages.empty")}
        </Text>
      ) : (
        items.map((p) => (
          <View
            key={p.id}
            className="rounded-[20px] border p-4" style={{ borderColor: C.border, backgroundColor: C.card }}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                  {p.name}
                </Text>
                <Text className="text-sm" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
                  ${(p.price_cents / 100).toLocaleString("en-US")}
                  {p.is_active ? "" : ` · ${t("packages.inactive")}`}
                </Text>
                {p.description ? (
                  <Text className="mt-1 text-sm" style={{ fontFamily: "LibreBaskerville", color: C.text }}>
                    {p.description}
                  </Text>
                ) : null}
                {p.includes && p.includes.length > 0 ? (
                  <View className="mt-2 gap-1">
                    {p.includes.slice(0, 4).map((line, idx) => (
                      <Text
                        key={idx}
                        className="text-xs"
                        style={{ fontFamily: "LibreBaskerville", color: C.textDim }}
                      >
                        • {line}
                      </Text>
                    ))}
                    {p.includes.length > 4 ? (
                      <Text className="text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
                        {t("packages.more", { count: p.includes.length - 4 })}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <View className="gap-2">
                <Pressable
                  onPress={() =>
                    setEditing({
                      id: p.id,
                      name: p.name,
                      description: p.description ?? "",
                      price: String(p.price_cents / 100),
                      includes: (p.includes ?? []).join("\n"),
                      is_active: p.is_active,
                    })
                  }
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Feather name="edit-2" size={18} color={C.placeholder} />
                </Pressable>
                <Pressable
                  onPress={() => remove(p.id)}
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Feather name="trash-2" size={18} color={C.error} />
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}
      <PackEditorModal
        draft={editing}
        busy={busy}
        onChange={setEditing}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </View>
  );
}

function PackEditorModal({
  draft,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  draft: PackDraft | null;
  busy: boolean;
  onChange: (d: PackDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useT("listingSections");
  return (
    <Modal
      visible={draft != null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {draft ? (
        <SafeAreaView className="flex-1" style={{ backgroundColor: C.page }} edges={["top", "bottom"]}>
          <View className="flex-row items-center justify-between px-5 py-3 border-b" style={{ borderColor: C.border }}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text className="text-sm" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>{t("cancel")}</Text>
            </Pressable>
            <Text className="text-base" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
              {draft.id ? t("packages.edit") : t("packages.new")}
            </Text>
            <Pressable onPress={onSave} hitSlop={8} disabled={busy}>
              <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                {busy ? t("saving") : t("save")}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-5 py-4 gap-4 pb-24"
          >
            <View>
              <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                {t("packages.name")}
              </Text>
              <TextInput style={{ fontFamily: "LibreBaskerville", borderColor: C.border, backgroundColor: C.page, color: C.text }}
                value={draft.name}
                onChangeText={(v) => onChange({ ...draft, name: v })}
                placeholder={t("packages.namePlaceholder")}
                placeholderTextColor={PLACEHOLDER}
                className="mt-2 rounded-xl border px-4 py-3 text-base"
              />
            </View>
            <View>
              <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                {t("packages.description")}
              </Text>
              <TextInput style={{ fontFamily: "LibreBaskerville", borderColor: C.border, backgroundColor: C.page, color: C.text }}
                value={draft.description}
                onChangeText={(v) => onChange({ ...draft, description: v })}
                placeholder={t("packages.descriptionPlaceholder")}
                placeholderTextColor={PLACEHOLDER}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="mt-2 min-h-[80px] rounded-xl border px-4 py-3 text-base"
              />
            </View>
            <View>
              <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                {t("packages.price")}
              </Text>
              <TextInput style={{ fontFamily: "LibreBaskerville", borderColor: C.border, backgroundColor: C.page, color: C.text }}
                value={draft.price}
                onChangeText={(v) => onChange({ ...draft, price: v })}
                placeholder="0"
                placeholderTextColor={PLACEHOLDER}
                keyboardType="decimal-pad"
                className="mt-2 rounded-xl border px-4 py-3 text-base"
              />
            </View>
            <View>
              <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                {t("packages.includes")}
              </Text>
              <Text className="mt-1 text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
                {t("packages.includesHint")}
              </Text>
              <TextInput style={{ fontFamily: "LibreBaskerville", borderColor: C.border, backgroundColor: C.page, color: C.text }}
                value={draft.includes}
                onChangeText={(v) => onChange({ ...draft, includes: v })}
                placeholder={t("packages.includesPlaceholder")}
                placeholderTextColor={PLACEHOLDER}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                className="mt-2 min-h-[120px] rounded-xl border px-4 py-3 text-base"
              />
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                {t("packages.active")}
              </Text>
              <Switch
                value={draft.is_active}
                onValueChange={(v) => onChange({ ...draft, is_active: v })}
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      ) : null}
    </Modal>
  );
}

// ============================================================================
// FAQs
// vendor_faqs: question, answer, display_order. Public read; vendor
// owners CRUD via owner-of-vendor RLS.
// ============================================================================

interface Faq {
  id: string;
  question: string;
  answer: string;
  display_order: number;
}

interface FaqDraft {
  id?: string;
  question: string;
  answer: string;
}

const EMPTY_FAQ: FaqDraft = { question: "", answer: "" };

export function FaqsSection({ vendorId }: { vendorId: string }) {
  const { t } = useT("listingSections");
  const [items, setItems] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FaqDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("vendor_faqs")
      .select("id, question, answer, display_order")
      .eq("vendor_id", vendorId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    setItems((data as unknown as Faq[]) ?? []);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!editing) return;
    const q = editing.question.trim();
    const a = editing.answer.trim();
    if (!q || !a) {
      Alert.alert(t("faqs.bothRequired"));
      return;
    }
    setBusy(true);
    try {
      if (editing.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("vendor_faqs")
          .update({ question: q, answer: a })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const nextOrder =
          items.length === 0
            ? 0
            : Math.max(...items.map((i) => i.display_order)) + 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("vendor_faqs").insert({
          vendor_id: vendorId,
          question: q,
          answer: a,
          display_order: nextOrder,
        });
        if (error) throw error;
      }
      setEditing(null);
      await load();
    } catch (err) {
      Alert.alert(
        t("faqs.saveError"),
        (err as { message?: string })?.message ?? t("tryAgain"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    Alert.alert(t("faqs.deleteTitle"), t("cantUndo"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from("vendor_faqs")
            .delete()
            .eq("id", id);
          if (error) Alert.alert(t("deleteError"), error.message);
          else load();
        },
      },
    ]);
  }

  return (
    <View className="gap-3">
      <SectionHeader
        title={t("faqs.title")}
        subtitle={t("faqs.subtitle")}
        onAdd={() => setEditing({ ...EMPTY_FAQ })}
      />
      {loading ? (
        <Text className="text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>{t("loading")}</Text>
      ) : items.length === 0 ? (
        <Text className="text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
          {t("faqs.empty")}
        </Text>
      ) : (
        items.map((f) => (
          <View
            key={f.id}
            className="rounded-[20px] border p-4" style={{ borderColor: C.border, backgroundColor: C.card }}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                  {f.question}
                </Text>
                <Text className="mt-1 text-sm" style={{ fontFamily: "LibreBaskerville", color: C.text }}>
                  {f.answer}
                </Text>
              </View>
              <View className="gap-2">
                <Pressable
                  onPress={() =>
                    setEditing({
                      id: f.id,
                      question: f.question,
                      answer: f.answer,
                    })
                  }
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Feather name="edit-2" size={18} color={C.placeholder} />
                </Pressable>
                <Pressable
                  onPress={() => remove(f.id)}
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Feather name="trash-2" size={18} color={C.error} />
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}
      <Modal
        visible={editing != null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditing(null)}
      >
        {editing ? (
          <SafeAreaView
            className="flex-1" style={{ backgroundColor: C.page }}
            edges={["top", "bottom"]}
          >
            <View className="flex-row items-center justify-between px-5 py-3 border-b" style={{ borderColor: C.border }}>
              <Pressable onPress={() => setEditing(null)} hitSlop={8}>
                <Text className="text-sm" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>{t("cancel")}</Text>
              </Pressable>
              <Text className="text-base" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                {editing.id ? t("faqs.edit") : t("faqs.new")}
              </Text>
              <Pressable onPress={save} hitSlop={8} disabled={busy}>
                <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                  {busy ? t("saving") : t("save")}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="px-5 py-4 gap-4 pb-24"
            >
              <View>
                <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                  {t("faqs.question")}
                </Text>
                <TextInput style={{ fontFamily: "LibreBaskerville", borderColor: C.border, backgroundColor: C.page, color: C.text }}
                  value={editing.question}
                  onChangeText={(v) =>
                    setEditing({ ...editing, question: v })
                  }
                  placeholder={t("faqs.questionPlaceholder")}
                  placeholderTextColor={PLACEHOLDER}
                  className="mt-2 rounded-xl border px-4 py-3 text-base"
                />
              </View>
              <View>
                <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
                  {t("faqs.answer")}
                </Text>
                <TextInput style={{ fontFamily: "LibreBaskerville", borderColor: C.border, backgroundColor: C.page, color: C.text }}
                  value={editing.answer}
                  onChangeText={(v) => setEditing({ ...editing, answer: v })}
                  placeholder={t("faqs.answerPlaceholder")}
                  placeholderTextColor={PLACEHOLDER}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  className="mt-2 min-h-[120px] rounded-xl border px-4 py-3 text-base"
                />
              </View>
            </ScrollView>
          </SafeAreaView>
        ) : null}
      </Modal>
    </View>
  );
}

// ============================================================================
// POLICIES
// vendor_profiles columns: deposit_pct (int), cancellation_policy (text),
// reschedule_window_days (int), policy_notes (text). Edited inline.
// ============================================================================

// Stored values; labels come from listingSections → policies.options.
const CANCELLATION_OPTIONS = [
  { value: "", key: "none" },
  { value: "flexible", key: "flexible" },
  { value: "moderate", key: "moderate" },
  { value: "strict", key: "strict" },
] as const;

export function PoliciesSection({ vendorId }: { vendorId: string }) {
  const { t } = useT("listingSections");
  const [depositPct, setDepositPct] = useState("");
  const [cancellation, setCancellation] = useState("");
  const [reschedule, setReschedule] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("vendor_profiles")
      .select(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "deposit_pct, cancellation_policy, reschedule_window_days, policy_notes" as any,
      )
      .eq("id", vendorId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (data as any) ?? {};
    setDepositPct(row.deposit_pct != null ? String(row.deposit_pct) : "");
    setCancellation(row.cancellation_policy ?? "");
    setReschedule(
      row.reschedule_window_days != null
        ? String(row.reschedule_window_days)
        : "",
    );
    setNotes(row.policy_notes ?? "");
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const dep =
        depositPct.trim() === "" ? null : Number.parseInt(depositPct, 10);
      const resched =
        reschedule.trim() === "" ? null : Number.parseInt(reschedule, 10);
      const payload: Record<string, unknown> = {
        deposit_pct: Number.isFinite(dep) ? dep : null,
        cancellation_policy: cancellation || null,
        reschedule_window_days: Number.isFinite(resched) ? resched : null,
        policy_notes: notes.trim() || null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_profiles")
        .update(payload)
        .eq("id", vendorId);
      if (error) throw error;
      Alert.alert(t("policies.savedTitle"), t("policies.savedMessage"));
    } catch (err) {
      Alert.alert(
        t("policies.saveError"),
        (err as { message?: string })?.message ?? t("tryAgain"),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View className="gap-3">
        <SectionHeader title={t("policies.title")} />
        <Text className="text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>{t("loading")}</Text>
      </View>
    );
  }

  const cancellationKey =
    CANCELLATION_OPTIONS.find((o) => o.value === cancellation)?.key ?? "none";
  const cancellationLabel = t(`policies.options.${cancellationKey}`);

  return (
    <View className="gap-4">
      <SectionHeader
        title={t("policies.title")}
        subtitle={t("policies.subtitle")}
      />
      <View>
        <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
          {t("policies.deposit")}
        </Text>
        <TextInput style={{ fontFamily: "LibreBaskerville", borderColor: C.border, backgroundColor: C.page, color: C.text }}
          value={depositPct}
          onChangeText={setDepositPct}
          placeholder="25"
          placeholderTextColor={PLACEHOLDER}
          keyboardType="number-pad"
          className="mt-2 rounded-xl border px-4 py-3 text-base"
        />
      </View>
      <View>
        <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
          {t("policies.cancellation")}
        </Text>
        <Pressable
          onPress={() => setPickerOpen(true)}
          className="mt-2 rounded-xl border px-4 py-3 active:opacity-80 flex-row items-center justify-between" style={{ borderColor: C.border, backgroundColor: C.page }}
        >
          <Text className="text-base" style={{ fontFamily: "LibreBaskerville", color: C.text }}>
            {cancellationLabel}
          </Text>
          <Feather name="chevron-down" size={18} color={C.placeholder} />
        </Pressable>
      </View>
      <View>
        <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
          {t("policies.reschedule")}
        </Text>
        <TextInput style={{ fontFamily: "LibreBaskerville", borderColor: C.border, backgroundColor: C.page, color: C.text }}
          value={reschedule}
          onChangeText={setReschedule}
          placeholder="14"
          placeholderTextColor={PLACEHOLDER}
          keyboardType="number-pad"
          className="mt-2 rounded-xl border px-4 py-3 text-base"
        />
      </View>
      <View>
        <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>{t("policies.notes")}</Text>
        <TextInput style={{ fontFamily: "LibreBaskerville", borderColor: C.border, backgroundColor: C.page, color: C.text }}
          value={notes}
          onChangeText={setNotes}
          placeholder={t("policies.notesPlaceholder")}
          placeholderTextColor={PLACEHOLDER}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          className="mt-2 min-h-[80px] rounded-xl border px-4 py-3 text-base"
        />
      </View>
      <Pressable
        onPress={save}
        disabled={busy}
        className="rounded-full border h-11 items-center justify-center active:opacity-80" style={{ borderColor: C.border, backgroundColor: C.field }}
      >
        <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
          {busy ? t("saving") : t("policies.save")}
        </Text>
      </Pressable>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerOpen(false)}
      >
        <SafeAreaView className="flex-1" style={{ backgroundColor: C.page }} edges={["top", "bottom"]}>
          <View className="flex-row items-center justify-between px-5 py-3 border-b" style={{ borderColor: C.border }}>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={8}>
              <Text className="text-sm" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>{t("cancel")}</Text>
            </Pressable>
            <Text className="text-base" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
              {t("policies.cancellation")}
            </Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView contentContainerClassName="py-2">
            {CANCELLATION_OPTIONS.map((o) => (
              <Pressable
                key={o.value}
                onPress={() => {
                  setCancellation(o.value);
                  setPickerOpen(false);
                }}
                className={`px-5 py-4 ${ROW_PRESS}`}
              >
                <Text
                  className="text-base"
                  style={{
                    color: C.text,
                    fontFamily:
                      cancellation === o.value
                        ? "LibreBaskerville-Bold"
                        : "LibreBaskerville",
                  }}
                >
                  {t(`policies.options.${o.key}`)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

