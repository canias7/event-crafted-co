// Bottom sheet listing a listing's saved replies (vendor_message_templates)
// for the chat composer's "Templates" chip. Picking one hands its text
// back to put in the message box; nothing is sent from here.

import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/i18n";
import { C } from "@/lib/theme";

const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";

interface TemplateRow {
  id: string;
  name: string;
  body: string;
}

export function TemplateSheet({
  visible,
  vendorId,
  onPick,
  onClose,
}: {
  visible: boolean;
  vendorId: string | null;
  onPick: (body: string) => void;
  onClose: () => void;
}) {
  const { t } = useT("templates");
  const router = useRouter();
  const [rows, setRows] = useState<TemplateRow[] | null>(null);

  useEffect(() => {
    if (!visible || !vendorId) return;
    let alive = true;
    setRows(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any)
      .from("vendor_message_templates")
      .select("id, name, body")
      .eq("vendor_id", vendorId)
      .order("updated_at", { ascending: false })
      .then(({ data }: { data: TemplateRow[] | null }) => {
        if (alive) setRows(data ?? []);
      });
    return () => {
      alive = false;
    };
  }, [visible, vendorId]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: C.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 12,
            paddingBottom: 32,
            paddingHorizontal: 20,
            maxHeight: "70%",
          }}
        >
          <View
            style={{ width: 48, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center", marginBottom: 12 }}
          />
          <Text style={{ color: C.text, fontFamily: SERIF_BOLD, fontSize: 18, marginBottom: 12 }}>
            {t("picker.title")}
          </Text>
          {rows === null ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <ActivityIndicator color={C.text} />
            </View>
          ) : rows.length === 0 ? (
            <Text style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 20, color: C.text, paddingVertical: 8 }}>
              {t("picker.empty")}
            </Text>
          ) : (
            <ScrollView style={{ flexGrow: 0 }}>
              {rows.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => onPick(r.body)}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? C.surface : C.page,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    marginBottom: 8,
                  })}
                >
                  <Text numberOfLines={1} style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: C.text }}>
                    {r.name}
                  </Text>
                  <Text numberOfLines={2} style={{ fontFamily: SERIF, fontSize: 13, lineHeight: 18, color: C.textDim, marginTop: 3 }}>
                    {r.body}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Pressable
            onPress={() => {
              onClose();
              router.push("/(vendor)/templates" as never);
            }}
            hitSlop={8}
            style={{ marginTop: 12, alignSelf: "flex-start" }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: C.accentText }}>{t("picker.manage")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
