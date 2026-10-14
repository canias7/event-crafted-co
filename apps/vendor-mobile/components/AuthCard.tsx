// The card the sign-in, sign-up and password screens sit in (owner's
// "Option A", Oct 2026): one flat see-through card on the plain ink page,
// with a small champagne ornament (line, diamond, line) centred at its
// top. Same dark-surface card as the website: white at 3% fill, white at
// 15% hairline, no shadow. The "← Back" control stays above the card.
// Identical in vendor-mobile and host-mobile: change both together.

import type { ReactNode } from "react";
import { View } from "react-native";
import { COLORS, RADIUS } from "@/lib/ui";

const GOLD = COLORS.gold;

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        marginTop: 16,
        backgroundColor: "rgba(255,255,255,0.03)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.15)",
        borderRadius: RADIUS.sheet,
        padding: 20,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginBottom: 24,
        }}
      >
        <View style={{ width: 40, height: 1, backgroundColor: GOLD, opacity: 0.6 }} />
        <View
          style={{
            width: 6,
            height: 6,
            backgroundColor: GOLD,
            transform: [{ rotate: "45deg" }],
          }}
        />
        <View style={{ width: 40, height: 1, backgroundColor: GOLD, opacity: 0.6 }} />
      </View>
      {children}
    </View>
  );
}
