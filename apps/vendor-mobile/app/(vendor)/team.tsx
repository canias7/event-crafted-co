// Meet the Team — optional team-member profiles for the vendor brand,
// per the reference mock. Reached from More; entirely optional: a
// master "show on my profile" toggle (profiles.show_team), member
// cards with reorder + edit, and an add/edit form (photo, name, role,
// bio, specialty, years, fun fact, link, per-member visibility).
// Members render on the public vendor pages when the toggle is on.
//
// Data: public.vendor_team_profiles (account-level, user_id keyed).
// Photos upload to the vendor-posts bucket ({user_id}/team-*.jpg).

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { compressForUpload } from "@/lib/imageManipulation";
import { Field, Input, useBrandDialog } from "@/components/listing/WizardKit";

const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const SURFACE = "#ece7db";
const BORDER = "#e6e1d5";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const GOLD = "#c9a86a";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

interface TeamMember {
  id: string;
  full_name: string;
  role_title: string;
  bio: string | null;
  specialty: string | null;
  years_with_business: string | null;
  fun_fact: string | null;
  link_url: string | null;
  photo_url: string | null;
  display_order: number;
  visible: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TeamScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const dialog = useBrandDialog();

  const [loading, setLoading] = useState(true);
  const [showTeam, setShowTeam] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [{ data: prof }, { data: rows }] = await Promise.all([
      supabase.from("profiles").select("show_team").eq("id", user.id).maybeSingle(),
      supabase
        .from("vendor_team_profiles")
        .select(
          "id, full_name, role_title, bio, specialty, years_with_business, fun_fact, link_url, photo_url, display_order, visible",
        )
        .eq("user_id", user.id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    setShowTeam(
      ((prof as { show_team?: boolean } | null)?.show_team ?? true) !== false,
    );
    setMembers((rows ?? []) as TeamMember[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleShow(next: boolean) {
    setShowTeam(next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("profiles")
      .update({ show_team: next })
      .eq("id", user?.id ?? "");
  }

  // Swap with the neighbor — up/down arrows instead of drag (simpler,
  // and just as effective for the handful of members a brand has).
  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= members.length) return;
    const next = [...members];
    [next[index], next[j]] = [next[j], next[index]];
    const reindexed = next.map((m, i) => ({ ...m, display_order: i }));
    setMembers(reindexed);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Promise.all(
      reindexed.map((m) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_team_profiles")
          .update({ display_order: m.display_order })
          .eq("id", m.id),
      ),
    );
  }

  function confirmRemove(m: TeamMember) {
    dialog.show({
      icon: "trash-2",
      title: `Remove ${m.full_name.split(" ")[0]}?`,
      message: "They come off your public profile right away.",
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: async () => {
        setMembers((cur) => cur.filter((x) => x.id !== m.id));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("vendor_team_profiles").delete().eq("id", m.id);
      },
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Feather name="chevron-left" size={26} color={INK} />
          </Pressable>
          <Text
            style={{
              fontFamily: SERIF_BOLD,
              fontSize: 22,
              color: INK,
            }}
          >
            Meet the Team
          </Text>
          <View style={{ width: 26 }} />
        </View>
        <Text style={{ fontFamily: SERIF, marginTop: 10, fontSize: 13.5, lineHeight: 19, color: INK_DIM }}>
          Introduce the people behind your business. This will appear on your
          public profile — it&rsquo;s completely optional.
        </Text>

        {/* Master toggle */}
        <View
          style={{
            marginTop: 18,
            backgroundColor: CARD,
            borderWidth: 1,
            borderColor: BORDER,
            borderRadius: 18,
            paddingHorizontal: 16,
            paddingVertical: 14,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Text style={{ fontFamily: SERIF_BOLD, flex: 1, fontSize: 15, color: INK }}>
            Show &ldquo;Meet the Team&rdquo; on my profile
          </Text>
          <Switch
            value={showTeam}
            onValueChange={toggleShow}
            trackColor={{ false: "#d6d1c6", true: INK }}
            thumbColor="#ffffff"
          />
        </View>

        {/* Members */}
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={INK} />
          </View>
        ) : (
          <View style={{ marginTop: 16, gap: 10 }}>
            {members.map((m, i) => (
              <View
                key={m.id}
                style={{
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  opacity: m.visible ? 1 : 0.55,
                }}
              >
                <MemberAvatar member={m} size={46} />
                <Pressable
                  onPress={() => {
                    setEditing(m);
                    setFormOpen(true);
                  }}
                  style={{ flex: 1, marginLeft: 12 }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: SERIF_BOLD, fontSize: 16.5, color: INK }}
                  >
                    {m.full_name}
                    {!m.visible ? (
                      <Text style={{ fontFamily: SERIF, fontSize: 12, color: INK_DIM }}>  · hidden</Text>
                    ) : null}
                  </Text>
                  <Text numberOfLines={1} style={{ fontFamily: SERIF, marginTop: 1, fontSize: 13, color: INK_DIM }}>
                    {m.role_title}
                  </Text>
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <RowIcon
                    icon="chevron-up"
                    disabled={i === 0}
                    onPress={() => move(i, -1)}
                  />
                  <RowIcon
                    icon="chevron-down"
                    disabled={i === members.length - 1}
                    onPress={() => move(i, 1)}
                  />
                  <RowIcon icon="trash-2" color="#c0392b" onPress={() => confirmRemove(m)} />
                </View>
              </View>
            ))}

            {/* Add */}
            <Pressable
              onPress={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              style={{
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: GOLD,
                backgroundColor: "rgba(201,168,106,0.10)",
                borderRadius: 18,
                paddingVertical: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Feather name="plus" size={17} color={INK} />
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }}>
                Add team member
              </Text>
            </Pressable>

            {members.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <MaterialCommunityIcons name="account-group-outline" size={52} color="#d9c9a6" />
                <Text style={{ fontFamily: SERIF, marginTop: 10, fontSize: 14, color: INK_DIM, textAlign: "center" }}>
                  The people behind the details — add your first team member.
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {formOpen ? (
        <MemberForm
          userId={user?.id ?? ""}
          member={editing}
          nextOrder={members.length}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
          }}
        />
      ) : null}
      {dialog.element}
    </SafeAreaView>
  );
}

function MemberAvatar({ member, size }: { member: TeamMember; size: number }) {
  if (member.photo_url) {
    return (
      <Image
        source={{ uri: member.photo_url }}
        style={{ width: size, height: size, borderRadius: 999, backgroundColor: SURFACE }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: SURFACE,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: size * 0.34, color: INK }}>
        {initials(member.full_name)}
      </Text>
    </View>
  );
}

function RowIcon({
  icon,
  onPress,
  disabled,
  color = INK,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.25 : 1,
      }}
    >
      <Feather name={icon} size={16} color={color} />
    </Pressable>
  );
}

// Add / edit form — full-screen sheet per the mock.
function MemberForm({
  userId,
  member,
  nextOrder,
  onClose,
  onSaved,
}: {
  userId: string;
  member: TeamMember | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useBrandDialog();
  const [name, setName] = useState(member?.full_name ?? "");
  const [role, setRole] = useState(member?.role_title ?? "");
  const [bio, setBio] = useState(member?.bio ?? "");
  const [specialty, setSpecialty] = useState(member?.specialty ?? "");
  const [years, setYears] = useState(member?.years_with_business ?? "");
  const [funFact, setFunFact] = useState(member?.fun_fact ?? "");
  const [link, setLink] = useState(member?.link_url ?? "");
  const [visible, setVisible] = useState(member?.visible ?? true);
  const [photoUrl, setPhotoUrl] = useState(member?.photo_url ?? null);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pickedAsset, setPickedAsset] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      dialog.show({
        icon: "image",
        title: "Library access needed",
        message: "Enable photo access in Settings to add a photo.",
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || result.assets.length === 0) return;
    setPickedAsset(result.assets[0]);
    setPickedUri(result.assets[0].uri);
  }

  async function save() {
    if (saving) return;
    if (!name.trim() || !role.trim() || !bio.trim()) {
      dialog.show({
        icon: "list",
        title: "Almost there",
        message: "Name, role, and a short bio are required.",
      });
      return;
    }
    setSaving(true);
    try {
      let finalPhoto = photoUrl;
      if (pickedAsset) {
        const { uri, mime } = await compressForUpload(pickedAsset);
        const bytes = await (await fetch(uri)).arrayBuffer();
        if (bytes.byteLength > 0) {
          const path = `${userId}/team-${Date.now()}.jpg`;
          const up = await supabase.storage
            .from("vendor-posts")
            .upload(path, bytes, { contentType: mime, upsert: false });
          if (!up.error) {
            finalPhoto = supabase.storage.from("vendor-posts").getPublicUrl(path).data.publicUrl;
          }
        }
      }
      const payload = {
        full_name: name.trim(),
        role_title: role.trim(),
        bio: bio.trim() || null,
        specialty: specialty.trim() || null,
        years_with_business: years.trim() || null,
        fun_fact: funFact.trim() || null,
        link_url: link.trim() || null,
        photo_url: finalPhoto,
        visible,
      };
      if (member) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("vendor_team_profiles")
          .update(payload)
          .eq("id", member.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("vendor_team_profiles")
          .insert({ ...payload, user_id: userId, display_order: nextOrder });
        if (error) throw error;
      }
      onSaved();
    } catch (err) {
      dialog.show({
        icon: "alert-circle",
        title: "Couldn't save",
        message: (err as { message?: string })?.message ?? "Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  const previewUri = pickedUri ?? photoUrl;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Pressable onPress={onClose} hitSlop={10}>
              <Feather name="chevron-left" size={26} color={INK} />
            </Pressable>
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 20, color: INK }}>
              {member ? "Edit team member" : "Add team member"}
            </Text>
            <View style={{ width: 26 }} />
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Photo */}
            <Pressable onPress={pickPhoto} style={{ alignItems: "center", marginTop: 8 }}>
              {previewUri ? (
                <Image
                  source={{ uri: previewUri }}
                  style={{ width: 104, height: 104, borderRadius: 999, backgroundColor: SURFACE }}
                />
              ) : (
                <View
                  style={{
                    width: 104,
                    height: 104,
                    borderRadius: 999,
                    backgroundColor: SURFACE,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="image" size={30} color={INK_DIM} />
                </View>
              )}
              <View
                style={{
                  marginTop: -20,
                  marginLeft: 76,
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: GOLD,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="plus" size={16} color={INK} />
              </View>
              <Text style={{ fontFamily: SERIF_BOLD, marginTop: 8, fontSize: 14, color: INK }}>
                {previewUri ? "Change photo" : "Add photo"}
              </Text>
              <Text style={{ fontFamily: SERIF, marginTop: 2, fontSize: 12, color: INK_DIM }}>
                JPG or PNG. Square works best.
              </Text>
            </Pressable>

            <View style={{ marginTop: 18 }}>
              <Field label="Full name" required>
                <Input value={name} onChangeText={setName} placeholder="e.g., Jessica Brown" />
              </Field>
              <Field label="Role / Title" required>
                <Input
                  value={role}
                  onChangeText={setRole}
                  placeholder="e.g., Founder & Lead Planner"
                />
              </Field>
              <Field label="Short bio" required>
                <Input
                  value={bio}
                  onChangeText={(v) => setBio(v.slice(0, 300))}
                  placeholder="Tell clients about this team member…"
                  multiline
                />
                <Text style={{ fontFamily: SERIF, marginTop: 4, alignSelf: "flex-end", fontSize: 11, color: INK_DIM }}>
                  {bio.length}/300
                </Text>
              </Field>
              <Field label="Specialty / What they do">
                <Input
                  value={specialty}
                  onChangeText={setSpecialty}
                  placeholder="e.g., Day-of coordination, logistics, design"
                />
              </Field>
              <Field label="Years with the business">
                <Input value={years} onChangeText={setYears} placeholder="e.g., 5 years" />
              </Field>
              <Field label="Fun fact (optional)">
                <Input
                  value={funFact}
                  onChangeText={setFunFact}
                  placeholder="Something fun about them!"
                />
              </Field>
              <Field label="Social or website link (optional)">
                <Input
                  value={link}
                  onChangeText={setLink}
                  placeholder="e.g., instagram.com/username"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>

              <View
                style={{
                  marginTop: 6,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }}>
                  Show on public profile
                </Text>
                <Switch
                  value={visible}
                  onValueChange={setVisible}
                  trackColor={{ false: "#d6d1c6", true: INK }}
                  thumbColor="#ffffff"
                />
              </View>

              <Pressable
                onPress={save}
                disabled={saving}
                style={{
                  marginTop: 14,
                  backgroundColor: INK,
                  borderRadius: 999,
                  height: 54,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={{ fontFamily: SERIF_BOLD, color: "#ffffff", fontSize: 16}}>
                    Save team member
                  </Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        {dialog.element}
      </SafeAreaView>
    </Modal>
  );
}
