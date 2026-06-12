// Per-category structured details. Reads the schema for the vendor's
// category from @vendora/core's GROUP_SCHEMAS and renders the right
// editor for each field type (currency, int, boolean, tags, select).
// Values persist to vendor_profiles.category_attributes (jsonb), the
// same column the web editor writes to — schema and storage stay in
// lockstep across surfaces.

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  getCategorySchema,
  type AttributeField,
  type CategorySchema,
} from "@vendora/core";
import { supabase } from "@/lib/supabase";

type AttrValue = string | number | boolean | string[] | null;
type Attrs = Record<string, AttrValue>;

export function DetailsSection({
  vendorId,
  category,
}: {
  vendorId: string;
  /** Sub-category currently saved on the vendor (vendor_profiles.category). */
  category: string | null;
}) {
  const [attrs, setAttrs] = useState<Attrs>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const schema = useMemo<CategorySchema | null>(
    () => (category ? getCategorySchema(category) : null),
    [category],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("vendor_profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("category_attributes" as any)
      .eq("id", vendorId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (data as any) ?? {};
    setAttrs((row.category_attributes ?? {}) as Attrs);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_profiles")
        .update({ category_attributes: attrs })
        .eq("id", vendorId);
      if (error) throw error;
      Alert.alert("Saved", "Details updated.");
    } catch (err) {
      Alert.alert(
        "Couldn't save details",
        (err as { message?: string })?.message ?? "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function setField(key: string, value: AttrValue) {
    setAttrs((m) => ({ ...m, [key]: value }));
  }

  if (!category) {
    return (
      <View className="gap-3">
        <Text className="text-lg font-semibold text-foreground">Details</Text>
        <Text className="text-xs text-muted-foreground">
          Pick a category above to unlock the structured details for your
          listing.
        </Text>
      </View>
    );
  }

  if (!schema) {
    return (
      <View className="gap-3">
        <Text className="text-lg font-semibold text-foreground">Details</Text>
        <Text className="text-xs text-muted-foreground">
          No structured details for {category} yet.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="gap-3">
        <Text className="text-lg font-semibold text-foreground">Details</Text>
        <Text className="text-xs text-muted-foreground">Loading…</Text>
      </View>
    );
  }

  // Filter sections to those that apply to the current sub. A
  // section without `onlySubs` runs on every sub in the group.
  const applicableSections = schema.sections.filter(
    (s) => !s.onlySubs || s.onlySubs.includes(category),
  );

  return (
    <View className="gap-5">
      <View>
        <Text className="text-lg font-semibold text-foreground">Details</Text>
        <Text className="mt-0.5 text-xs text-muted-foreground">
          Structured fields hosts use to filter and compare. Specific to {category}.
        </Text>
      </View>
      {applicableSections.map((section) => (
        <View key={section.name} className="gap-4">
          <Text className="text-sm font-semibold text-foreground/80">
            {section.name}
          </Text>
          {section.fields.map((field) => (
            <FieldEditor
              key={field.key}
              field={field}
              value={attrs[field.key] ?? null}
              onChange={(v) => setField(field.key, v)}
            />
          ))}
        </View>
      ))}
      <Pressable
        onPress={save}
        disabled={busy}
        className="rounded-full border border-border bg-background py-3 items-center active:opacity-80"
      >
        <Text className="text-sm font-semibold text-foreground">
          {busy ? "Saving…" : "Save details"}
        </Text>
      </Pressable>
    </View>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: AttributeField;
  value: AttrValue;
  onChange: (v: AttrValue) => void;
}) {
  if (field.type === "currency" || field.type === "int") {
    const str =
      typeof value === "number"
        ? String(value)
        : typeof value === "string"
          ? value
          : "";
    return (
      <View>
        <Text className="text-sm font-medium text-foreground">
          {field.label}
        </Text>
        {field.help ? (
          <Text className="mt-1 text-xs text-muted-foreground">
            {field.help}
          </Text>
        ) : null}
        <View className="mt-2 flex-row items-center gap-2">
          {field.type === "currency" ? (
            <Text className="text-base text-muted-foreground">$</Text>
          ) : null}
          <TextInput
            value={str}
            onChangeText={(v) => {
              const cleaned = v.replace(/[^0-9.]/g, "");
              if (cleaned === "") {
                onChange(null);
                return;
              }
              const num =
                field.type === "int"
                  ? Number.parseInt(cleaned, 10)
                  : Number.parseFloat(cleaned);
              onChange(Number.isFinite(num) ? num : null);
            }}
            placeholder="0"
            keyboardType={field.type === "int" ? "number-pad" : "decimal-pad"}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
          />
          {"suffix" in field && field.suffix ? (
            <Text className="text-sm text-muted-foreground">
              {field.suffix}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }
  if (field.type === "boolean") {
    return (
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-medium text-foreground">
            {field.label}
          </Text>
          {field.help ? (
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {field.help}
            </Text>
          ) : null}
        </View>
        <Switch
          value={value === true}
          onValueChange={(v) => onChange(v)}
        />
      </View>
    );
  }
  if (field.type === "tags") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    // Match web (CategoryAttributesEditor): preset options render as
    // toggleable chips and an inline "Add other" lets the vendor append
    // anything specific to their business. Selected presets + customs
    // mix in the same string[] stored on category_attributes.
    const toggle = (t: string) =>
      onChange(arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]);
    return (
      <TagsField
        label={field.label}
        help={field.help}
        options={field.options}
        value={arr}
        onToggle={toggle}
      />
    );
  }
  if (field.type === "select") {
    return (
      <SelectField
        field={field}
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
      />
    );
  }
  return null;
}

// Preset chips (toggle) + an inline "Add other" affordance — mirrors
// web's tags editor. Selected presets and vendor-typed customs share
// the same value array; a custom is any selected value not in the
// schema's preset options.
function TagsField({
  label,
  help,
  options,
  value,
  onToggle,
}: {
  label: string;
  help?: string;
  options: string[];
  value: string[];
  onToggle: (t: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const customSelected = value.filter((v) => !options.includes(v));

  const commit = () => {
    const t = draft.trim();
    if (!t) {
      setAdding(false);
      return;
    }
    if (!value.includes(t)) onToggle(t);
    setDraft("");
    // Stay open — vendors usually add a couple of customs in a row.
  };

  return (
    <View>
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      {help ? (
        <Text className="mt-1 text-xs text-muted-foreground">{help}</Text>
      ) : null}
      <View className="mt-2 flex-row flex-wrap gap-2">
        {options.map((opt) => (
          <Chip
            key={opt}
            text={opt}
            active={value.includes(opt)}
            onPress={() => onToggle(opt)}
          />
        ))}
        {customSelected.map((opt) => (
          <Chip key={opt} text={opt} active onPress={() => onToggle(opt)} />
        ))}
        {adding ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(10,10,10,0.4)",
              paddingLeft: 12,
              paddingRight: 4,
              backgroundColor: "#fff",
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type and add"
              placeholderTextColor="rgba(26,22,18,0.4)"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={commit}
              blurOnSubmit={false}
              onBlur={() => {
                if (!draft.trim()) setAdding(false);
              }}
              style={{
                fontSize: 13,
                minWidth: 96,
                paddingVertical: 6,
                color: "#18181b",
              }}
            />
            <Pressable
              onPress={commit}
              disabled={!draft.trim()}
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                backgroundColor: "#14161a",
                alignItems: "center",
                justifyContent: "center",
                opacity: draft.trim() ? 1 : 0.3,
              }}
            >
              <Feather name="check" size={13} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setAdding(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "rgba(10,10,10,0.4)",
            }}
          >
            <Feather name="plus" size={13} color="rgba(26,22,18,0.55)" />
            <Text style={{ fontSize: 13, color: "rgba(26,22,18,0.55)" }}>
              Add other
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Chip({
  text,
  active,
  onPress,
}: {
  text: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: active ? "rgba(10,10,10,0.08)" : "#ffffff",
        borderColor: active ? "rgba(10,10,10,0.45)" : "rgba(10,10,10,0.12)",
      }}
    >
      {active ? <Feather name="check" size={13} color="#18181b" /> : null}
      <Text
        style={{
          fontSize: 13,
          color: active ? "#18181b" : "rgba(26,22,18,0.65)",
        }}
      >
        {text}
      </Text>
    </Pressable>
  );
}

function SelectField({
  field,
  value,
  onChange,
}: {
  field: Extract<AttributeField, { type: "select" }>;
  value: string;
  onChange: (v: AttrValue) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Text className="text-sm font-medium text-foreground">{field.label}</Text>
      {field.help ? (
        <Text className="mt-1 text-xs text-muted-foreground">{field.help}</Text>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        className="mt-2 rounded-lg border border-border bg-background px-4 py-3 active:opacity-80 flex-row items-center justify-between"
      >
        <Text className="text-base text-foreground">
          {value || "— pick one —"}
        </Text>
        <Feather name="chevron-down" size={18} color="#737373" />
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text className="text-sm text-muted-foreground">Cancel</Text>
            </Pressable>
            <Text className="text-base font-semibold text-foreground">
              {field.label}
            </Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView contentContainerClassName="py-2">
            {field.options.map((opt) => (
              <Pressable
                key={opt}
                onPress={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className="px-5 py-4 active:bg-muted"
              >
                <Text
                  className={`text-base ${
                    value === opt
                      ? "font-semibold text-foreground"
                      : "text-foreground/80"
                  }`}
                >
                  {opt}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
