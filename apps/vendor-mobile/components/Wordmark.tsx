// VENDORA ✦ wordmark — the brand lockup at the top of every main tab
// (per the user's reference mocks). One component so the letterspacing,
// star, and sizing stay identical everywhere.

import { Platform, Text, View } from "react-native";

const INK = "#14161a";
const GOLD = "#c9a86a";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

export function Wordmark() {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <Text
        style={{
          fontFamily: SERIF,
          fontSize: 22,
          fontWeight: "700",
          letterSpacing: 3,
          color: INK,
        }}
      >
        VENDORA
      </Text>
      <Text style={{ color: GOLD, fontSize: 12, marginLeft: 2, marginTop: -2 }}>
        ✦
      </Text>
    </View>
  );
}
