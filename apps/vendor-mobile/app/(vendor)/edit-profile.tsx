// Vendor "Edit profile" screen — edits identity stored on
// public.profiles (NOT on any one vendor_profiles row). The Profile
// tab reads from the same five columns, so changes show up immediately.
//
// Fields:
//   - business_name      brand name shown on the profile chrome
//   - category           e.g. "Desserts & Cakes"
//   - location           city
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

const CREAM = "#faf5ec";
const CREAM_DEEP = "#f5efe5";
const INK = "#1a1410";
const INK_DIM = "#776c5f";
const BORDER = "#e9dfc8";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

// Canonical vendor taxonomy — must stay in lockstep with
// apps/web/src/data/categoryTaxonomy.ts. Free-text would let vendors
// type things like "Chria"/"Cakez" that never match a directory filter
// or appear on a category page; constraining to this list keeps the
// vendor discoverable.
const CATEGORY_GROUPS: { group: string; subs: string[] }[] = [
  {
    group: "Venues",
    subs: [
      "Event Venues",
      "Outdoor Spaces",
      "Private Dining Spaces",
      "Corporate / Conference Spaces",
    ],
  },
  {
    group: "Food & Beverage",
    subs: [
      "Catering",
      "Bartending / Mobile Bars",
      "Desserts & Cakes",
      "Food Trucks / Specialty",
    ],
  },
  {
    group: "Entertainment",
    subs: ["DJs", "Live Music", "Performers", "Hosts / MCs"],
  },
  {
    group: "Media",
    subs: ["Photography", "Videography", "Photo Booths"],
  },
  {
    group: "Design & Decor",
    subs: [
      "Event Coordinators",
      "Florists",
      "Beauty",
      "Decor Rentals",
      "Grooming Services",
    ],
  },
  {
    group: "Rentals",
    subs: [
      "Furniture Rentals",
      "Tents & Outdoor",
      "Lighting & AV Equipment",
      "Dance Floors & Staging",
      "Transportation",
    ],
  },
  {
    group: "Experiences",
    subs: ["Tastings", "Specialty Services"],
  },
  {
    group: "Corporate Services",
    subs: ["Staffing", "Speakers / Hosts", "Security", "Valet"],
  },
];
const ALL_CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.subs);

interface ProfileForm {
  business_name: string;
  category: string;
  location: string;
  bio: string;
  logo_url: string | null;
}

