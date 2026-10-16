// Small pieces shared by the invitation screens (owner's call, Oct 2026):
// a month calendar sheet for picking a date, a labelled field, a text
// input, a switch row and a chip, all on the brand tokens.

import { useMemo, useState } from "react";
import { Modal, Pressable, Switch, Text, TextInput, View, type TextInputProps } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C } from "@/lib/theme";
import { useT } from "@/lib/i18n";

export const SERIF = "LibreBaskerville";
export const SERIF_BOLD = "LibreBaskerville-Bold";

export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseYmd(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

export function Label({ text, hint }: { text: string; hint?: string }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: C.text }}>{text}</Text>
      {hint ? (
        <Text style={{ fontFamily: SERIF, fontSize: 12, lineHeight: 17, color: C.textDim, marginTop: 2 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={C.placeholder}
      {...props}
      style={[
        {
          fontFamily: SERIF,
          fontSize: 15,
          color: C.text,
          backgroundColor: C.field,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          minHeight: 44,
        },
        props.multiline ? { minHeight: 88, textAlignVertical: "top" } : null,
        props.style,
      ]}
    />
  );
}

export function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: C.text }}>{label}</Text>
        {hint ? <Text style={{ fontFamily: SERIF, fontSize: 12, color: C.textDim, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: C.surface, true: C.gold }}
        thumbColor={C.card}
      />
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        height: 36,
        borderRadius: 999,
        justifyContent: "center",
        backgroundColor: on ? C.selected : C.card,
        borderWidth: 1,
        borderColor: on ? C.selected : C.border,
      }}
    >
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: on ? C.onSelected : C.text }}>{label}</Text>
    </Pressable>
  );
}

// A month calendar in a bottom sheet. Days before `min` can't be picked.
export function DateSheet({
  visible,
  value,
  min,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: string | null;
  min?: Date;
  onPick: (ymd: string) => void;
  onClose: () => void;
}) {
  const { locale } = useT("invites");
  const start = parseYmd(value) ?? new Date();
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1));
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const out: (Date | null)[] = Array(offset).fill(null);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) out.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);
  const weekdays = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) =>
      new Date(monday.getFullYear(), 0, 1 + i).toLocaleDateString(locale, { weekday: "narrow" }),
    );
  }, [locale]);
  const minKey = min ? ymd(min) : null;
  const title = month.toLocaleDateString(locale, { month: "long", year: "numeric" });
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} hitSlop={10}>
              <Feather name="chevron-left" size={22} color={C.text} />
            </Pressable>
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 17, color: C.text }}>
              {title.charAt(0).toUpperCase() + title.slice(1)}
            </Text>
            <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} hitSlop={10}>
              <Feather name="chevron-right" size={22} color={C.text} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row" }}>
            {weekdays.map((w, i) => (
              <Text key={i} style={{ flex: 1, textAlign: "center", fontFamily: SERIF_BOLD, fontSize: 11, color: C.textDim }}>
                {w.toUpperCase()}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 42 }} />;
              const key = ymd(d);
              const disabled = !!minKey && key < minKey;
              const on = key === value;
              return (
                <Pressable
                  key={i}
                  disabled={disabled}
                  onPress={() => onPick(key)}
                  style={{ width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center" }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: on ? C.selected : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: on ? SERIF_BOLD : SERIF,
                        fontSize: 14,
                        color: on ? C.onSelected : disabled ? C.border : C.text,
                      }}
                    >
                      {d.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
