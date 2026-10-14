// Small KPI tile used on the vendor dashboard. Mirrors the web's
// dashboard stat squares — label on top, big number below — but
// sized for thumb-tappable mobile, not dense desktop.
import { Text, View } from "react-native";
import { C } from "@/lib/theme";

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 20,
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
        padding: 16,
      }}
    >
      <Text className="text-[11px] uppercase tracking-wider" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>
        {label}
      </Text>
      <Text className="mt-2 text-2xl" style={{ fontFamily: "LibreBaskerville-Bold", color: C.text }}>{value}</Text>
      {hint ? (
        <Text className="mt-1 text-xs" style={{ fontFamily: "LibreBaskerville", color: C.textDim }}>{hint}</Text>
      ) : null}
    </View>
  );
}
