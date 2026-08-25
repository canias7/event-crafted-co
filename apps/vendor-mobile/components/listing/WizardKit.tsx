// Shared building blocks for the category-specific listing wizards
// (venue-listing, food-listing, and the six groups still to come).
// One place for the step rail, chip selectors, fields, photo grid, and
// pill styles so every category form looks and behaves identically —
// per the user's reference designs.
//
// No function-form style props anywhere (device interop drops them).

import { useCallback, useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { CATEGORY_GROUPS } from "@vendora/core";
import { supabase } from "@/lib/supabase";
import { compressForUpload } from "@/lib/imageManipulation";

// Category groups with their own listing wizard. THE single source of
// truth for the handoff — the generic builder, the profile tab, and the
// setup checklist all resolve destinations through wizardRouteFor so a
// listing is always opened in the right form directly (a mid-flight
// redirect hop left a stuck "Loading…" tab in back history).
export const WIZARD_ROUTES: Record<string, string> = {
  venues: "venue-listing",
  "food-beverage": "food-listing",
  entertainment: "entertainment-listing",
  media: "media-listing",
  "design-decor": "design-listing",
  rentals: "rental-listing",
  experiences: "experience-listing",
  "corporate-services": "corporate-listing",
};

// Subcategory-level overrides, checked before the group route. Beauty
// and Grooming Services live under Design & Decor for BROWSING (no web
// taxonomy/SEO change), but they're people services — the decor form
// doesn't fit them, so they get their own (user decision).
const SUB_WIZARD_ROUTES: Record<string, string> = {
  Beauty: "beauty-listing",
  "Grooming Services": "beauty-listing",
};

/** Wizard route for a category (sub name), or null → generic builder. */
export function wizardRouteFor(
  category: string | null | undefined,
): string | null {
  if (!category) return null;
  if (SUB_WIZARD_ROUTES[category]) return SUB_WIZARD_ROUTES[category];
  const group = CATEGORY_GROUPS.find((g) => g.subs.includes(category));
  return group ? (WIZARD_ROUTES[group.slug] ?? null) : null;
}

/** The editor route (wizard or generic) for a listing's category. */
export function editorRouteFor(category: string | null | undefined): string {
  return wizardRouteFor(category) ?? "listing";
}

export const CREAM = "#fdfcfa";
export const INK = "#14161a";
export // Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = "#14161a";
export const BORDER = "#e5e2dc";
export const GOLD = "#c9a86a";
export const GOLD_SOFT = "rgba(201,168,106,0.16)";
export const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 100;

export const darkPill = {
  backgroundColor: INK,
  borderRadius: 999,
  height: 54,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
export const darkPillText = {
  fontFamily: SERIF_BOLD,
  color: "#ffffff",
  fontSize: 16,
};
export const lightPill = {
  borderWidth: 1,
  borderColor: BORDER,
  backgroundColor: "#ffffff",
  borderRadius: 999,
  height: 54,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
export const lightPillText = {
  fontFamily: SERIF_BOLD,
  color: INK,
  fontSize: 16,
};

// Busy/disabled used to be the live pill at 50% opacity. That fades fill
// and label together toward the page, so a solid ink pill turns into a
// washed grey slab that reads as broken. Same rule as the auth buttons:
// give the state its own solid colours and keep full opacity.
export const darkPillDisabled = { ...darkPill, backgroundColor: "#7b7973" };
export const lightPillDisabled = {
  ...lightPill,
  backgroundColor: "#f3f1ec",
  borderColor: "#ece9e1",
};
export function darkPillFor(disabled: boolean) {
  return disabled ? darkPillDisabled : darkPill;
}
export function lightPillFor(disabled: boolean) {
  return disabled ? lightPillDisabled : lightPill;
}

export function StepRail({
  steps,
  step,
  onJump,
}: {
  steps: readonly string[];
  step: number;
  onJump: (i: number) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 18,
        paddingTop: 4,
        paddingBottom: 8,
      }}
    >
      {steps.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <View
            key={label}
            style={{ flex: 1, alignItems: "center", flexDirection: "row" }}
          >
            {i > 0 ? (
              <View
                style={{
                  flex: 1,
                  height: 1.5,
                  backgroundColor: done || current ? INK : BORDER,
                  marginTop: 14,
                }}
              />
            ) : null}
            <Pressable onPress={() => onJump(i)} style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: done ? INK : current ? GOLD : "transparent",
                  borderWidth: done || current ? 0 : 1.5,
                  borderColor: BORDER,
                }}
              >
                {done ? (
                  <Feather name="check" size={14} color="#fff" />
                ) : (
                  <Text
                    style={{
                      fontFamily: SERIF_BOLD,
                      fontSize: 13,
                      color: current ? "#fff" : INK_DIM,
                    }}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                style={{
                  fontFamily: current ? SERIF_BOLD : SERIF,
                  marginTop: 4,
                  fontSize: 10,
                  color: current ? INK : INK_DIM,
                }}
              >
                {label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export function StepTitle({
  title,
  sub,
  topGap,
}: {
  title: string;
  sub: string;
  topGap?: boolean;
}) {
  return (
    <View style={{ marginTop: topGap ? 30 : 6, marginBottom: 6 }}>
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: 24,
          color: INK,
          letterSpacing: -0.3,
        }}
      >
        {title}
      </Text>
      <Text style={{ fontFamily: SERIF, marginTop: 3, fontSize: 13, lineHeight: 19, color: INK_DIM }}>{sub}</Text>
    </View>
  );
}

export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>
        {label}
        {required ? <Text style={{ fontFamily: SERIF, color: "#b23a34" }}> *</Text> : null}
      </Text>
      <View style={{ marginTop: 8 }}>{children}</View>
    </View>
  );
}

export function Input(props: ComponentProps<typeof TextInput>) {
  const { multiline } = props;
  return (
    <TextInput
      placeholderTextColor={INK_DIM}
      {...props}
      style={{ fontFamily: SERIF,
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: INK,
        minHeight: multiline ? 96 : undefined,
        textAlignVertical: multiline ? "top" : "auto",
      }}
    />
  );
}

// Multi-select chip grid with an optional inline "+ Add other".
export function ChipMulti({
  options,
  selected,
  onChange,
  allowCustom,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const custom = selected.filter((s) => !options.includes(s));
  const all = [...options, ...custom];

  function commitCustom() {
    const v = draft.trim();
    setDraft("");
    setAdding(false);
    if (!v) return;
    if (!selected.includes(v)) onChange([...selected, v]);
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {all.map((opt) => {
        const on = selected.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            onPress={() =>
              onChange(on ? selected.filter((s) => s !== opt) : [...selected, opt])
            }
            activeOpacity={0.7}
            style={{
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 9,
              backgroundColor: on ? GOLD : "#ffffff",
              borderWidth: 1,
              borderColor: on ? GOLD : BORDER,
            }}
          >
            <Text
              style={{
                fontFamily: SERIF_BOLD,
                fontSize: 13,
                color: on ? "#ffffff" : INK,
              }}
            >
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
      {allowCustom ? (
        adding ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commitCustom}
            onBlur={commitCustom}
            autoFocus
            placeholder="Type and press return"
            placeholderTextColor={INK_DIM}
            style={{ fontFamily: SERIF,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 9,
              backgroundColor: GOLD_SOFT,
              borderWidth: 1,
              borderColor: GOLD,
              fontSize: 13,
              color: INK,
              minWidth: 160,
            }}
          />
        ) : (
          <TouchableOpacity
            onPress={() => setAdding(true)}
            activeOpacity={0.7}
            style={{
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 9,
              backgroundColor: "#ffffff",
              borderWidth: 1,
              borderColor: BORDER,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Feather name="plus" size={12} color={INK_DIM} />
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK_DIM }}>
              Add other
            </Text>
          </TouchableOpacity>
        )
      ) : null}
    </View>
  );
}

export function ChipSingle({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const on = selected === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(on ? "" : opt)}
            activeOpacity={0.7}
            style={{
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 9,
              backgroundColor: on ? GOLD : "#ffffff",
              borderWidth: 1,
              borderColor: on ? GOLD : BORDER,
            }}
          >
            <Text
              style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: on ? "#fff" : INK }}
            >
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Free-text tag list (preferred partners, etc.).
export function TagList({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim();
    setDraft("");
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
  }
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: items.length ? 8 : 0,
        }}
      >
        {items.map((it) => (
          <TouchableOpacity
            key={it}
            onPress={() => onChange(items.filter((x) => x !== it))}
            activeOpacity={0.7}
            style={{
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: GOLD_SOFT,
              borderWidth: 1,
              borderColor: GOLD,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>{it}</Text>
            <Feather name="x" size={12} color={INK_DIM} />
          </TouchableOpacity>
        ))}
      </View>
      <Input
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={commit}
        onBlur={commit}
        placeholder={placeholder}
      />
    </View>
  );
}

// Branded replacement for the stock Alert.alert dialog — cream card,
// serif title, gold accents, dark pill button, per the user's "make it
// look more Vendora" ask. Supports a confirm mode (onConfirm) with a
// red destructive pill + Cancel for delete-style actions.
export type BrandDialogSpec = {
  /** Feather icon in the gold badge. Defaults to "check". */
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  message?: string;
  /** Button label. Defaults to "OK" ("Confirm" in confirm mode). */
  buttonLabel?: string;
  /** Runs after dismiss — e.g. router.back() on submit success. */
  onClose?: () => void;
  /**
   * Confirm mode: when set, the dialog shows a primary action button
   * (red when destructive) that runs this, plus a Cancel button that
   * just closes. onClose is NOT called on cancel.
   */
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

function BrandDialogView({
  spec,
  onDismiss,
  onConfirm,
}: {
  spec: BrandDialogSpec | null;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const isConfirm = !!spec?.onConfirm;
  return (
    <Modal
      visible={!!spec}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        onPress={onDismiss}
        style={{
          flex: 1,
          backgroundColor: "rgba(13,15,19,0.55)",
          alignItems: "center",
          justifyContent: "center",
          padding: 28,
        }}
      >
        {/* Card swallows taps so only the backdrop / button dismiss. */}
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 340,
            backgroundColor: CREAM,
            borderRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 28,
            paddingBottom: 22,
            alignItems: "center",
            borderWidth: 1,
            borderColor: BORDER,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              backgroundColor: GOLD_SOFT,
              borderWidth: 1,
              borderColor: GOLD,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <Feather name={spec?.icon ?? "check"} size={24} color={INK} />
          </View>
          <Text
            style={{
              fontFamily: SERIF_BOLD,
              fontSize: 24,
              color: INK,
              textAlign: "center",
            }}
          >
            {spec?.title}
          </Text>
          {spec?.message ? (
            <Text
              style={{
                fontFamily: SERIF,
                marginTop: 8,
                fontSize: 14,
                lineHeight: 21,
                color: INK_DIM,
                textAlign: "center",
              }}
            >
              {spec.message}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={isConfirm ? onConfirm : onDismiss}
            activeOpacity={0.85}
            style={{
              marginTop: 20,
              alignSelf: "stretch",
              backgroundColor: isConfirm && spec?.destructive ? "#b23a34" : INK,
              borderRadius: 999,
              height: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, color: "#ffffff", fontSize: 15}}>
              {isConfirm
                ? (spec?.confirmLabel ?? "Confirm")
                : (spec?.buttonLabel ?? "OK")}
            </Text>
          </TouchableOpacity>
          {isConfirm ? (
            <TouchableOpacity
              onPress={onDismiss}
              activeOpacity={0.7}
              style={{
                marginTop: 10,
                alignSelf: "stretch",
                backgroundColor: "#ffffff",
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 999,
                height: 48,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 15}}>
                {spec?.cancelLabel ?? "Cancel"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Vendora-styled dialog. Usage:
 *   const dialog = useBrandDialog();
 *   dialog.show({ title: "Saved" });
 *   … and render {dialog.element} near the end of the screen's JSX.
 */
export function useBrandDialog() {
  const [spec, setSpec] = useState<BrandDialogSpec | null>(null);
  const show = useCallback((s: BrandDialogSpec) => setSpec(s), []);
  function dismiss() {
    // Cancel path in confirm mode: just close, no callbacks.
    const cb = spec?.onConfirm ? undefined : spec?.onClose;
    setSpec(null);
    cb?.();
  }
  function confirm() {
    const cb = spec?.onConfirm;
    setSpec(null);
    cb?.();
  }
  return {
    show,
    element: (
      <BrandDialogView spec={spec} onDismiss={dismiss} onConfirm={confirm} />
    ),
  };
}

// "Make it yours" — vendor-defined question + answer pairs, per the
// spec sheets' Add Your Own panel (any custom field, activity, or
// policy). Stored in category_details as [{label, value}].
export type CustomField = { label: string; value: string };

export function CustomFieldsEditor({
  fields,
  onChange,
}: {
  fields: CustomField[];
  onChange: (next: CustomField[]) => void;
}) {
  function setAt(i: number, patch: Partial<CustomField>) {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  return (
    <View style={{ gap: 12 }}>
      {fields.map((f, i) => (
        <View
          // Index keys are fine here — rows only append/remove and hold
          // no internal state beyond the controlled inputs.
          key={i}
          style={{
            backgroundColor: "#ffffff",
            borderWidth: 1,
            borderColor: BORDER,
            borderRadius: 14,
            padding: 12,
            gap: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Input
                value={f.label}
                onChangeText={(v) => setAt(i, { label: v.slice(0, 80) })}
                placeholder="Field name — e.g., Languages spoken"
              />
            </View>
            <TouchableOpacity
              onPress={() => onChange(fields.filter((_, idx) => idx !== i))}
              hitSlop={8}
              activeOpacity={0.7}
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: BORDER,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="trash-2" size={15} color={INK_DIM} />
            </TouchableOpacity>
          </View>
          <Input
            value={f.value}
            onChangeText={(v) => setAt(i, { value: v.slice(0, 500) })}
            placeholder="Your answer…"
            multiline
          />
        </View>
      ))}
      <TouchableOpacity
        onPress={() => onChange([...fields, { label: "", value: "" }])}
        activeOpacity={0.7}
        style={{
          borderWidth: 1.5,
          borderColor: GOLD,
          borderStyle: "dashed",
          borderRadius: 14,
          paddingVertical: 14,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
          backgroundColor: GOLD_SOFT,
        }}
      >
        <Feather name="plus" size={16} color={INK} />
        <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>
          Add your own field
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** Drop empty custom-field rows before saving. */
export function cleanCustomFields(fields: CustomField[]): CustomField[] {
  return fields
    .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
    .filter((f) => f.label || f.value);
}

// Tappable category row for a wizard's Basics step — shows the current
// marketplace category (subcategory) and opens the grouped picker.
export function CategoryField({
  value,
  onPress,
}: {
  value: string | null;
  onPress: () => void;
}) {
  return (
    <Field label="Category" required>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={{
          backgroundColor: "#ffffff",
          borderWidth: 1,
          borderColor: BORDER,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontFamily: SERIF, fontSize: 15, color: value ? INK : INK_DIM }}>
          {value || "Choose a category"}
        </Text>
        <Feather name="chevron-down" size={18} color={INK_DIM} />
      </TouchableOpacity>
    </Field>
  );
}

// Grouped category picker — the same picker the generic builder has, so
// vendors can change category from inside any wizard. Selecting a
// category in a different group is the caller's cue to hand the listing
// to that group's editor.
export function CategoryPickerModal({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string | null;
  onSelect: (sub: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={["top"]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderColor: BORDER,
          }}
        >
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ fontFamily: SERIF, fontSize: 16, color: INK_DIM }}>Cancel</Text>
          </Pressable>
          <Text
            style={{
              fontSize: 16,
              color: INK,
              fontFamily: SERIF_BOLD,
            }}
          >
            Category
          </Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {CATEGORY_GROUPS.map((group) => (
            <View key={group.slug} style={{ marginTop: 18 }}>
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  paddingHorizontal: 24,
                  paddingBottom: 8,
                  fontSize: 12,
                  letterSpacing: 1.4,
                  color: INK_DIM,
                }}
              >
                {group.name.toUpperCase()}
              </Text>
              <View
                style={{
                  marginHorizontal: 16,
                  backgroundColor: "#ffffff",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: BORDER,
                  overflow: "hidden",
                }}
              >
                {group.subs.map((sub, idx) => {
                  const active = selected === sub;
                  const isLast = idx === group.subs.length - 1;
                  return (
                    <Pressable key={sub} onPress={() => onSelect(sub)}>
                      <View
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 14,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderBottomWidth: isLast ? 0 : 1,
                          borderColor: BORDER,
                          minHeight: 50,
                        }}
                      >
                        <Text style={{ fontFamily: SERIF, fontSize: 16, color: INK }}>{sub}</Text>
                        {active ? (
                          <Feather name="check" size={18} color={GOLD} />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export function ReviewChecklist({ missing }: { missing: string[] }) {
  if (missing.length === 0) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: GOLD_SOFT,
          borderRadius: 14,
          padding: 14,
        }}
      >
        <MaterialCommunityIcons name="check-circle" size={20} color={GOLD} />
        <Text style={{ fontFamily: SERIF, flex: 1, fontSize: 14, color: INK }}>
          Everything required is filled in. Publish when you&rsquo;re ready.
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>
        Still needed to publish:
      </Text>
      {missing.map((m) => (
        <View
          key={m}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}
        >
          <Feather name="circle" size={12} color={INK_DIM} />
          <Text style={{ fontFamily: SERIF, fontSize: 14, color: INK_DIM }}>{m}</Text>
        </View>
      ))}
    </View>
  );
}

// Self-contained listing photo grid — same tables/bucket/mechanics as the
// generic builder (vendor_portfolio_images / vendor-portfolios). Manages
// its own load/add/delete; reports the current count so wizards can gate
// publish on MIN_PHOTOS.
export function ListingPhotosGrid({
  vendorId,
  onCount,
}: {
  vendorId: string;
  onCount?: (n: number) => void;
}) {
  type PhotoRow = {
    id: string;
    storage_path: string;
    display_order: number;
    url: string;
  };
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const dialog = useBrandDialog();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("vendor_portfolio_images")
      .select("id, storage_path, display_order")
      .eq("vendor_id", vendorId)
      .order("display_order", { ascending: true });
    const rows = ((data ?? []) as Omit<PhotoRow, "url">[]).map((i) => ({
      ...i,
      url: supabase.storage
        .from("vendor-portfolios")
        .getPublicUrl(i.storage_path).data.publicUrl,
    }));
    setPhotos(rows);
    onCount?.(rows.length);
  }, [vendorId, onCount]);

  useEffect(() => {
    load();
  }, [load]);

  async function addPhotos() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      dialog.show({
        icon: "image",
        title: "Library access needed",
        message:
          "Enable photo library access in Settings to upload listing photos.",
      });
      return;
    }
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      dialog.show({
        icon: "image",
        title: "Photo limit reached",
        message: `Listings cap at ${MAX_PHOTOS} photos.`,
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (result.canceled || result.assets.length === 0) return;
    const assets = result.assets.filter((a) => {
      const mime = (a.mimeType ?? "").toLowerCase();
      const uri = (a.uri ?? "").toLowerCase();
      return !(
        mime === "image/heic" ||
        mime === "image/heif" ||
        uri.endsWith(".heic") ||
        uri.endsWith(".heif")
      );
    });
    if (assets.length < result.assets.length) {
      dialog.show({
        icon: "alert-circle",
        title: "Some photos were skipped",
        message:
          "HEIC photos can't be shown on the web listing. In iOS Camera settings choose Formats → Most Compatible.",
      });
    }
    if (assets.length === 0) return;
    setUploading(true);
    const baseOrder =
      photos.length === 0
        ? 0
        : Math.max(...photos.map((p) => p.display_order)) + 1;
    const rows: Array<{
      vendor_id: string;
      storage_path: string;
      display_order: number;
    }> = [];
    for (let i = 0; i < assets.length; i++) {
      try {
        const { uri: upUri, mime } = await compressForUpload(assets[i]);
        const path = `${vendorId}/${Date.now()}-${baseOrder + i}-${i}.jpg`;
        const bytes = await (await fetch(upUri)).arrayBuffer();
        if (bytes.byteLength === 0) continue;
        const up = await supabase.storage
          .from("vendor-portfolios")
          .upload(path, bytes, { contentType: mime, upsert: false });
        if (up.error) continue;
        rows.push({
          vendor_id: vendorId,
          storage_path: path,
          display_order: baseOrder + i,
        });
      } catch {
        // Skip the bad asset, keep the batch moving.
      }
    }
    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("vendor_portfolio_images").insert(rows);
    }
    setUploading(false);
    if (rows.length < assets.length) {
      dialog.show({
        icon: "alert-circle",
        title: "Some photos didn't upload",
        message: `${assets.length - rows.length} photo(s) failed. Try them again.`,
      });
    }
    await load();
  }

  function deletePhoto(p: PhotoRow) {
    dialog.show({
      icon: "trash-2",
      title: "Delete this photo?",
      message: "It's removed from this listing right away.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await supabase.storage.from("vendor-portfolios").remove([p.storage_path]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("vendor_portfolio_images")
          .delete()
          .eq("id", p.id);
        setPhotos((prev) => {
          const next = prev.filter((x) => x.id !== p.id);
          onCount?.(next.length);
          return next;
        });
      },
    });
  }

  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {photos.map((p, i) => (
          <Pressable
            key={p.id}
            onLongPress={() => deletePhoto(p)}
            style={{ width: "31%", aspectRatio: 1 }}
          >
            <Image
              source={{ uri: p.url }}
              style={{ width: "100%", height: "100%", borderRadius: 12 }}
              resizeMode="cover"
            />
            {i === 0 ? (
              <View
                style={{
                  position: "absolute",
                  bottom: 6,
                  left: 6,
                  backgroundColor: "rgba(0,0,0,0.65)",
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, color: "#ffffff", fontSize: 10}}>
                  COVER
                </Text>
              </View>
            ) : null}
          </Pressable>
        ))}
        <TouchableOpacity
          onPress={addPhotos}
          disabled={uploading}
          activeOpacity={0.7}
          style={{
            width: "31%",
            aspectRatio: 1,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: "rgba(20,22,26,0.25)",
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {uploading ? (
            <Text style={{ fontFamily: SERIF, fontSize: 11, color: INK_DIM }}>Uploading…</Text>
          ) : (
            <Feather name="plus" size={22} color={INK_DIM} />
          )}
        </TouchableOpacity>
      </View>
      <Text style={{ fontFamily: SERIF, marginTop: 8, fontSize: 12, color: INK_DIM }}>
        Long-press a photo to delete it. Your first photo is the cover.
      </Text>
      {dialog.element}
    </View>
  );
}
