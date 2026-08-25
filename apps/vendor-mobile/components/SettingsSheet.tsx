// Account settings bottom sheet — shared by the Profile tab's ☰
// button and the More tab's "Settings" row. Extracted verbatim from
// profile.tsx so both entry points show the identical sheet: email +
// verified badge, change password, 2FA placeholder, push toggle,
// language, log out, delete account.

import { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { tryRegisterPushToken } from "@/lib/pushNotifications";
import { supabase } from "@/lib/supabase";
import { useBrandDialog } from "@/components/listing/WizardKit";

// Cream Vendora palette — same tokens as the tab screens.
const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const SURFACE = "#ece7db";
const BORDER = "#e6e1d5";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const GOLD_SOFT = "#eadfc6";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

export function SettingsSheet({
  open,
  onClose,
  email,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  onSignOut: () => Promise<void>;
}) {
  const { user } = useAuth();
  const dialog = useBrandDialog();

  // "Account" view vs inline "Change password" form. The sheet swaps
  // its body when the password row is tapped so the design stays
  // single-column.
  const [view, setView] = useState<"main" | "password">("main");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  const [emailVerified, setEmailVerified] = useState(false);
  const [language, setLanguage] = useState("en-US");
  const [pushOn, setPushOn] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);

  const refreshAccountState = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setEmailVerified(!!data?.user?.email_confirmed_at);
    if (user?.id) {
      const [{ data: prof }, { count }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("profiles")
          .select("preferred_language")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("device_push_tokens")
          .select("token", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);
      setLanguage(prof?.preferred_language ?? "en-US");
      setPushOn((count ?? 0) > 0);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    setView("main");
    refreshAccountState();
  }, [open, refreshAccountState]);

  // Re-check email-verified state when the app comes back to
  // foreground while the sheet is open. Catches the "user verified
  // in a browser tab and switched back" path.
  useEffect(() => {
    if (!open) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") refreshAccountState();
    });
    return () => sub.remove();
  }, [open, refreshAccountState]);

  async function changePassword() {
    if (newPwd.length < 8) {
      dialog.show({
        icon: "lock",
        title: "Password too short",
        message: "Must be at least 8 characters.",
      });
      return;
    }
    if (newPwd !== confirmPwd) {
      dialog.show({
        icon: "lock",
        title: "Passwords don't match",
        message: "Please re-type the new password.",
      });
      return;
    }
    setPwdSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setPwdSubmitting(false);
    if (error) {
      dialog.show({
        icon: "alert-circle",
        title: "Couldn't change password",
        message: error.message,
      });
      return;
    }
    setNewPwd("");
    setConfirmPwd("");
    setView("main");
    dialog.show({
      icon: "check-circle",
      title: "Password updated",
      message: "Your new password is active.",
    });
  }

  // OFF deletes the device_push_tokens rows; ON re-runs the
  // permission + token-registration flow inline (don't wait for
  // next cold-start). If the OS permission is denied, the
  // tryRegisterPushToken call no-ops and we revert the toggle.
  async function togglePush() {
    if (!user?.id || pushBusy) return;
    setPushBusy(true);
    const next = !pushOn;
    setPushOn(next);
    if (!next) {
      const { error } = await supabase
        .from("device_push_tokens")
        .delete()
        .eq("user_id", user.id);
      if (error) setPushOn(true);
    } else {
      try {
        await tryRegisterPushToken(user.id, "vendor");
        // Verify a token row actually landed — if the OS denied
        // permission, none was inserted and we should reflect that.
        const { count } = await supabase
          .from("device_push_tokens")
          .select("token", { count: "exact", head: true })
          .eq("user_id", user.id);
        if ((count ?? 0) === 0) {
          setPushOn(false);
          dialog.show({
            icon: "bell",
            title: "Push permission needed",
            message:
              "Enable notifications for Vendora in your device Settings to receive pushes.",
          });
        }
      } catch {
        setPushOn(false);
      }
    }
    setPushBusy(false);
  }

  function onTwoStep() {
    dialog.show({
      icon: "shield",
      title: "Two-step verification",
      message:
        "Stronger sign-in is on the roadmap. Today every login already uses an email-code check; the toggle will switch to authenticator-app 2FA when it ships.",
    });
  }

  function onLanguage() {
    dialog.show({
      icon: "globe",
      title: "Language",
      message:
        "More languages are on the way. The app currently runs in English (US).",
    });
  }

  function onSignOutPress() {
    dialog.show({
      icon: "log-out",
      title: "Sign out",
      message: "Are you sure?",
      confirmLabel: "Sign out",
      cancelLabel: "Cancel",
      destructive: true,
      onConfirm: () => {
        onClose();
        onSignOut();
      },
    });
  }

  function onDeleteAccount() {
    dialog.show({
      icon: "trash-2",
      title: "Delete your account?",
      message:
        "This permanently deletes your account, all listings, messages, and history. You can't undo this.",
      confirmLabel: "Delete account",
      cancelLabel: "Cancel",
      destructive: true,
      onConfirm: () => {
        void (async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).rpc(
            "request_account_deletion",
          );
          if (error) {
            dialog.show({
              icon: "alert-circle",
              title: "Couldn't delete account",
              message: error.message,
            });
            return;
          }
          onClose();
          onSignOut();
        })();
      },
    });
  }

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(10,10,10,0.45)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: PAGE,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 10,
            paddingBottom: 24,
            maxHeight: "92%",
          }}
        >
          {/* Drag handle */}
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: "rgba(20,22,26,0.08)",
              marginBottom: 14,
            }}
          />

          {view === "main" ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}
            >
              {/* Title row */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: INK,
                    fontFamily: SERIF_BOLD,
                    fontSize: 30,
                    letterSpacing: -0.5,
                  }}
                >
                  Account
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    backgroundColor: SURFACE,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="x" size={16} color={INK} />
                </Pressable>
              </View>
              <Text
                style={{
                  fontFamily: SERIF,
                  marginTop: 8,
                  color: INK_DIM,
                  fontSize: 13.5,
                  lineHeight: 19,
                }}
              >
                Sign-in details and how Vendora reaches you.
              </Text>

              {/* SIGN IN */}
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  marginTop: 26,
                  marginBottom: 10,
                  color: INK_DIM,
                  fontSize: 11,
                  letterSpacing: 1.2,
                }}
              >
                SIGN IN
              </Text>
              <View
                style={{
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 18,
                  overflow: "hidden",
                }}
              >
                <SettingsRow
                  icon="mail"
                  label="EMAIL"
                  body={email || "—"}
                  right={
                    emailVerified ? (
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          backgroundColor: GOLD_SOFT,
                          borderRadius: 999,
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            backgroundColor: "#8a6f3e",
                            marginRight: 5,
                          }}
                        />
                        <Text
                          style={{
                            fontFamily: SERIF_BOLD,
                            color: "#8a6f3e",
                            fontSize: 12,
                          }}
                        >
                          Verified
                        </Text>
                      </View>
                    ) : null
                  }
                />
                <RowDivider />
                <SettingsRow
                  icon="lock"
                  label="Change password"
                  body="Tap to update"
                  onPress={() => setView("password")}
                />
                <RowDivider />
                <SettingsRow
                  icon="shield"
                  label="Two-step verification"
                  body="Off — recommended for vendors"
                  right={<Toggle value={false} onPress={onTwoStep} />}
                  onPress={onTwoStep}
                />
              </View>

              {/* PREFERENCES */}
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  marginTop: 26,
                  marginBottom: 10,
                  color: INK_DIM,
                  fontSize: 11,
                  letterSpacing: 1.2,
                }}
              >
                PREFERENCES
              </Text>
              <View
                style={{
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 18,
                  overflow: "hidden",
                }}
              >
                <SettingsRow
                  icon="bell"
                  label="Push notifications"
                  body="Bookings, messages, reminders"
                  right={<Toggle value={pushOn} onPress={togglePush} disabled={pushBusy} />}
                  onPress={togglePush}
                />
                <RowDivider />
                <SettingsRow
                  icon="globe"
                  label="Language"
                  body={language === "en-US" ? "English (US)" : language}
                  onPress={onLanguage}
                />
              </View>

              {/* Log out + Delete */}
              <Pressable
                onPress={onSignOutPress}
                style={{
                  marginTop: 24,
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 18,
                  paddingVertical: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="log-out" size={18} color={INK} />
                <Text
                  style={{
                    fontFamily: SERIF_BOLD,
                    color: INK,
                    fontSize: 16,
                    marginLeft: 8,
                  }}
                >
                  Log out
                </Text>
              </Pressable>

              <Pressable
                onPress={onDeleteAccount}
                style={{
                  marginTop: 10,
                  backgroundColor: CARD,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "#e8c8bf",
                  paddingVertical: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="trash-2" size={16} color="#dc2828" />
                <Text
                  style={{
                    fontFamily: SERIF_BOLD,
                    color: "#dc2828",
                    fontSize: 16,
                    marginLeft: 8,
                  }}
                >
                  Delete account
                </Text>
              </Pressable>

              <Text
                style={{
                  fontFamily: SERIF,
                  marginTop: 16,
                  textAlign: "center",
                  color: INK_DIM,
                  fontSize: 13.5,
                  lineHeight: 19,
                  paddingHorizontal: 12,
                }}
              >
                Deleting your account is permanent. Your listings, messages, and
                reviews will be removed.
              </Text>
            </ScrollView>
          ) : (
            // Inline "Change password" form — back chevron returns to
            // the main settings view, save updates the auth user.
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Pressable
                  onPress={() => {
                    setView("main");
                    setNewPwd("");
                    setConfirmPwd("");
                  }}
                  hitSlop={10}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    backgroundColor: SURFACE,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="chevron-left" size={18} color={INK} />
                </Pressable>
                <Text
                  style={{
                    color: INK,
                    fontFamily: SERIF_BOLD,
                    fontSize: 20,
                  }}
                >
                  Change password
                </Text>
                <View style={{ width: 32 }} />
              </View>
              <Text
                style={{
                  fontFamily: SERIF,
                  marginTop: 14,
                  color: INK_DIM,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                At least 8 characters. Pick something you don&apos;t use
                anywhere else.
              </Text>

              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  marginTop: 24,
                  color: INK_DIM,
                  fontSize: 11,
                  letterSpacing: 1,
                }}
              >
                NEW PASSWORD
              </Text>
              <TextInput
                secureTextEntry
                value={newPwd}
                onChangeText={setNewPwd}
                placeholder="••••••••"
                placeholderTextColor={INK_DIM}
                style={{
                  marginTop: 6,
                  backgroundColor: CARD,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: BORDER,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: INK,
                  fontSize: 16,
                }}
              />

              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  marginTop: 18,
                  color: INK_DIM,
                  fontSize: 11,
                  letterSpacing: 1,
                }}
              >
                CONFIRM PASSWORD
              </Text>
              <TextInput
                secureTextEntry
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                placeholder="••••••••"
                placeholderTextColor={INK_DIM}
                style={{
                  marginTop: 6,
                  backgroundColor: CARD,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: BORDER,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: INK,
                  fontSize: 16,
                }}
              />

              <Pressable
                onPress={changePassword}
                disabled={pwdSubmitting || newPwd.length < 8 || newPwd !== confirmPwd}
                style={{
                  marginTop: 22,
                  backgroundColor: INK,
                  borderRadius: 999,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity:
                    pwdSubmitting || newPwd.length < 8 || newPwd !== confirmPwd
                      ? 0.5
                      : 1,
                }}
              >
                <Text
                  style={{ fontFamily: SERIF_BOLD, color: "#ffffff", fontSize: 15}}
                >
                  {pwdSubmitting ? "Saving…" : "Save password"}
                </Text>
              </Pressable>
            </ScrollView>
          )}
          {dialog.element}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SettingsRow({
  icon,
  label,
  body,
  right,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  body: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const Inner = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 14,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: SURFACE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={18} color={INK} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          style={{
            fontFamily: SERIF_BOLD,
            color: INK_DIM,
            fontSize: 11,
            letterSpacing: 0.8,
          }}
        >
          {label.toUpperCase() === label ? label : null}
        </Text>
        <Text
          style={{
            fontFamily: SERIF_BOLD,
            color: INK,
            fontSize: 16,
            marginTop: label.toUpperCase() === label ? 2 : 0,
          }}
          numberOfLines={1}
        >
          {label.toUpperCase() === label ? body : label}
        </Text>
        {label.toUpperCase() === label ? null : (
          <Text
            style={{
              fontFamily: SERIF,
              marginTop: 2,
              color: INK_DIM,
              fontSize: 13,
            }}
            numberOfLines={1}
          >
            {body}
          </Text>
        )}
      </View>
      {right ?? (
        onPress ? (
          <Feather name="chevron-right" size={20} color={INK_DIM} />
        ) : null
      )}
    </View>
  );
  if (!onPress) return Inner;
  return <Pressable onPress={onPress}>{Inner}</Pressable>;
}

function RowDivider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: BORDER,
        marginLeft: 64,
      }}
    />
  );
}

function Toggle({
  value,
  onPress,
  disabled,
}: {
  value: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={{
        width: 48,
        height: 28,
        borderRadius: 999,
        backgroundColor: value ? INK : "#d6d1c6",
        padding: 3,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          backgroundColor: "#ffffff",
          transform: [{ translateX: value ? 20 : 0 }],
        }}
      />
    </Pressable>
  );
}
