// Host account settings. Reached from the Profile tab's "Account
// settings" card. Three sections:
//   1. Identity:    display_name (editable), email (read-only)
//   2. Sign out
//   3. Danger:      request account deletion via the existing RPC
//
// Display-name writes go straight to public.profiles (host owns the
// row via RLS). Delete uses `request_account_deletion`, the same
// SECURITY DEFINER path the web app uses — soft-delete + audit log.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const CREAM = "#f4f1ea";
const CREAM_DEEP = "#ece7db";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const BORDER = "#e6e1d5";
const DANGER = "#dc2828";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const name = (data as { display_name?: string } | null)?.display_name ?? "";
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
      Alert.alert("Display name is required");
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
      Alert.alert("Couldn't save", error.message);
      return;
    }
    setInitialName(trimmed);
    Alert.alert("Saved", "Your display name is updated.");
  }

  function confirmDelete() {
    Alert.alert(
      "Delete account?",
      "This kicks off account deletion. Your data is purged after a brief review period. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc(
              "request_account_deletion",
            );
            setDeleting(false);
            if (error) {
              Alert.alert("Couldn't submit request", error.message);
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
          behavior={Platform.OS === "ios" ? "padding" : undefined}
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
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 28,
                fontWeight: "500",
              }}
            >
              Account settings
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={{ paddingVertical: 48, alignItems: "center" }}>
                <ActivityIndicator color={INK} />
              </View>
            ) : (
              <>
                <SectionLabel>Profile</SectionLabel>

                <View style={field}>
                  <Text style={fieldLabel}>Display name</Text>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Your name"
                    placeholderTextColor={INK_DIM}
                    style={input}
                    autoCapitalize="words"
                  />
                </View>

                <View style={field}>
                  <Text style={fieldLabel}>Email</Text>
                  <Text style={readonly}>{user?.email ?? "—"}</Text>
                  <Text style={hint}>
                    Email changes aren't supported yet — reach out if you need
                    to switch the account email.
                  </Text>
                </View>

                <Pressable onPress={saveName} disabled={!dirty || saving}>
                  {({ pressed }) => (
                    <View
                      style={{
                        marginTop: 12,
                        backgroundColor: dirty ? INK : BORDER,
                        paddingVertical: 14,
                        borderRadius: 16,
                        alignItems: "center",
                        opacity: pressed ? 0.85 : 1,
                      }}
                    >
                      {saving ? (
                        <ActivityIndicator color={CREAM} />
                      ) : (
                        <Text
                          style={{
                            color: dirty ? CREAM : INK_DIM,
                            fontWeight: "700",
                          }}
                        >
                          Save
                        </Text>
                      )}
                    </View>
                  )}
                </Pressable>

                <SectionLabel style={{ marginTop: 32 }}>Session</SectionLabel>
                <Pressable onPress={signOut}>
                  {({ pressed }) => (
                    <View
                      style={{
                        marginTop: 12,
                        backgroundColor: "#fbf9f4",
                        paddingVertical: 16,
                        paddingHorizontal: 16,
                        borderRadius: 18,
                        flexDirection: "row",
                        alignItems: "center",
                        opacity: pressed ? 0.85 : 1,
                      }}
                    >
                      <Feather name="log-out" size={18} color={INK} />
                      <Text
                        style={{
                          marginLeft: 12,
                          color: INK,
                          fontSize: 15,
                          fontWeight: "600",
                        }}
                      >
                        Sign out
                      </Text>
                    </View>
                  )}
                </Pressable>

                <SectionLabel style={{ marginTop: 32, color: DANGER }}>
                  Danger zone
                </SectionLabel>
                <Pressable onPress={confirmDelete} disabled={deleting}>
                  {({ pressed }) => (
                    <View
                      style={{
                        marginTop: 12,
                        backgroundColor: "#fbf9f4",
                        paddingVertical: 16,
                        paddingHorizontal: 16,
                        borderRadius: 18,
                        flexDirection: "row",
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: "#f5d5d2",
                        opacity: pressed ? 0.85 : 1,
                      }}
                    >
                      <Feather name="trash-2" size={18} color={DANGER} />
                      <Text
                        style={{
                          marginLeft: 12,
                          color: DANGER,
                          fontSize: 15,
                          fontWeight: "600",
                        }}
                      >
                        {deleting ? "Submitting…" : "Delete account"}
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
        {
          marginTop: 16,
          color: INK_DIM,
          fontSize: 12,
          fontWeight: "700",
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

const field = {
  marginTop: 12,
  backgroundColor: "#fbf9f4",
  borderRadius: 18,
  paddingHorizontal: 16,
  paddingTop: 12,
  paddingBottom: 14,
} as const;

const fieldLabel = {
  color: INK_DIM,
  fontSize: 12,
  fontWeight: "700" as const,
  letterSpacing: 0.5,
  textTransform: "uppercase" as const,
};

const input = {
  marginTop: 6,
  color: INK,
  fontSize: 16,
  paddingVertical: 4,
};

const readonly = {
  marginTop: 6,
  color: INK,
  fontSize: 16,
  paddingVertical: 4,
};

const hint = {
  marginTop: 6,
  color: INK_DIM,
  fontSize: 12,
};
