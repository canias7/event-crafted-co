// English / Español / Русский pills. Used in Settings and on the
// sign-in screens; the choice is saved on the device (lib/i18n.ts) and
// every screen that reads its text through useT() switches at once.
// Selected = ink fill with a white label (brand rule); on dark screens
// the selected pill is cream with an ink label.
import { Pressable, Text, View } from "react-native";
import { LANGUAGES, setLanguage, useT } from "@/lib/i18n";

const INK = "#14161a";
const CREAM = "#f4f1ea";
const SERIF_BOLD = "LibreBaskerville-Bold";

export function LanguagePicker({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { lang, t } = useT("common");
  const dark = tone === "dark";
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t("language.title")}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
    >
      {LANGUAGES.map((l) => {
        const on = l.code === lang;
        return (
          <Pressable
            key={l.code}
            onPress={() => setLanguage(l.code)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            hitSlop={6}
            style={{
              height: 36,
              paddingHorizontal: 16,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: on
                ? dark ? CREAM : INK
                : dark ? "rgba(255,255,255,0.15)" : "#e6e1d5",
              backgroundColor: on
                ? dark ? CREAM : INK
                : dark ? "transparent" : "#ffffff",
            }}
          >
            <Text
              style={{
                fontFamily: SERIF_BOLD,
                fontSize: 14,
                color: on ? (dark ? INK : "#ffffff") : dark ? CREAM : INK,
              }}
            >
              {l.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
