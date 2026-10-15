// Templates: saved replies for the inbox (owner's call, Oct 2026; web
// twin /vendor/templates). Reached from More → Tools. Templates belong
// to a listing (vendor_message_templates.vendor_id); the chat's
// "Templates" chip (components/TemplateSheet) puts one in the message
// box. Open to every plan.

import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Field, Input, useBrandDialog } from "@/components/listing/WizardKit";
import { useT } from "@/lib/i18n";
import { C } from "@/lib/theme";

const PAGE = C.page;
const CARD = C.card;
const SURFACE = C.surface;
const BORDER = C.border;
const INK = C.text;
const INK_DIM = C.textDim;
const GOLD = C.gold;
const GOLD_MUTED = C.goldMuted;
const ON_GOLD = C.onGold;
const SELECTED = C.selected;
const ON_SELECTED = C.onSelected;
const ERROR = C.error;
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";

const STARTER_IDS = ["thanks", "proposal", "unavailable"] as const;

interface Listing {
  id: string;
  business_name: string | null;
}

interface Template {
  id: string;
  name: string;
  body: string;
}

export default function TemplatesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const dialog = useBrandDialog();
  const { t } = useT("templates");
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingId, setListingId] = useState<string | null>(null);
  const [rows, setRows] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [seeding, setSeeding] = useState(false);

  const loadTemplates = useCallback(async (vid: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_message_templates")
      .select("id, name, body")
      .eq("vendor_id", vid)
      .order("updated_at", { ascending: false });
    setRows((data ?? []) as Template[]);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_profiles")
      .select("id, business_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    const ls = (data ?? []) as Listing[];
    setListings(ls);
    const vid = listingId && ls.some((l) => l.id === listingId) ? listingId : ls[0]?.id ?? null;
    setListingId(vid);
    if (vid) await loadTemplates(vid);
    setLoading(false);
  }, [user, listingId, loadTemplates]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function seedStarters() {
    if (!listingId || seeding) return;
    setSeeding(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_message_templates").insert(
      STARTER_IDS.map((id) => ({
        vendor_id: listingId,
        name: t(`starters.${id}.name`),
        body: t(`starters.${id}.body`),
      })),
    );
    setSeeding(false);
    if (error) {
      dialog.show({ icon: "alert-circle", title: t("saveFailed"), message: error.message });
      return;
    }
    await loadTemplates(listingId);
  }

  function confirmDelete(row: Template) {
    dialog.show({
      icon: "trash-2",
      title: t("confirmDelete.title"),
      message: t("confirmDelete.body"),
      confirmLabel: t("confirmDelete.confirm"),
      destructive: true,
      onConfirm: async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("vendor_message_templates").delete().eq("id", row.id);
        if (error) {
          dialog.show({ icon: "alert-circle", title: t("deleteFailed"), message: error.message });
          return;
        }
        setRows((r) => r.filter((x) => x.id !== row.id));
      },
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 132 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ alignSelf: "flex-start", marginTop: 4 }}>
          <Feather name="chevron-left" size={26} color={INK} />
        </Pressable>
        <Text style={{ marginTop: 12, fontFamily: SERIF_BOLD, fontSize: 34, letterSpacing: -0.5, color: INK }}>
          {t("title")}
        </Text>
        <Text style={{ fontFamily: SERIF, marginTop: 6, fontSize: 15, lineHeight: 22, color: INK_DIM }}>
          {t("subtitle")}
        </Text>

        {loading ? (
          <View style={{ paddingVertical: 64, alignItems: "center" }}>
            <ActivityIndicator color={INK} />
          </View>
        ) : !listingId ? (
          <Card style={{ marginTop: 24 }}>
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 17, color: INK }}>{t("noListing.title")}</Text>
            <Text style={{ fontFamily: SERIF, marginTop: 6, fontSize: 14, lineHeight: 20, color: INK_DIM }}>
              {t("noListing.body")}
            </Text>
            <GoldButton label={t("noListing.cta")} onPress={() => router.push("/(vendor)/setup" as never)} style={{ marginTop: 16 }} />
          </Card>
        ) : (
          <>
            {listings.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 20 }} contentContainerStyle={{ gap: 8 }}>
                {listings.map((l) => {
                  const on = l.id === listingId;
                  return (
                    <Pressable
                      key={l.id}
                      onPress={() => {
                        setListingId(l.id);
                        void loadTemplates(l.id);
                      }}
                      style={{
                        paddingHorizontal: 14,
                        height: 36,
                        borderRadius: 999,
                        justifyContent: "center",
                        backgroundColor: on ? SELECTED : CARD,
                        borderWidth: 1,
                        borderColor: on ? SELECTED : BORDER,
                      }}
                    >
                      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: on ? ON_SELECTED : INK }}>
                        {l.business_name?.trim() || t("listingLabel")}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {rows.length === 0 ? (
              <Card style={{ marginTop: 20, alignItems: "center" }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="file-text" size={20} color={C.accentText} />
                </View>
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 18, color: INK, marginTop: 12 }}>{t("empty.title")}</Text>
                <Text style={{ fontFamily: SERIF, marginTop: 6, fontSize: 14, lineHeight: 20, color: INK_DIM, textAlign: "center" }}>
                  {t("empty.body")}
                </Text>
                <GoldButton label={t("empty.writeFirst")} onPress={() => setEditing("new")} style={{ marginTop: 16, alignSelf: "stretch" }} />
                <Pressable
                  onPress={seedStarters}
                  disabled={seeding}
                  style={{
                    marginTop: 10,
                    alignSelf: "stretch",
                    height: 44,
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: BORDER,
                    backgroundColor: CARD,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {seeding ? (
                    <ActivityIndicator color={INK} />
                  ) : (
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>{t("empty.useStarters")}</Text>
                  )}
                </Pressable>
              </Card>
            ) : (
              <View style={{ marginTop: 20, gap: 12 }}>
                {rows.map((r) => (
                  <Pressable key={r.id} onPress={() => setEditing(r)}>
                    <Card>
                      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }}>{r.name}</Text>
                          <Text numberOfLines={3} style={{ fontFamily: SERIF, marginTop: 4, fontSize: 13, lineHeight: 19, color: INK_DIM }}>
                            {r.body}
                          </Text>
                        </View>
                        <Pressable onPress={() => confirmDelete(r)} hitSlop={10} accessibilityLabel={t("delete")}>
                          <Feather name="trash-2" size={17} color={ERROR} />
                        </Pressable>
                      </View>
                    </Card>
                  </Pressable>
                ))}
                <GoldButton label={`+ ${t("new")}`} onPress={() => setEditing("new")} style={{ marginTop: 4 }} />
              </View>
            )}
          </>
        )}
      </ScrollView>

      {editing && listingId ? (
        <TemplateForm
          listingId={listingId}
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void loadTemplates(listingId);
          }}
        />
      ) : null}

      {dialog.element}
    </SafeAreaView>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View
      style={[
        { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 20, padding: 16 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function GoldButton({
  label,
  onPress,
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  style?: object;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        {
          height: 44,
          borderRadius: 22,
          backgroundColor: disabled || busy ? GOLD_MUTED : GOLD,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 20,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={ON_GOLD} />
      ) : (
        <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: ON_GOLD }}>{label}</Text>
      )}
    </Pressable>
  );
}

