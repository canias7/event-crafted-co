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
    // Mobile renders tag fields as a free-text chip input rather than a
    // preset toggle grid. The schema's `options` array becomes the
    // example placeholder so vendors see suggested values but can type
    // anything specific to their business. Web still uses the chip
    // toggle picker — see apps/web/src/components/vendor/CategoryAttributesEditor.
    return (
      <FreeTagsField
        label={field.label}
        help={field.help}
        examples={field.options}
        value={arr}
        onAdd={(t) =>
          arr.includes(t) ? undefined : onChange([...arr, t])
        }
        onRemove={(t) => onChange(arr.filter((x) => x !== t))}
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

function FreeTagsField({
  label,
  help,
  examples,
  value,
  onAdd,
  onRemove,
}: {
  label: string;
  help?: string;
  examples: string[];
  value: string[];
  onAdd: (t: string) => void;
  onRemove: (t: string) => void;
}) {
  const [input, setInput] = useState("");
  // Placeholder rotates through the first few schema-defined options
  // so the vendor sees a concrete example of what kind of thing to type.
  // Truncate to fit on one line — long examples would push the cursor
  // off-screen on narrow phones.
  const placeholder =
    examples.length === 0
      ? "Type a tag and tap Add"
      : `e.g. ${examples.slice(0, 3).join(", ")}`;

  const commit = () => {
    const t = input.trim();
    if (!t) return;
    if (value.includes(t)) {
      setInput("");
      return;
    }
    onAdd(t);
    setInput("");
  };

  return (
    <View>
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      {help ? (
        <Text className="mt-1 text-xs text-muted-foreground">{help}</Text>
      ) : null}
      {value.length > 0 ? (
        <View className="mt-2 flex-row flex-wrap gap-2">
          {value.map((t) => (
            <Pressable
              key={t}
              onPress={() => onRemove(t)}
              className="flex-row items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 active:opacity-70"
            >
              <Text className="text-xs font-semibold text-background">{t}</Text>
              <Feather name="x" size={12} color="#fff" />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View className="mt-2 flex-row gap-2">
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={placeholder}
          returnKeyType="done"
          onSubmitEditing={commit}
          blurOnSubmit={false}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <Pressable
          onPress={commit}
          className="rounded-lg border border-border px-3 justify-center active:opacity-70"
        >
          <Text className="text-sm font-semibold text-foreground">Add</Text>
        </Pressable>
      </View>
    </View>
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
