// A closed account waiting out its 30-day grace period (owner's call,
// Oct 2026): profiles.deletion_scheduled_for is set. While it is, the
// signed-in user can't use the app; every screen is replaced by this one,
// which offers Restore (restore_account_deletion(): clears the date and
// un-pauses the listings that were paused for the deletion) or Sign out.
// The website and the other app show the same screen. Dark like the
// sign-in screens, on the same AuthBackdrop.

import { useState } from "react";
import type { ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, StatusBar, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AuthBackdrop } from "@/components/AuthBackdrop";
import { BUTTON_HEIGHT, COLORS, RADIUS } from "@/lib/ui";

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

  const date = new Date(scheduledFor).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  async function restore() {
    setBusy("restore");
    const { error } = await supabase.rpc("restore_account_deletion");
    if (error) {
      setBusy(null);
      Alert.alert("Couldn't restore your account", error.message);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.ink }}>
      <AuthBackdrop />
      <StatusBar barStyle="light-content" backgroundColor={COLORS.ink} />
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20 }}>
        <View
          style={{
            borderRadius: RADIUS.card,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.15)",
            backgroundColor: "rgba(255,255,255,0.03)",
            padding: 24,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ fontFamily: SERIF_BOLD, color: COLORS.ivory, fontSize: 26, lineHeight: 32, textAlign: "center" }}
          >
            Your account is closed
          </Text>
          <Text
            style={{ fontFamily: SERIF, color: COLORS.ivory, fontSize: 15, lineHeight: 23, marginTop: 16, textAlign: "center" }}
          >
            Your account is scheduled for deletion on {date}. Restore it to keep using Vendora.
          </Text>
          <Text
            style={{ fontFamily: SERIF, color: "rgba(244,241,234,0.8)", fontSize: 13, lineHeight: 20, marginTop: 12, textAlign: "center" }}
          >
            Your listings come back as they were. A canceled plan stays canceled.
          </Text>

          <Pressable
            onPress={restore}
            disabled={busy !== null}
            accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: 28,
              height: BUTTON_HEIGHT.lg,
              borderRadius: RADIUS.pill,
              backgroundColor: busy !== null ? COLORS.goldMuted : COLORS.gold,
              opacity: pressed ? 0.9 : 1,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            {busy === "restore" ? (
              <ActivityIndicator color={COLORS.ink} />
            ) : (
              <Text style={{ fontFamily: SERIF_BOLD, color: COLORS.ink, fontSize: 16 }}>
                Restore account
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
              borderColor: "rgba(255,255,255,0.15)",
              opacity: pressed ? 0.8 : 1,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            {busy === "signout" ? (
              <ActivityIndicator color={COLORS.ivory} />
            ) : (
              <Text style={{ fontFamily: SERIF_BOLD, color: COLORS.ivory, fontSize: 16 }}>
                Sign out
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
