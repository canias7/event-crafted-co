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
import { useT } from "@/lib/i18n";
import { useCategoryNames } from "@/lib/categoryNames";

const PLACEHOLDER = "#746a58";

type AttrValue = string | number | boolean | string[] | null;
type Attrs = Record<string, AttrValue>;

// The schema's text in the app's language, keyed by the English text:
// section names, labels, suffixes and preset options from the shared
// listingAttributes namespace (the same words as the website), help text
// from listingDetails → help. The schema in @vendora/core stays English:
// option strings are the values saved to category_attributes. A
// vendor's custom tag shows as typed.
type SchemaText = Record<"section" | "label" | "suffix" | "help", (text: string) => string> & {
  option: (text: string, field: string) => string;
};

function useSchemaText(): SchemaText {
  const { tObject } = useT("listingAttributes");
  const { tObject: tOwn } = useT("listingDetails");
  const lookup = (names: Record<string, string> | undefined) => (text: string) =>
    names && Object.prototype.hasOwnProperty.call(names, text) ? names[text] : text;
  const map = (group: string) =>
    lookup(tObject<Record<string, string> | undefined>(group));
  const option = map("options");
  const fieldOptions =
    tObject<Record<string, Record<string, string>> | undefined>("fieldOptions") ?? {};
  return {
    section: map("sections"),
    label: map("labels"),
    suffix: map("suffixes"),
    help: lookup(tOwn<Record<string, string> | undefined>("help")),
    option: (text, field) => fieldOptions[field]?.[text] ?? option(text),
  };
}

