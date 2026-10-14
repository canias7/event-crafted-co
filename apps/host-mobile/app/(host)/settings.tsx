// Host account settings. Reached from the Profile tab's "Account
// settings" card. Sections:
//   1. Identity:    display_name (editable), email (read-only)
//   2. Notifications: vendor reply emails on/off
//   3. Help & legal: links to the website's Help, Terms, Privacy
//   4. Sign out
//   5. Danger:      delete the account via the delete-account function
//
// Display-name writes go straight to public.profiles (host owns the
// row via RLS). Delete calls the delete-account edge function, the same
// path the website and vendor app use: it cancels any Stripe plan, then
// runs request_account_deletion, which closes the account and deletes it
// for good after 30 days unless the host signs back in and restores it.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useT } from "@/lib/i18n";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const CREAM = "#f4f1ea";
const CREAM_DEEP = "#ece7db";
const INK = "#14161a";
const GOLD = "#c9a86a";
// Disabled fill for the gold pill — solid, not faded.
const GOLD_MUTED = "#e0d2b0";
const INK_DIM = "#14161a";
const PLACEHOLDER = "#746a58";
const BORDER = "#e6e1d5";
const DANGER = "#b23a34";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";

// The website hosts Help, Terms and Privacy; the app links to them so
// both always show the same text.
// Labels are read at render time from settings.links.<key>.
const LEGAL_LINKS = [
  { key: "help", url: "https://eventvendora.com/help", icon: "help-circle" },
  { key: "terms", url: "https://eventvendora.com/terms", icon: "file-text" },
  { key: "privacy", url: "https://eventvendora.com/privacy", icon: "lock" },
] as const;