const EMPTY: ProfileForm = {
  business_name: "",
  category: "",
  location: "",
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
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("profiles")
      .select("business_name, category, location, bio, logo_url")
      .eq("id", user.id)
      .maybeSingle();
    const next: ProfileForm = {
      business_name: data?.business_name ?? "",
      category: data?.category ?? "",
      location: data?.location ?? "",
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
    initial.category !== form.category ||
    initial.location !== form.location ||
    initial.bio !== form.bio ||
    initial.logo_url !== form.logo_url;

  function set<K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

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
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (pick.canceled || !pick.assets?.[0]) return;
    const asset = pick.assets[0];
    setLogoUploading(true);
    try {
      // Read the picked file as an ArrayBuffer instead of going through
      // fetch().blob(). The blob path is unreliable on iOS for the
      // cropped image URI ImagePicker hands back when allowsEditing is
      // true — supabase-js gets a Blob with size=0 and the server
      // responds with "No content provided". ArrayBuffer reads the
      // bytes eagerly and uploads cleanly.
      const resp = await fetch(asset.uri);
      const arrayBuffer = await resp.arrayBuffer();
      // 10 MB cap on logos so we don't bloat the CDN with high-res
      // camera roll originals when we only use them small.
      if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
        Alert.alert("Photo too large", "Pick a logo under 10 MB.");
        return;
      }
      if (arrayBuffer.byteLength === 0) {
        Alert.alert(
          "Couldn't read photo",
          "The picked image came back empty. Try a different photo.",
        );
        return;
      }
      const ext = (asset.uri.split(".").pop() || "jpg")
        .toLowerCase()
        .split("?")[0]; // strip any query string the picker may append
      const path = `${user.id}/profile-logo-${Date.now()}.${ext}`;
      // MIME priority: explicit picker value → known-ext map → jpeg.
      const extMime: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        heic: "image/heic",
        heif: "image/heif",
      };
      const contentType =
        asset.mimeType || extMime[ext] || "image/jpeg";
      const { error: upErr } = await supabase.storage
        .from("vendor-posts")
        .upload(path, arrayBuffer, {
          contentType,
          upsert: false,
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("vendor-posts")
        .getPublicUrl(path);
      set("logo_url", pub.publicUrl);
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
    // Category must come from the canonical taxonomy. The picker
    // enforces this on the way in, but legacy rows could still hold
    // free-text — block save until the vendor picks one so they can
    // be discovered via the category browse / filter pages.
    if (!form.category.trim() || !ALL_CATEGORIES.includes(form.category.trim())) {
      Alert.alert(
        "Pick a category",
        "Tap the Category field and choose one of the listed categories so hosts can find you in the directory.",
      );
      return;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({
        business_name: form.business_name.trim(),
        category: form.category.trim() || null,
        location: form.location.trim() || null,
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
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 20,
              fontWeight: "700",
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
                  color: dirty ? INK : INK_DIM,
                  fontSize: 15,
                  fontWeight: "700",
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
                      <Image
                        source={{ uri: form.logo_url }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text
                        style={{
                          color: CREAM,
                          fontFamily: SERIF,
                          fontStyle: "italic",
                          fontWeight: "700",
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
                          style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}
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
                        color: INK,
                        fontSize: 14,
                        fontWeight: "700",
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
                <CategoryPickerField
                  value={form.category}
                  onPress={() => setCategoryPickerOpen(true)}
                />
                <Field
                  label="CITY"
                  value={form.location}
                  onChange={(v) => set("location", v)}
                  placeholder="Brooklyn, NY"
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

      <CategoryPickerModal
        visible={categoryPickerOpen}
        selected={form.category}
        onClose={() => setCategoryPickerOpen(false)}
        onPick={(c) => {
          set("category", c);
          setCategoryPickerOpen(false);
        }}
      />
    </View>
  );
}

function CategoryPickerField({
  value,
  onPress,
}: {
  value: string;
  onPress: () => void;
}) {
  const hasValue = value.trim().length > 0;
  return (
    <View style={{ marginTop: 18 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 1.2,
          color: INK_DIM,
        }}
      >
        CATEGORY
      </Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          marginTop: 6,
          backgroundColor: "#ffffff",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: BORDER,
          paddingHorizontal: 14,
          paddingVertical: 14,
          opacity: pressed ? 0.7 : 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        })}
      >
        <Text
          style={{
            color: hasValue ? INK : INK_DIM,
            fontSize: 16,
          }}
        >
          {hasValue ? value : "Pick a category"}
        </Text>
        <Feather name="chevron-down" size={18} color={INK_DIM} />
      </Pressable>
    </View>
  );
}

function CategoryPickerModal({
  visible,
  selected,
  onClose,
  onPick,
}: {
  visible: boolean;
  selected: string;
  onClose: () => void;
  onPick: (c: string) => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={["top"]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderColor: BORDER,
          }}
        >
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ fontSize: 16, color: INK_DIM }}>Cancel</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: "600", color: INK, fontFamily: SERIF }}
          >
            Category
          </Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {CATEGORY_GROUPS.map((g) => (
            <View key={g.group} style={{ marginTop: 18 }}>
              <Text
                style={{
                  paddingHorizontal: 18,
                  paddingBottom: 8,
                  fontSize: 12,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  color: INK_DIM,
                }}
              >
                {g.group.toUpperCase()}
              </Text>
              {g.subs.map((sub) => {
                const isSelected = sub === selected;
                return (
                  <Pressable
                    key={sub}
                    onPress={() => onPick(sub)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 18,
                      paddingVertical: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: pressed ? CREAM_DEEP : "transparent",
                      borderBottomWidth: 1,
                      borderColor: BORDER,
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        color: INK,
                        fontWeight: isSelected ? "600" : "400",
                      }}
                    >
                      {sub}
                    </Text>
                    {isSelected ? (
                      <Feather name="check" size={20} color={INK} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
          color: INK_DIM,
          fontSize: 11,
          fontWeight: "800",
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
          backgroundColor: "#ffffff",
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