function TemplateForm({
  listingId,
  template,
  onClose,
  onSaved,
}: {
  listingId: string;
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT("templates");
  const dialog = useBrandDialog();
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (!name.trim() || !body.trim()) {
      dialog.show({ icon: "edit-2", title: t("toast.required") });
      return;
    }
    setSaving(true);
    const payload = { name: name.trim().slice(0, 80), body: body.trim(), updated_at: new Date().toISOString() };
    const { error } = template
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("vendor_message_templates").update(payload).eq("id", template.id)
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("vendor_message_templates").insert({ ...payload, vendor_id: listingId });
    setSaving(false);
    if (error) {
      dialog.show({ icon: "alert-circle", title: t("saveFailed"), message: error.message });
      return;
    }
    onSaved();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top", "bottom"]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="chevron-left" size={26} color={INK} />
          </Pressable>
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 20, color: INK, flexShrink: 1, textAlign: "center", marginHorizontal: 8 }}>
            {template ? t("dialog.editTitle") : t("dialog.newTitle")}
          </Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontFamily: SERIF, fontSize: 13, lineHeight: 18, color: INK_DIM, marginBottom: 12 }}>
            {t("dialog.description")}
          </Text>
          <Field label={t("dialog.name")} required>
            <Input value={name} onChangeText={setName} placeholder={t("dialog.namePlaceholder")} maxLength={80} />
          </Field>
          <Field label={t("dialog.body")} required>
            <Input
              value={body}
              onChangeText={setBody}
              placeholder={t("dialog.bodyPlaceholder")}
              multiline
              style={{ minHeight: 160, textAlignVertical: "top" }}
            />
          </Field>
          <GoldButton label={t("dialog.save")} onPress={save} busy={saving} style={{ marginTop: 16, height: 52, borderRadius: 26 }} />
        </ScrollView>
        {dialog.element}
      </SafeAreaView>
    </Modal>
  );
}
