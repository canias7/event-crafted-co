// Vendora brand lockup at the top of every main tab — the REAL brand
// mark per the brand sheet: gold calligraphic V · hairline divider ·
// lowercase serif "vendora". One component so the mark, divider, and
// sizing stay identical everywhere.
//
// v-mark.png is the official glyph exported white-on-transparent so
// tintColor can paint it brand gold (or any surface-appropriate color).

import { Image, Platform, Text, View } from "react-native";

const INK = "#14161a";
const GOLD = "#c9a86a";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

export function Wordmark({ color = INK }: { color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Image
        source={require("../assets/v-mark.png")}
        style={{ width: 26, height: 26, tintColor: GOLD, resizeMode: "contain" }}
      />
      <View
        style={{
          width: 1,
          alignSelf: "stretch",
          marginVertical: 2,
          marginHorizontal: 8,
          backgroundColor: "rgba(201,168,106,0.55)",
        }}
      />
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: 23,
          fontWeight: "600",
          letterSpacing: 0.5,
          color,
        }}
      >
        vendora
      </Text>
    </View>
  );
}
