// Shared toolbar pieces for the vendor app's list screens (Inbox, Gallery).
//
// These lived as private copies inside each screen, and the copies drifted:
// Inbox switched sections with a dark filled pill while Gallery used gold
// underline tabs; Inbox's search was cream with a border while Gallery's
// was borderless beige; Inbox's filter was a round button beside the logo
// while Gallery's was a labelled square beside the search. Same jobs,
// three different looks. One definition each now, so they can't diverge.
//
// The look follows the Gallery mock, except the search field, which takes
// the mock's cream-with-border treatment (Inbox already had it; Gallery's
// beige fill was a leftover from before the redesign).

import { Fragment } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";

const CARD = "#fbf9f4";
const BORDER = "#e6e1d5";
const INK = "#14161a";
const WHITE = "#ffffff";
const PLACEHOLDER = "#746a58";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";

type FeatherName = keyof typeof Feather.glyphMap;

// Toolbar controls share one height so a search field and the button
// beside it line up exactly.
const CONTROL_HEIGHT = 56;

export interface TabSpec {
  key: string;
  icon: FeatherName;
  label: string;
}

// Underlined section tabs. Ink rule under the active tab (selection is ink
// across the app; gold is for actions and ornament). Hairline dividers
// between tabs, hairline rule along the bottom.
export function UnderlineTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: TabSpec[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER }}>
      {/* Dividers and tabs are siblings in one row (no wrapper per tab):
          each tab's ink rule uses marginBottom: -1 to sit on top of the
          row's hairline, which only works if the tab's parent IS that row. */}
      {tabs.map((t, i) => {
        const active = t.key === value;
        return (
          <Fragment key={t.key}>
            {i > 0 ? (
              <View style={{ width: 1, backgroundColor: BORDER, marginVertical: 10 }} />
            ) : null}
            <Pressable
              onPress={() => onChange(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 7,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: active ? INK : "transparent",
                marginBottom: -1,
              }}
            >
              <Feather name={t.icon} size={16} color={INK} />
              <Text
                numberOfLines={1}
                style={{ fontFamily: active ? SERIF_BOLD : SERIF, fontSize: 13, color: INK }}
              >
                {t.label}
              </Text>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

// Search field. Fills the row it sits in, so it can stand alone or sit
// beside a ToolbarButton.
export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        // Exact half-height rather than 999 — the same Android lesson as
        // the tab-bar indicator: don't rely on how the platform clamps an
        // oversized radius.
        borderRadius: CONTROL_HEIGHT / 2,
        paddingHorizontal: 20,
        height: CONTROL_HEIGHT,
      }}
    >
      <Feather name="search" size={17} color={INK} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER}
        // Android otherwise lets a long placeholder wrap onto a second line
        // that the field's height then slices in half. One line, cut at the
        // edge, reads as "more text here" instead of as broken.
        numberOfLines={1}
        style={{ fontFamily: SERIF, flex: 1, marginLeft: 10, color: INK, fontSize: 15 }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={8}>
          <Feather name="x" size={16} color={INK} />
        </Pressable>
      ) : null}
    </View>
  );
}

// Square icon-and-label button that sits beside a SearchField. Fills ink
// when whatever it controls is in a non-default state.
export function ToolbarButton({
  icon,
  label,
  onPress,
  active,
  accessibilityLabel,
}: {
  icon: FeatherName;
  label: string;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      style={{
        width: CONTROL_HEIGHT,
        height: CONTROL_HEIGHT,
        borderRadius: 12,
        backgroundColor: active ? INK : CARD,
        borderWidth: 1,
        borderColor: active ? INK : BORDER,
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
      }}
    >
      <Feather name={icon} size={17} color={active ? WHITE : INK} />
      <Text style={{ fontFamily: SERIF, fontSize: 11, color: active ? WHITE : INK }}>{label}</Text>
    </Pressable>
  );
}