export function DetailsSection({
  vendorId,
  category,
}: {
  vendorId: string;
  /** Sub-category currently saved on the vendor (vendor_profiles.category). */
  category: string | null;
}) {
  const { t } = useT("listingDetails");
  const tx = useSchemaText();
  const { sub } = useCategoryNames();
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
      Alert.alert(t("savedTitle"), t("savedMessage"));
    } catch (err) {
      Alert.alert(
        t("saveError"),
        (err as { message?: string })?.message ?? t("tryAgain"),
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
        <Text className="text-lg" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>{t("title")}</Text>
        <Text className="text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
          {t("pickCategory")}
        </Text>
      </View>
    );
  }

  if (!schema) {
    return (
      <View className="gap-3">
        <Text className="text-lg" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>{t("title")}</Text>
        <Text className="text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
          {t("noSchema", { category: sub(category) })}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="gap-3">
        <Text className="text-lg" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>{t("title")}</Text>
        <Text className="text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>{t("loading")}</Text>
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
        <Text className="text-lg" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>{t("title")}</Text>
        <Text className="mt-0.5 text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
          {t("intro", { category: sub(category) })}
        </Text>
      </View>
      {applicableSections.map((section) => (
        <View key={section.name} className="gap-4">
          <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
            {tx.section(section.name)}
          </Text>
          {section.fields.map((field) => (
            <FieldEditor
              key={field.key}
              tx={tx}
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
        className="rounded-full border h-11 items-center justify-center active:opacity-80" style={{ borderColor: C.border, backgroundColor: C.field }}
      >
        <Text className="text-sm" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
          {busy ? t("saving") : t("save")}
        </Text>
      </Pressable>
    </View>
  );
}

function FieldEditor({
  tx,
  field,
  value,
  onChange,
}: {
  tx: SchemaText;
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
        <Text className="text-sm" style={{ fontFamily: "LibreBaskerville", color: C.text }}>
          {tx.label(field.label)}
        </Text>
        {field.help ? (
          <Text className="mt-1 text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
            {tx.help(field.help)}
          </Text>
        ) : null}
        <View className="mt-2 flex-row items-center gap-2">
          {field.type === "currency" ? (
            <Text className="text-base" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>$</Text>
          ) : null}
          <TextInput style={{ fontFamily: "LibreBaskerville", borderColor: C.border, backgroundColor: C.page, color: C.text }}
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
            placeholderTextColor={PLACEHOLDER}
            keyboardType={field.type === "int" ? "number-pad" : "decimal-pad"}
            className="flex-1 rounded-xl border px-4 py-3 text-base"
          />
          {"suffix" in field && field.suffix ? (
            <Text className="text-sm" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
              {tx.suffix(field.suffix)}
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
          <Text className="text-sm" style={{ fontFamily: "LibreBaskerville", color: C.text }}>
            {tx.label(field.label)}
          </Text>
          {field.help ? (
            <Text className="mt-0.5 text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
              {tx.help(field.help)}
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
        label={tx.label(field.label)}
        help={field.help ? tx.help(field.help) : undefined}
        options={field.options}
        optionLabel={(o) => tx.option(o, field.key)}
        value={arr}
        onToggle={toggle}
      />
    );
  }
  if (field.type === "select") {
    return (
      <SelectField
        tx={tx}
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
  optionLabel,
}: {
  label: string;
  help?: string;
  options: string[];
  value: string[];
  onToggle: (t: string) => void;
  optionLabel: (o: string) => string;
}) {
  const { t: tr } = useT("listingDetails");
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
      <Text className="text-sm" style={{ fontFamily: "LibreBaskerville", color: C.text }}>{label}</Text>
      {help ? (
        <Text className="mt-1 text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>{help}</Text>
      ) : null}
      <View className="mt-2 flex-row flex-wrap gap-2">
        {options.map((opt) => (
          <Chip
            key={opt}
            text={optionLabel(opt)}
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
              borderColor: "#e6e1d5",
              paddingLeft: 12,
              paddingRight: 4,
              backgroundColor: "#fff",
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={tr("typeAndAdd")}
              placeholderTextColor={PLACEHOLDER}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={commit}
              blurOnSubmit={false}
              onBlur={() => {
                if (!draft.trim()) setAdding(false);
              }}
              style={{ fontFamily: "LibreBaskerville",
                fontSize: 13,
                minWidth: 96,
                paddingVertical: 6,
                color: "#14161a",
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
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "#e6e1d5",
            }}
          >
            <Feather name="plus" size={13} color="rgba(26,22,18,0.55)" />
            <Text style={{ fontFamily: "LibreBaskerville", fontSize: 13, color: "rgba(26,22,18,0.55)" }}>
              {tr("addOther")}
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
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: active ? "#14161a" : "#ffffff",
        borderColor: active ? "#14161a" : "#e6e1d5",
      }}
    >
      {active ? <Feather name="check" size={13} color="#ffffff" /> : null}
      <Text
        style={{
          fontFamily: "LibreBaskerville",
          fontSize: 13,
          color: active ? "#ffffff" : "rgba(26,22,18,0.65)",
        }}
      >
        {text}
      </Text>
    </Pressable>
  );
}

function SelectField({
  tx,
  field,
  value,
  onChange,
}: {
  tx: SchemaText;
  field: Extract<AttributeField, { type: "select" }>;
  value: string;
  onChange: (v: AttrValue) => void;
}) {
  const { t } = useT("listingDetails");
  const [open, setOpen] = useState(false);
  const label = tx.label(field.label);
  return (
    <View>
      <Text className="text-sm" style={{ fontFamily: "LibreBaskerville", color: C.text }}>{label}</Text>
      {field.help ? (
        <Text className="mt-1 text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>{tx.help(field.help)}</Text>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        className="mt-2 rounded-xl border px-4 py-3 active:opacity-80 flex-row items-center justify-between" style={{ borderColor: C.border, backgroundColor: C.page }}
      >
        <Text className="text-base" style={{ fontFamily: "LibreBaskerville", color: C.text }}>
          {value ? tx.option(value, field.key) : t("pickOne")}
        </Text>
        <Feather name="chevron-down" size={18} color="#746a58" />
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView className="flex-1" style={{ backgroundColor: C.page }} edges={["top", "bottom"]}>
          <View className="flex-row items-center justify-between px-5 py-3 border-b" style={{ borderColor: C.border }}>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text className="text-sm" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>{t("cancel")}</Text>
            </Pressable>
            <Text className="text-base" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>
              {label}
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
                    value === opt ? "text-foreground" : "text-foreground"
                  }`}
                  style={{
                    fontFamily:
                      value === opt
                        ? "LibreBaskerville-Bold"
                        : "LibreBaskerville",
                  }}
                >
                  {tx.option(opt, field.key)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
