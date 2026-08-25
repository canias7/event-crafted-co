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
  return (
    <View className="flex-row items-end justify-between">
      <View className="flex-1 pr-3">
        <Text className="text-lg text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>{title}</Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onAdd ? (
        <Pressable
          onPress={onAdd}
          hitSlop={6}
          className="rounded-full border border-border px-3 py-1.5 active:opacity-70"
        >
          <Text className="text-xs text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>+ Add</Text>
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
      Alert.alert("Name is required");
      return;
    }
    if (!Number.isFinite(cents) || cents < 0) {
      Alert.alert("Price must be a number");
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
        "Couldn't save package",
        (err as { message?: string })?.message ?? "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    Alert.alert("Delete package?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from("vendor_packages")
            .delete()
            .eq("id", id);
          if (error) Alert.alert("Couldn't delete", error.message);
          else load();
        },
      },
    ]);
  }

  return (
    <View className="gap-3">
      <SectionHeader
        title="Packages"
        subtitle="Pricing tiers and what's included"
        onAdd={() => setEditing({ ...EMPTY_PACK })}
      />
      {loading ? (
        <Text className="text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>Loading…</Text>
      ) : items.length === 0 ? (
        <Text className="text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
          No packages yet. Add a pricing tier to give hosts a clear option.
        </Text>
      ) : (
        items.map((p) => (
          <View
            key={p.id}
            className="rounded-lg border border-border bg-background p-3"
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                  {p.name}
                </Text>
                <Text className="text-sm text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
                  ${(p.price_cents / 100).toLocaleString()}
                  {p.is_active ? "" : " · inactive"}
                </Text>
                {p.description ? (
                  <Text className="mt-1 text-sm text-foreground/80" style={{ fontFamily: "LibreBaskerville" }}>
                    {p.description}
                  </Text>
                ) : null}
                {p.includes && p.includes.length > 0 ? (
                  <View className="mt-2 gap-1">
                    {p.includes.slice(0, 4).map((line, idx) => (
                      <Text
                        key={idx}
                        className="text-xs text-muted-foreground"
                        style={{ fontFamily: "LibreBaskerville" }}
                      >
                        • {line}
                      </Text>
                    ))}
                    {p.includes.length > 4 ? (
                      <Text className="text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
                        +{p.includes.length - 4} more
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
                  <Feather name="edit-2" size={18} color="#525252" />
                </Pressable>
                <Pressable
                  onPress={() => remove(p.id)}
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Feather name="trash-2" size={18} color="#dc2828" />
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
  return (
    <Modal
      visible={draft != null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {draft ? (
        <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
            <Pressable onPress={onClose} hitSlop={8}>
              <Text className="text-sm text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>Cancel</Text>
            </Pressable>
            <Text className="text-base text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
              {draft.id ? "Edit package" : "New package"}
            </Text>
            <Pressable onPress={onSave} hitSlop={8} disabled={busy}>
              <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                {busy ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-4 py-4 gap-4 pb-24"
          >
            <View>
              <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                Name
              </Text>
              <TextInput
                value={draft.name}
                onChangeText={(v) => onChange({ ...draft, name: v })}
                placeholder="Standard package"
                className="mt-2 rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
              />
            </View>
            <View>
              <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                Description
              </Text>
              <TextInput
                value={draft.description}
                onChangeText={(v) => onChange({ ...draft, description: v })}
                placeholder="One or two sentences."
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="mt-2 min-h-[80px] rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
              />
            </View>
            <View>
              <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                Price ($)
              </Text>
              <TextInput
                value={draft.price}
                onChangeText={(v) => onChange({ ...draft, price: v })}
                placeholder="0"
                keyboardType="decimal-pad"
                className="mt-2 rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
              />
            </View>
            <View>
              <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                What's included
              </Text>
              <Text className="mt-1 text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
                One item per line.
              </Text>
              <TextInput
                value={draft.includes}
                onChangeText={(v) => onChange({ ...draft, includes: v })}
                placeholder={"4 hours of coverage\nEdited photo gallery\nLocation scouting"}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                className="mt-2 min-h-[120px] rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
              />
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                Active
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
      Alert.alert("Question and answer are both required");
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
        "Couldn't save FAQ",
        (err as { message?: string })?.message ?? "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    Alert.alert("Delete FAQ?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from("vendor_faqs")
            .delete()
            .eq("id", id);
          if (error) Alert.alert("Couldn't delete", error.message);
          else load();
        },
      },
    ]);
  }

  return (
    <View className="gap-3">
      <SectionHeader
        title="FAQs"
        subtitle="Common questions hosts ask"
        onAdd={() => setEditing({ ...EMPTY_FAQ })}
      />
      {loading ? (
        <Text className="text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>Loading…</Text>
      ) : items.length === 0 ? (
        <Text className="text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
          No FAQs yet. Adding 3-5 saves you time on first-touch replies.
        </Text>
      ) : (
        items.map((f) => (
          <View
            key={f.id}
            className="rounded-lg border border-border bg-background p-3"
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                  {f.question}
                </Text>
                <Text className="mt-1 text-sm text-foreground/80" style={{ fontFamily: "LibreBaskerville" }}>
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
                  <Feather name="edit-2" size={18} color="#525252" />
                </Pressable>
                <Pressable
                  onPress={() => remove(f.id)}
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Feather name="trash-2" size={18} color="#dc2828" />
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
            className="flex-1 bg-background"
            edges={["top", "bottom"]}
          >
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
              <Pressable onPress={() => setEditing(null)} hitSlop={8}>
                <Text className="text-sm text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>Cancel</Text>
              </Pressable>
              <Text className="text-base text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                {editing.id ? "Edit FAQ" : "New FAQ"}
              </Text>
              <Pressable onPress={save} hitSlop={8} disabled={busy}>
                <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                  {busy ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="px-4 py-4 gap-4 pb-24"
            >
              <View>
                <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                  Question
                </Text>
                <TextInput
                  value={editing.question}
                  onChangeText={(v) =>
                    setEditing({ ...editing, question: v })
                  }
                  placeholder="Do you travel for events?"
                  className="mt-2 rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
                />
              </View>
              <View>
                <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                  Answer
                </Text>
                <TextInput
                  value={editing.answer}
                  onChangeText={(v) => setEditing({ ...editing, answer: v })}
                  placeholder="Yes, we cover anywhere within 100 miles…"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  className="mt-2 min-h-[120px] rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
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

const CANCELLATION_OPTIONS = [
  { value: "", label: "— pick a policy —" },
  { value: "flexible", label: "Flexible (full refund up to 7 days before)" },
  { value: "moderate", label: "Moderate (50% up to 30 days before)" },
  { value: "strict", label: "Strict (no refund)" },
] as const;

export function PoliciesSection({ vendorId }: { vendorId: string }) {
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
      Alert.alert("Saved", "Policies updated.");
    } catch (err) {
      Alert.alert(
        "Couldn't save policies",
        (err as { message?: string })?.message ?? "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View className="gap-3">
        <SectionHeader title="Policies" />
        <Text className="text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>Loading…</Text>
      </View>
    );
  }

  const cancellationLabel =
    CANCELLATION_OPTIONS.find((o) => o.value === cancellation)?.label ??
    "— pick a policy —";

  return (
    <View className="gap-4">
      <SectionHeader
        title="Policies"
        subtitle="Cancellation, deposits, payment terms"
      />
      <View>
        <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
          Deposit (%)
        </Text>
        <TextInput
          value={depositPct}
          onChangeText={setDepositPct}
          placeholder="25"
          keyboardType="number-pad"
          className="mt-2 rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
        />
      </View>
      <View>
        <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
          Cancellation policy
        </Text>
        <Pressable
          onPress={() => setPickerOpen(true)}
          className="mt-2 rounded-lg border border-border bg-background px-4 py-3 active:opacity-80 flex-row items-center justify-between"
        >
          <Text className="text-base text-foreground" style={{ fontFamily: "LibreBaskerville" }}>
            {cancellationLabel}
          </Text>
          <Feather name="chevron-down" size={18} color="#737373" />
        </Pressable>
      </View>
      <View>
        <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
          Reschedule window (days)
        </Text>
        <TextInput
          value={reschedule}
          onChangeText={setReschedule}
          placeholder="14"
          keyboardType="number-pad"
          className="mt-2 rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
        />
      </View>
      <View>
        <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Any additional terms hosts should know."
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          className="mt-2 min-h-[80px] rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
        />
      </View>
      <Pressable
        onPress={save}
        disabled={busy}
        className="rounded-full border border-border bg-background py-3 items-center active:opacity-80"
      >
        <Text className="text-sm text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
          {busy ? "Saving…" : "Save policies"}
        </Text>
      </Pressable>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={8}>
              <Text className="text-sm text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>Cancel</Text>
            </Pressable>
            <Text className="text-base text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
              Cancellation policy
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
                className="px-5 py-4 active:bg-muted"
              >
                <Text
                  className={`text-base ${
                    cancellation === o.value
                      ? "text-foreground"
                      : "text-foreground/80"
                  }`}
                  style={{
                    fontFamily:
                      cancellation === o.value
                        ? "LibreBaskerville-Bold"
                        : "LibreBaskerville",
                  }}
                >
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

