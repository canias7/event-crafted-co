// Small KPI tile used on the vendor dashboard. Mirrors the web's
// dashboard stat squares — label on top, big number below — but
// sized for thumb-tappable mobile, not dense desktop.
import { Text, View } from "react-native";

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
        borderRadius: 24,
        backgroundColor: "#ffffff",
        padding: 18,
        shadowColor: "#1a1410",
        shadowOpacity: 0.10,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
        elevation: 2,
      }}
    >
      <Text className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </Text>
      <Text className="mt-2 text-2xl font-semibold text-foreground">{value}</Text>
      {hint ? (
        <Text className="mt-1 text-xs text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
}
