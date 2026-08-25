// Vendor "Edit profile" screen — identity fields on public.profiles.
// Category + city used to live here but they're per-listing now (the
// listing builder owns those), so the profile is just brand identity:
//
//   - business_name      brand name shown on the profile chrome
//   - bio                italic-serif paragraph under the title
//   - logo_url           rounded-square avatar
//
// Logo upload reuses the vendor-posts bucket under
// `<user_id>/profile-logo-<ts>.<ext>` so we don't need new storage
// policies. The image picker is the same expo-image-picker we use on
// the home feed composer.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { prepareLogoForUpload, type PickedAsset } from "@/lib/imageManipulation";
import { LogoCropperModal } from "@/components/LogoCropperModal";

const CREAM = "#f4f1ea";
const INK = "#14161a";
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = "#14161a";
const BORDER = "#e6e1d5";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

interface ProfileForm {
  business_name: string;
  bio: string;
  logo_url: string | null;
}

const EMPTY: ProfileForm = {
  business_name: "",
  bio: "",
  logo_url: null,
};

export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [initial, setInitial] = useState<ProfileForm>(EMPTY);
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  // Image picked but not yet confirmed — drives the preview modal.
  // Full asset (not just uri): the manipulator needs width/height.
  const [pickedLogo, setPickedLogo] = useState<PickedAsset | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("profiles")
      .select("business_name, bio, logo_url")
      .eq("id", user.id)
      .maybeSingle();
    const next: ProfileForm = {
      business_name: data?.business_name ?? "",
      bio: data?.bio ?? "",
      logo_url: data?.logo_url ?? null,
    };
    setInitial(next);
    setForm(next);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty =
    initial.business_name !== form.business_name ||
    initial.bio !== form.bio ||
    initial.logo_url !== form.logo_url;

  function set<K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  // Pick from the library WITHOUT the OS 1:1 crop, then hand the image
  // to our own cropper (LogoCropperModal) which mirrors web — zoom out
  // to fit a whole logo, with white padding. allowsEditing:false also
  // means we get the full image so the cropper has pixels to work with.
  async function pickLogo() {
    if (!user?.id || logoUploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photos access needed",
        "Enable Photos access in Settings to pick a logo.",
      );
      return;
    }
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (pick.canceled || !pick.assets?.[0]) return;
    const a = pick.assets[0];
    setPickedLogo({
      uri: a.uri,
      width: a.width,
      height: a.height,
      mimeType: a.mimeType ?? undefined,
    });
  }

  // Confirm → downscale with expo-image-manipulator (proven on this
  // binary — listing photos use the same module; view-shot capture was
  // the step that failed on device) → upload as PNG (preserves logo
  // transparency) → persist to profiles immediately. Bytes travel as
  // base64 in JS the whole way: no tmpfile, no fetch(file://).
  async function uploadLogo() {
    if (!user?.id || !pickedLogo) return;
    const asset = pickedLogo;
    setPickedLogo(null);
    setLogoUploading(true);
    try {
      const prepared = await prepareLogoForUpload(asset);
      const bytes = Uint8Array.from(atob(prepared.base64), (c) =>
        c.charCodeAt(0),
      ).buffer;
      if (bytes.byteLength === 0) {
        Alert.alert(
          "Couldn't read photo",
          "The processed image came back empty. Try again.",
        );
        return;
      }
      const path = `${user.id}/profile-logo-${Date.now()}.${prepared.ext}`;
      const { error: upErr } = await supabase.storage
        .from("vendor-posts")
        .upload(path, bytes, {
          contentType: prepared.mime,
          upsert: false,
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("vendor-posts")
        .getPublicUrl(path);
      // Persist immediately — "Use logo" means use it. Requiring another
      // tap on the header Save to actually keep the logo was a silent
      // data-loss trap (close the screen and the upload is orphaned).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: saveErr } = await (supabase as any)
        .from("profiles")
        .update({ logo_url: pub.publicUrl })
        .eq("id", user.id);
      if (saveErr) throw saveErr;
      set("logo_url", pub.publicUrl);
      // The logo is saved; only name/bio edits should mark the form dirty.
      setInitial((prev) => ({ ...prev, logo_url: pub.publicUrl }));
    } catch (e) {
      Alert.alert(
        "Couldn't update logo",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setLogoUploading(false);
    }
  }

  async function save() {
    if (!user?.id || !dirty || saving) return;
    // Business name is the headline of the profile. Saving it empty
    // would null out the row and break the auto-sync to the solo
    // listing. Force a value before we even hit the network.
    if (!form.business_name.trim()) {
      Alert.alert("Add a business name", "Your name is required.");
      return;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({
        business_name: form.business_name.trim(),
        bio: form.bio.trim() || null,
        logo_url: form.logo_url,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    router.back();
  }

  const initialChar =
    form.business_name?.trim()?.[0]?.toUpperCase() ??
    user?.email?.[0]?.toUpperCase() ??
    "V";

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={{ paddingHorizontal: 4, paddingVertical: 4 }}
          >
            <Feather name="x" size={26} color={INK} />
          </Pressable>
          <Text
            style={{
              color: INK,
              fontFamily: SERIF_BOLD,
              fontSize: 20,
            }}
          >
            Edit profile
          </Text>
          <Pressable
            onPress={save}
            disabled={!dirty || saving}
            hitSlop={8}
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          >
            {saving ? (
              <ActivityIndicator color={INK} />
            ) : (
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  color: dirty ? INK : INK_DIM,
                  fontSize: 15,
                }}
              >
                Save
              </Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 18,
              paddingTop: 6,
              paddingBottom: 80,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={{ alignItems: "center", paddingVertical: 80 }}>
                <ActivityIndicator color={INK} />
              </View>
            ) : (
              <>
                {/* Logo */}
                <View style={{ alignItems: "center", marginTop: 8 }}>
                  <Pressable
                    onPress={pickLogo}
                    disabled={logoUploading}
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: 24,
                      backgroundColor: INK,
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {form.logo_url ? (
                      // contain on white, NOT cover: logos upload at
                      // their native aspect now, and the promise is
                      // "nothing gets cropped".
                      <Image
                        source={{ uri: form.logo_url }}
                        style={{
                          width: "100%",
                          height: "100%",
                          backgroundColor: "#fbf9f4",
                        }}
                        resizeMode="contain"
                      />
                    ) : (
                      <Text
                        style={{
                          color: CREAM,
                          fontFamily: SERIF_BOLD,
                          fontSize: 66,
                          lineHeight: 74,
                        }}
                      >
                        {initialChar}
                      </Text>
                    )}
                    {logoUploading ? (
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: "rgba(0,0,0,0.45)",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{ fontFamily: SERIF_BOLD, color: "#ffffff", fontSize: 13 }}
                        >
                          Uploading…
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={pickLogo}
                    disabled={logoUploading}
                    style={{ marginTop: 12, paddingVertical: 6 }}
                  >
                    <Text
                      style={{
                        fontFamily: SERIF_BOLD,
                        color: INK,
                        fontSize: 14,
                      }}
                    >
                      Change photo
                    </Text>
                  </Pressable>
                </View>

                {/* Fields */}
                <Field
                  label="BUSINESS NAME"
                  value={form.business_name}
                  onChange={(v) => set("business_name", v)}
                  placeholder="Chris Cakes"
                />
                <Field
                  label="BIO"
                  value={form.bio}
                  onChange={(v) => set("bio", v)}
                  placeholder="One or two sentences on what makes your work worth booking."
                  multiline
                />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Logo preview/confirm — opens after a pick, replaces the OS crop. */}
      <Modal
        visible={pickedLogo !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setPickedLogo(null)}
      >
        {pickedLogo ? (
          <LogoCropperModal
            uri={pickedLogo.uri}
            onCancel={() => setPickedLogo(null)}
            onApply={uploadLogo}
          />
        ) : null}
      </Modal>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginTop: 22 }}>
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          color: INK_DIM,
          fontSize: 11,
          letterSpacing: 1,
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={INK_DIM}
        multiline={multiline}
        style={{
          marginTop: 6,
          backgroundColor: "#fbf9f4",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: BORDER,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: INK,
          fontSize: 16,
          minHeight: multiline ? 100 : undefined,
          textAlignVertical: multiline ? "top" : "auto",
        }}
      />
    </View>
  );
}
