// A closed account waiting out its 30-day grace period (owner's call,
// Oct 2026): profiles.deletion_scheduled_for is set. While it is, the
// signed-in user can't use the app; every screen is replaced by this one,
// which offers Restore (restore_account_deletion(): clears the date and
// un-pauses the listings that were paused for the deletion) or Sign out.
// The website and the other app show the same screen. Follows the app
// theme like the sign-in screens, on the same AuthBackdrop.

import { useState } from "react";
import type { ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, StatusBar, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AuthBackdrop } from "@/components/AuthBackdrop";
import { BUTTON_HEIGHT, RADIUS } from "@/lib/ui";
import { C } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";

export function AccountDeletionGate({ children }: { children: ReactNode }) {
  const { user, deletionScheduledFor } = useAuth();
  if (!user || !deletionScheduledFor) return <>{children}</>;
  return <DeletionScheduledScreen scheduledFor={deletionScheduledFor} />;
}

function DeletionScheduledScreen({ scheduledFor }: { scheduledFor: string }) {
  const { refreshDeletion, signOut } = useAuth();
  const [busy, setBusy] = useState<"restore" | "signout" | null>(null);
  const { t, locale } = useT("accountDeletionGate");

  const date = new Date(scheduledFor).toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  async function restore() {
    setBusy("restore");
    const { error } = await supabase.rpc("restore_account_deletion");
    if (error) {
      setBusy(null);
      Alert.alert(t("restoreFailed"), error.message);
      return;
    }
    await refreshDeletion();
    setBusy(null);
  }

  async function leave() {
    setBusy("signout");
    await signOut();
    setBusy(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.page }}>
      <AuthBackdrop />
      <StatusBar barStyle={C.statusBar === "dark" ? "dark-content" : "light-content"} backgroundColor={C.page} />
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20 }}>
        <View
          style={{
            borderRadius: RADIUS.card,
            borderWidth: 1,
            borderColor: C.border,
            backgroundColor: C.card,
            padding: 24,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ fontFamily: SERIF_BOLD, color: C.text, fontSize: 26, lineHeight: 32, textAlign: "center" }}
          >
            {t("title")}
          </Text>
          <Text
            style={{ fontFamily: SERIF, color: C.text, fontSize: 15, lineHeight: 23, marginTop: 16, textAlign: "center" }}
          >
            {t("body", { date })}
          </Text>
          <Text
            style={{ fontFamily: SERIF, color: C.textDim, fontSize: 13, lineHeight: 20, marginTop: 12, textAlign: "center" }}
          >
            {t("note")}
          </Text>

          <Pressable
            onPress={restore}
            disabled={busy !== null}
            accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: 28,
              height: BUTTON_HEIGHT.lg,
              borderRadius: RADIUS.pill,
              backgroundColor: busy !== null ? C.goldMuted : C.gold,
              opacity: pressed ? 0.9 : 1,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            {busy === "restore" ? (
              <ActivityIndicator color={C.onGold} />
            ) : (
              <Text style={{ fontFamily: SERIF_BOLD, color: C.onGold, fontSize: 16 }}>
                {t("restore")}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={leave}
            disabled={busy !== null}
            accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: 12,
              height: BUTTON_HEIGHT.lg,
              borderRadius: RADIUS.pill,
              borderWidth: 1,
              borderColor: C.border,
              backgroundColor: C.field,
              opacity: pressed ? 0.8 : 1,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            {busy === "signout" ? (
              <ActivityIndicator color={C.text} />
            ) : (
              <Text style={{ fontFamily: SERIF_BOLD, color: C.text, fontSize: 16 }}>
                {t("signOut")}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
