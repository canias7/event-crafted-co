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
import { LanguagePicker } from "@/components/LanguagePicker";
import { LANGUAGES, useT } from "@/lib/i18n";
import { C, IS_DARK, setDarkMode } from "@/lib/theme";

// Vendora palette (light / dark, lib/theme.ts) — same tokens as the tab screens.
const CARD = C.card;
const SURFACE = C.surface;
const BORDER = C.border;
const INK = C.text;
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = C.textDim;
const PLACEHOLDER = C.placeholder;
const GOLD = C.gold;
// Disabled fill for the gold pill — solid, not faded, so "unavailable"
// never reads as "broken".
const GOLD_MUTED = C.goldMuted;
const GOLD_SOFT = C.pending;
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

// The error code a failed edge function sent back, if it sent JSON.
async function readFunctionError(error: unknown): Promise<string | null> {
  const res = (error as { context?: Response })?.context;
  if (!res || typeof res.json !== "function") return null;
  try {
    const body = await res.json();
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

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
  const { t: tc, lang } = useT("common");
  const { t } = useT("settingsSheet");

  // "Account" view vs inline "Change password" form. The sheet swaps
  // its body when the password row is tapped so the design stays
  // single-column.
  const [view, setView] = useState<"main" | "password">("main");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  const [emailVerified, setEmailVerified] = useState(false);
  const [pushOn, setPushOn] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);

  const refreshAccountState = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setEmailVerified(!!data?.user?.email_confirmed_at);
    if (user?.id) {
      const { count } = await supabase
        .from("device_push_tokens")
        .select("token", { count: "exact", head: true })
        .eq("user_id", user.id);
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
        title: t("dialogs.tooShort.title"),
        message: t("dialogs.tooShort.message"),
      });
      return;
    }
    if (newPwd !== confirmPwd) {
      dialog.show({
        icon: "lock",
        title: t("dialogs.mismatch.title"),
        message: t("dialogs.mismatch.message"),
      });
      return;
    }
    setPwdSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setPwdSubmitting(false);
    if (error) {
      dialog.show({
        icon: "alert-circle",
        title: t("dialogs.changeFailed"),
        message: error.message,
      });
      return;
    }
    setNewPwd("");
    setConfirmPwd("");
    setView("main");
    dialog.show({
      icon: "check-circle",
      title: t("dialogs.updated.title"),
      message: t("dialogs.updated.message"),
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
            title: t("dialogs.pushPermission.title"),
            message: t("dialogs.pushPermission.message"),
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
      title: t("dialogs.twoStep.title"),
      message: t("dialogs.twoStep.message"),
    });
  }


  function onSignOutPress() {
    dialog.show({
      icon: "log-out",
      title: t("dialogs.signOut.title"),
      message: t("dialogs.signOut.message"),
      confirmLabel: t("dialogs.signOut.confirm"),
      cancelLabel: tc("actions.cancel"),
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
      title: t("dialogs.delete.title"),
      message: t("dialogs.delete.message"),
      confirmLabel: t("dialogs.delete.confirm"),
      cancelLabel: tc("actions.cancel"),
      destructive: true,
      onConfirm: () => {
        void (async () => {
          // delete-account cancels any Stripe plan, then closes the
          // account: it's permanently deleted after 30 days unless the
          // vendor signs back in and restores it (AccountDeletionGate).
          const { error } = await supabase.functions.invoke(
            "delete-account",
            { body: {} },
          );
          if (error) {
            const code = await readFunctionError(error);
            dialog.show({
              icon: "alert-circle",
              title: t("dialogs.deleteFailed.title"),
              message:
                code === "subscription_cancel_failed"
                  ? t("dialogs.deleteFailed.cancelFailed")
                  : error.message,
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
            backgroundColor: CARD,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
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
              backgroundColor: BORDER,
              marginBottom: 16,
            }}
          />

          {view === "main" ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}
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
                  {t("title")}
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
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                {t("subtitle")}
              </Text>

              {/* SIGN IN */}
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  marginTop: 24,
                  marginBottom: 10,
                  color: INK_DIM,
                  fontSize: 11,
                  letterSpacing: 1.2,
                }}
              >
                {t("sections.signIn")}
              </Text>
              <View
                style={{
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 20,
                  overflow: "hidden",
                }}
              >
                <SettingsRow
                  icon="mail"
                  label={t("rows.email")}
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
                            backgroundColor: C.pendingText,
                            marginRight: 5,
                          }}
                        />
                        <Text
                          style={{
                            fontFamily: SERIF_BOLD,
                            color: C.pendingText,
                            fontSize: 12,
                          }}
                        >
                          {t("rows.verified")}
                        </Text>
                      </View>
                    ) : null
                  }
                />
                <RowDivider />
                <SettingsRow
                  icon="lock"
                  label={t("rows.password.label")}
                  body={t("rows.password.body")}
                  onPress={() => setView("password")}
                />
                <RowDivider />
                <SettingsRow
                  icon="shield"
                  label={t("rows.twoStep.label")}
                  body={t("rows.twoStep.body")}
                  right={<Toggle value={false} onPress={onTwoStep} />}
                  onPress={onTwoStep}
                />
              </View>

              {/* PREFERENCES */}
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  marginTop: 24,
                  marginBottom: 10,
                  color: INK_DIM,
                  fontSize: 11,
                  letterSpacing: 1.2,
                }}
              >
                {t("sections.preferences")}
              </Text>
              <View
                style={{
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 20,
                  overflow: "hidden",
                }}
              >
                <SettingsRow
                  icon="bell"
                  label={t("rows.push.label")}
                  body={t("rows.push.body")}
                  right={<Toggle value={pushOn} onPress={togglePush} disabled={pushBusy} />}
                  onPress={togglePush}
                />
                <RowDivider />
                <SettingsRow
                  icon="globe"
                  label={tc("language.title")}
                  body={LANGUAGES.find((l) => l.code === lang)?.label ?? ""}
                />
                <View style={{ paddingHorizontal: 16, paddingBottom: 16, marginTop: -4 }}>
                  <LanguagePicker />
                </View>
                <RowDivider />
                <SettingsRow
                  icon="moon"
                  label={tc("theme.title")}
                  body={tc("theme.note")}
                  right={<Toggle value={IS_DARK} onPress={() => void setDarkMode(!IS_DARK)} />}
                  onPress={() => void setDarkMode(!IS_DARK)}
                />
              </View>

              {/* Log out + Delete */}
              <Pressable
                onPress={onSignOutPress}
                style={{
                  marginTop: 24,
                  backgroundColor: C.field,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 999,
                  height: 52,
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
                  {t("logOut")}
                </Text>
              </Pressable>

              {/* The way in to deleting an account stays quiet: a secondary
                  pill with a red label. The solid red danger button is for
                  the confirmation step, not the entry point. */}
              <Pressable
                onPress={onDeleteAccount}
                style={{
                  marginTop: 12,
                  backgroundColor: C.field,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 999,
                  height: 52,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="trash-2" size={16} color={C.error} />
                <Text
                  style={{
                    fontFamily: SERIF_BOLD,
                    color: C.error,
                    fontSize: 16,
                    marginLeft: 8,
                  }}
                >
                  {t("deleteAccount")}
                </Text>
              </Pressable>

              <Text
                style={{
                  fontFamily: SERIF,
                  marginTop: 16,
                  textAlign: "center",
                  color: INK_DIM,
                  fontSize: 13,
                  lineHeight: 19,
                  paddingHorizontal: 12,
                }}
              >
                {t("deleteNote")}
              </Text>
            </ScrollView>
          ) : (
            // Inline "Change password" form — back chevron returns to
            // the main settings view, save updates the auth user.
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
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
                  {t("password.title")}
                </Text>
                <View style={{ width: 32 }} />
              </View>
              <Text
                style={{
                  fontFamily: SERIF,
                  marginTop: 16,
                  color: INK_DIM,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {t("password.subtitle")}
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
                {t("password.new")}
              </Text>
              <TextInput
                secureTextEntry
                value={newPwd}
                onChangeText={setNewPwd}
                placeholder="••••••••"
                placeholderTextColor={PLACEHOLDER}
                style={{ fontFamily: SERIF,
                  marginTop: 6,
                  backgroundColor: CARD,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: BORDER,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  color: INK,
                  fontSize: 16,
                }}
              />

              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  marginTop: 20,
                  color: INK_DIM,
                  fontSize: 11,
                  letterSpacing: 1,
                }}
              >
                {t("password.confirm")}
              </Text>
              <TextInput
                secureTextEntry
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                placeholder="••••••••"
                placeholderTextColor={PLACEHOLDER}
                style={{ fontFamily: SERIF,
                  marginTop: 6,
                  backgroundColor: CARD,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: BORDER,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  color: INK,
                  fontSize: 16,
                }}
              />

              <Pressable
                onPress={changePassword}
                disabled={pwdSubmitting || newPwd.length < 8 || newPwd !== confirmPwd}
                style={{
                  marginTop: 24,
                  backgroundColor:
                    pwdSubmitting || newPwd.length < 8 || newPwd !== confirmPwd
                      ? GOLD_MUTED
                      : GOLD,
                  borderRadius: 999,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ fontFamily: SERIF_BOLD, color: C.onGold, fontSize: 15}}
                >
                  {pwdSubmitting ? t("password.saving") : t("password.save")}
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
        paddingHorizontal: 16,
        paddingVertical: 16,
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
        backgroundColor: value ? C.selected : IS_DARK ? "rgba(255,255,255,0.2)" : "#d6d1c6",
        padding: 3,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          // White knob; on the cream "on" track in dark it turns ink.
          backgroundColor: value ? C.onSelected : "#ffffff",
          transform: [{ translateX: value ? 20 : 0 }],
        }}
      />
    </Pressable>
  );
}