export default function SettingsScreen() {
  const { t: tc } = useT("common");
  const { t } = useT("settings");
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // notification_prefs.reply_email: email when a vendor replies. A
  // missing key counts as on (scan-host-reply-emails reads it the same way).
  const [prefs, setPrefs] = useState<Record<string, unknown>>({});
  const replyEmail = prefs.reply_email !== false;

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("display_name, notification_prefs")
      .eq("id", user.id)
      .maybeSingle();
    const row = data as {
      display_name?: string;
      notification_prefs?: Record<string, unknown> | null;
    } | null;
    setPrefs(row?.notification_prefs ?? {});
    const name = row?.display_name ?? "";
    setDisplayName(name);
    setInitialName(name);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveName() {
    if (!user?.id) return;
    const trimmed = displayName.trim();
    if (!trimmed) {
      Alert.alert(t("nameRequired"));
      return;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ display_name: trimmed })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      Alert.alert(t("saveError"), error.message);
      return;
    }
    setInitialName(trimmed);
    Alert.alert(t("savedTitle"), t("savedBody"));
  }

  async function toggleReplyEmail(next: boolean) {
    if (!user?.id) return;
    const previous = prefs;
    const updated = { ...prefs, reply_email: next };
    setPrefs(updated);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ notification_prefs: updated })
      .eq("id", user.id);
    if (error) {
      setPrefs(previous);
      Alert.alert(t("saveError"), error.message);
    }
  }

  function confirmDelete() {
    Alert.alert(
      t("deleteConfirm.title"),
      t("deleteConfirm.body"),
      [
        { text: t("deleteConfirm.cancel"), style: "cancel" },
        {
          text: t("deleteConfirm.confirm"),
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            // Same server path as the website and the vendor app: it
            // cancels any Stripe plan, then closes the account.
            const { error } = await supabase.functions.invoke(
              "delete-account",
              { body: {} },
            );
            setDeleting(false);
            if (error) {
              Alert.alert(t("deleteError"), error.message);
              return;
            }
            await signOut();
          },
        },
      ],
    );
  }

  const dirty = displayName.trim() !== initialName.trim();

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={{ padding: 8 }}
            >
              <Feather name="chevron-left" size={24} color={INK} />
            </Pressable>
            <Text
              style={{
                marginLeft: 4,
                color: INK,
                fontFamily: SERIF_BOLD,
                fontSize: 28,
                flexShrink: 1,
              }}
            >
              {t("title")}
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={{ paddingVertical: 48, alignItems: "center" }}>
                <ActivityIndicator color={INK} />
              </View>
            ) : (
              <>
                <SectionLabel>{t("sections.profile")}</SectionLabel>

                <View style={field}>
                  <Text style={fieldLabel}>{t("displayName")}</Text>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder={t("namePlaceholder")}
                    placeholderTextColor={PLACEHOLDER}
                    style={input}
                    autoCapitalize="words"
                  />
                </View>

                <View style={field}>
                  <Text style={fieldLabel}>{t("email")}</Text>
                  <Text style={readonly}>{user?.email ?? "—"}</Text>
                  <Text style={hint}>
                    {t("emailHint")}
                  </Text>
                </View>

                <Pressable onPress={saveName} disabled={!dirty || saving}>
                  {({ pressed }) => (
                    <View
                      style={{
                        // Full-width primary: gold pill at 52.
                        marginTop: 12,
                        backgroundColor: dirty ? GOLD : GOLD_MUTED,
                        height: 52,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.85 : 1,
                      }}
                    >
                      {saving ? (
                        <ActivityIndicator color={INK} />
                      ) : (
                        <Text
                          style={{ fontFamily: SERIF_BOLD,
                            color: INK,
                          }}
                        >
                          {t("save")}
                        </Text>
                      )}
                    </View>
                  )}
                </Pressable>

                <SectionLabel style={{ marginTop: 32 }}>{t("sections.notifications")}</SectionLabel>
                <View
                  style={[
                    field,
                    { flexDirection: "row", alignItems: "center" },
                  ]}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 15 }}>
                      {t("replyEmail.title")}
                    </Text>
                    <Text style={hint}>
                      {t("replyEmail.hint")}
                    </Text>
                  </View>
                  <Switch
                    value={replyEmail}
                    onValueChange={(v) => void toggleReplyEmail(v)}
                    trackColor={{ false: BORDER, true: INK }}
                    thumbColor="#ffffff"
                    accessibilityLabel={t("replyEmail.title")}
                  />
                </View>

                <SectionLabel style={{ marginTop: 32 }}>{tc("language.title")}</SectionLabel>
                <View style={field}>
                  <LanguagePicker />
                  <Text style={[hint, { marginTop: 10 }]}>{tc("language.note")}</Text>
                </View>

                <SectionLabel style={{ marginTop: 32 }}>{t("sections.help")}</SectionLabel>
                <View style={[field, { paddingVertical: 4 }]}>
                  {LEGAL_LINKS.map((l, i) => (
                    <Pressable
                      key={l.url}
                      onPress={() => void Linking.openURL(l.url)}
                      accessibilityRole="link"
                    >
                      {({ pressed }) => (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 12,
                            borderTopWidth: i === 0 ? 0 : 1,
                            borderTopColor: BORDER,
                            opacity: pressed ? 0.7 : 1,
                          }}
                        >
                          <Feather name={l.icon} size={18} color={INK} />
                          <Text
                            style={{
                              fontFamily: SERIF_BOLD,
                              marginLeft: 12,
                              color: INK,
                              fontSize: 15,
                              flex: 1,
                            }}
                          >
                            {t(`links.${l.key}`)}
                          </Text>
                          <Feather name="external-link" size={16} color={INK} />
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>

                <SectionLabel style={{ marginTop: 32 }}>{t("sections.session")}</SectionLabel>
                <Pressable onPress={signOut}>
                  {({ pressed }) => (
                    <View
                      style={{
                        marginTop: 12,
                        backgroundColor: "#fbf9f4",
                        paddingVertical: 16,
                        paddingHorizontal: 16,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: BORDER,
                        flexDirection: "row",
                        alignItems: "center",
                        opacity: pressed ? 0.85 : 1,
                      }}
                    >
                      <Feather name="log-out" size={18} color={INK} />
                      <Text
                        style={{ fontFamily: SERIF_BOLD,
                          marginLeft: 12,
                          color: INK,
                          fontSize: 15,
                        }}
                      >
                        {t("signOut")}
                      </Text>
                    </View>
                  )}
                </Pressable>

                <SectionLabel style={{ marginTop: 32, color: DANGER }}>
                  {t("sections.danger")}
                </SectionLabel>
                <Pressable onPress={confirmDelete} disabled={deleting}>
                  {({ pressed }) => (
                    <View
                      style={{
                        marginTop: 12,
                        backgroundColor: "#fbf9f4",
                        paddingVertical: 16,
                        paddingHorizontal: 16,
                        borderRadius: 20,
                        flexDirection: "row",
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: "#e6c9c2",
                        opacity: pressed ? 0.85 : 1,
                      }}
                    >
                      <Feather name="trash-2" size={18} color={DANGER} />
                      <Text
                        style={{ fontFamily: SERIF_BOLD,
                          marginLeft: 12,
                          color: DANGER,
                          fontSize: 15,
                        }}
                      >
                        {deleting ? t("submitting") : t("deleteAccount")}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <Text
      style={[
        { fontFamily: SERIF_BOLD,
          marginTop: 16,
          color: INK_DIM,
          fontSize: 12,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// Settings group card: cream fill, hairline border, radius 20, padding 16.
const field = {
  marginTop: 12,
  backgroundColor: "#fbf9f4",
  borderRadius: 20,
  borderWidth: 1,
  borderColor: BORDER,
  padding: 16,
} as const;

const fieldLabel = { fontFamily: SERIF_BOLD,
  color: INK_DIM,
  fontSize: 12,
  letterSpacing: 0.5,
  textTransform: "uppercase" as const,
};

const input = { fontFamily: SERIF,
  marginTop: 6,
  color: INK,
  fontSize: 16,
  paddingVertical: 4,
};

const readonly = { fontFamily: SERIF,
  marginTop: 6,
  color: INK,
  fontSize: 16,
  paddingVertical: 4,
};

const hint = { fontFamily: SERIF,
  marginTop: 6,
  color: INK_DIM,
  fontSize: 12,
};
