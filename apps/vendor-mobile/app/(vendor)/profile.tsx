// Profile tab — Instagram-style layout for vendors.
//
// Top bar: + (left), email (center, no chevron), ☰ (right). Avatar +
// business name + Dashboard chip stacked, then a 4-segment view
// switcher (grid · play · buzz · listing) with live counts pulled
// from public.vendor_posts / vendor_reels / vendor_buzz.
//
// Tapping Create on grid → image picker → MediaComposer → uploads to
// vendor-posts bucket and inserts vendor_posts row. Same flow for
// reels (vendor-reels bucket + vendor_reels). Buzz uses BuzzComposer
// which writes vendor_buzz directly. Listing tab links to the web
// editor; the count is 1 only once the listing has location + price.

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
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
import type { VendorProfile } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { BuzzComposer } from "@/components/BuzzComposer";
import { MediaComposer, type MediaKind } from "@/components/MediaComposer";
import { PhotoLibraryPicker } from "@/components/PhotoLibraryPicker";

type ViewKind = "grid" | "reels" | "buzz" | "listing";

interface PostRow {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
}
interface ReelRow {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  duration_seconds: number | null;
  created_at: string;
}
interface BuzzRow {
  id: string;
  body: string;
  created_at: string;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewKind>("grid");
  const [menuOpen, setMenuOpen] = useState(false);
  const [buzzOpen, setBuzzOpen] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [reelPickerOpen, setReelPickerOpen] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<
    { asset: ImagePicker.ImagePickerAsset; kind: MediaKind } | null
  >(null);

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [buzz, setBuzz] = useState<BuzzRow[]>([]);
  // Lightbox: tapping a grid tile opens a fullscreen modal with a back
  // button top-left. null when nothing is open.
  const [openMedia, setOpenMedia] = useState<
    | { kind: "post"; image_url: string; caption: string | null; created_at: string }
    | { kind: "reel"; video_url: string; caption: string | null; created_at: string }
    | null
  >(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, bio, base_price_cents, location, verified_at, application_status, application_review_notes, intro_video_url, weekly_digest_enabled, slug, instagram_handle, tiktok_handle",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setProfile(data as VendorProfile | null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadFeeds = useCallback(async () => {
    if (!profile?.id) return;
    const [postsRes, reelsRes, buzzRes] = await Promise.all([
      supabase
        .from("vendor_posts")
        .select("id, image_url, caption, created_at")
        .eq("vendor_id", profile.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("vendor_reels")
        .select(
          "id, video_url, thumbnail_url, caption, duration_seconds, created_at",
        )
        .eq("vendor_id", profile.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("vendor_buzz")
        .select("id, body, created_at")
        .eq("vendor_id", profile.id)
        .order("created_at", { ascending: false }),
    ]);
    setPosts((postsRes.data ?? []) as PostRow[]);
    setReels((reelsRes.data ?? []) as ReelRow[]);
    setBuzz((buzzRes.data ?? []) as BuzzRow[]);
  }, [profile?.id]);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  const listingsCount =
    profile &&
    profile.application_status === "approved" &&
    profile.location &&
    profile.base_price_cents != null
      ? 1
      : 0;

  function openCreatePost() {
    setPhotoPickerOpen(true);
  }

  function openCreateReel() {
    setReelPickerOpen(true);
  }

  async function pickMedia(
    src: "camera" | "library",
    kind: "Images" | "Videos",
  ) {
    const mediaTypes =
      kind === "Videos"
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.Images;
    const noun = kind === "Videos" ? "video" : "photo";
    const composerKind: MediaKind = kind === "Videos" ? "video" : "photo";

    if (src === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera access needed",
          `Enable camera access in Settings to capture a ${noun}.`,
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes,
        quality: 0.85,
        videoMaxDuration: 60,
      });
      if (!result.canceled && result.assets[0]) {
        setPendingMedia({ asset: result.assets[0], kind: composerKind });
      }
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Library access needed",
        `Enable photo library access in Settings to pick a ${noun}.`,
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingMedia({ asset: result.assets[0], kind: composerKind });
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable hitSlop={8} className="active:opacity-60">
          <Feather name="plus" size={28} color="#0a0a0a" />
        </Pressable>
        <Text
          numberOfLines={1}
          className="flex-1 px-3 text-center text-lg font-bold text-foreground"
        >
          {user?.email ?? ""}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={() => setMenuOpen(true)}
          className="active:opacity-60"
        >
          <Feather name="menu" size={28} color="#0a0a0a" />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="pb-32">
        <View className="items-center px-4 pt-2">
          <View className="h-28 w-28 overflow-hidden rounded-full bg-secondary/60">
            <Image
              source={
                profile?.logo_url
                  ? { uri: profile.logo_url }
                  : require("../../assets/icon.png")
              }
              className="h-full w-full"
              resizeMode="cover"
            />
          </View>

          {profile?.business_name ? (
            <Text className="mt-4 text-lg font-bold text-foreground">
              {profile.business_name}
            </Text>
          ) : null}
          {profile?.bio ? (
            <Text className="mt-2 px-6 text-center text-base text-foreground">
              {profile.bio}
            </Text>
          ) : null}

          <Pressable
            onPress={() => router.push("/(vendor)/dashboard")}
            className="mt-6 rounded-lg border border-border bg-secondary/40 px-6 py-2.5 active:opacity-70"
          >
            <Text className="text-base font-semibold text-foreground">
              Dashboard
            </Text>
          </Pressable>
        </View>

        {/* Generous gap between the avatar / name block and the 4-tab
            strip — leaves room for future profile chrome (bio,
            counters, follow button, etc) above the tabs. */}
        <View className="mt-14 flex-row border-t border-border">
          <ViewTab
            active={view === "grid"}
            onPress={() => setView("grid")}
            iconName="grid"
            count={posts.length}
          />
          <ViewTab
            active={view === "reels"}
            onPress={() => setView("reels")}
            iconName="play"
            count={reels.length}
          />
          <ViewTab
            active={view === "buzz"}
            onPress={() => setView("buzz")}
            iconName="align-left"
            count={buzz.length}
          />
          <ViewTab
            active={view === "listing"}
            onPress={() => setView("listing")}
            iconName="shopping-bag"
            count={listingsCount}
          />
        </View>

        <View className="mt-4 px-2">
          {view === "grid" ? (
            posts.length === 0 ? (
              <View className="items-center px-4 pt-10">
                <EmptyState
                  icon="grid"
                  title="No posts yet"
                  body="Share photos from past events to build trust with hosts."
                  ctaLabel="Create"
                  onCta={openCreatePost}
                />
              </View>
            ) : (
              <PostGrid
                posts={posts}
                onPressItem={(p) =>
                  setOpenMedia({
                    kind: "post",
                    image_url: p.image_url,
                    caption: p.caption,
                    created_at: p.created_at,
                  })
                }
              />
            )
          ) : view === "reels" ? (
            reels.length === 0 ? (
              <View className="items-center px-4 pt-10">
                <EmptyState
                  icon="play"
                  title="No reels yet"
                  body="Short videos help your listing convert."
                  ctaLabel="Create"
                  onCta={openCreateReel}
                />
              </View>
            ) : (
              <ReelGrid
                reels={reels}
                onPressItem={(r) =>
                  setOpenMedia({
                    kind: "reel",
                    video_url: r.video_url,
                    caption: r.caption,
                    created_at: r.created_at,
                  })
                }
              />
            )
          ) : view === "buzz" ? (
            buzz.length === 0 ? (
              <View className="items-center px-4 pt-10">
                <EmptyState
                  icon="align-left"
                  title="No buzz yet"
                  body="Post quick updates, behind-the-scenes notes, or news for your followers."
                  ctaLabel="Create"
                  onCta={() => setBuzzOpen(true)}
                />
              </View>
            ) : (
              <BuzzList items={buzz} />
            )
          ) : (
            <View className="items-center px-4 pt-10">
              <ListingTab
                loading={loading}
                profile={profile}
                isComplete={listingsCount === 1}
              />
            </View>
          )}
        </View>
      </ScrollView>

      <SettingsSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        email={user?.email ?? ""}
        onSignOut={signOut}
      />

      <BuzzComposer
        visible={buzzOpen}
        userId={user?.id ?? null}
        vendorId={profile?.id ?? null}
        onClose={() => setBuzzOpen(false)}
        onPosted={loadFeeds}
      />

      <MediaComposer
        visible={pendingMedia !== null}
        kind={pendingMedia?.kind ?? "photo"}
        asset={pendingMedia?.asset ?? null}
        userId={user?.id ?? null}
        vendorId={profile?.id ?? null}
        onClose={() => setPendingMedia(null)}
        onPosted={loadFeeds}
      />

      <PhotoLibraryPicker
        visible={photoPickerOpen}
        mediaType="photo"
        onClose={() => setPhotoPickerOpen(false)}
        onPicked={(picked) => {
          setPhotoPickerOpen(false);
          setPendingMedia({
            asset: {
              uri: picked.uri,
              width: picked.width ?? 0,
              height: picked.height ?? 0,
              type: "image",
              mimeType: picked.type ?? "image/jpeg",
            } as unknown as ImagePicker.ImagePickerAsset,
            kind: "photo",
          });
        }}
      />

      <PhotoLibraryPicker
        visible={reelPickerOpen}
        mediaType="video"
        onClose={() => setReelPickerOpen(false)}
        onPicked={(picked) => {
          setReelPickerOpen(false);
          setPendingMedia({
            asset: {
              uri: picked.uri,
              width: picked.width ?? 0,
              height: picked.height ?? 0,
              type: "video",
              duration: picked.duration ?? null,
              mimeType: picked.type ?? "video/mp4",
            } as unknown as ImagePicker.ImagePickerAsset,
            kind: "video",
          });
        }}
      />

      {/* Lightbox: tap a grid tile → fullscreen view of the image (or
          a play-icon placeholder for reels, since expo-av isn't wired
          up yet). Back chevron sits in the top-left over a SafeArea so
          it never collides with the notch. */}
      <Modal
        visible={openMedia !== null}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpenMedia(null)}
      >
        <SafeAreaView className="flex-1 bg-foreground" edges={["top", "bottom"]}>
          <View className="flex-row items-center justify-between px-2 py-2">
            <Pressable
              onPress={() => setOpenMedia(null)}
              hitSlop={12}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
            >
              <Feather name="chevron-left" size={28} color="#fff" />
            </Pressable>
            <View className="w-10" />
          </View>
          {/* Inset the media so it doesn't crowd the screen edges —
              feels more like a card lifted off the dark backdrop than
              an edge-to-edge takeover. */}
          <View className="flex-1 items-center justify-center px-5 py-4">
            {openMedia?.kind === "post" ? (
              <Image
                source={{ uri: openMedia.image_url }}
                style={{ width: "100%", height: "100%", borderRadius: 12 }}
                resizeMode="contain"
              />
            ) : openMedia?.kind === "reel" ? (
              <View className="items-center">
                <View className="h-24 w-24 items-center justify-center rounded-full bg-background/15">
                  <Feather name="play" size={48} color="#fff" />
                </View>
                <Pressable
                  onPress={() => Linking.openURL(openMedia.video_url)}
                  className="mt-6 rounded-full bg-background/20 px-5 py-2 active:opacity-80"
                >
                  <Text className="text-sm font-semibold text-background">
                    Open video
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {openMedia?.caption ? (
            <View className="px-5 pb-5">
              <Text className="text-base text-background">
                {openMedia.caption}
              </Text>
              <Text className="mt-2 text-xs text-background/60">
                {new Date(openMedia.created_at).toLocaleString()}
              </Text>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function ViewTab({
  active,
  onPress,
  iconName,
  count,
}: {
  active: boolean;
  onPress: () => void;
  iconName: keyof typeof Feather.glyphMap;
  count: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center justify-center py-3 active:opacity-60"
      style={{
        backgroundColor: active ? "#ffffff" : "transparent",
        borderRadius: active ? 14 : 0,
        borderWidth: active ? 1 : 0,
        borderColor: "#e5e5e5",
        marginHorizontal: active ? 4 : 0,
        marginVertical: active ? 4 : 0,
        ...(active
          ? {
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }
          : null),
      }}
    >
      <Feather name={iconName} size={22} color={active ? "#0a0a0a" : "#737373"} />
      <Text
        className="mt-1 text-sm font-semibold"
        style={{ color: active ? "#0a0a0a" : "#737373" }}
      >
        {count}
      </Text>
    </Pressable>
  );
}

function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <View className="items-center">
      <View className="h-16 w-16 items-center justify-center rounded-full border border-border">
        <Feather name={icon} size={24} color="#737373" />
      </View>
      <Text className="mt-4 text-lg font-semibold text-foreground">{title}</Text>
      <Text className="mt-1 text-center text-base text-muted-foreground">
        {body}
      </Text>
      {ctaLabel && onCta ? (
        <Pressable
          onPress={onCta}
          className="mt-5 rounded-full bg-foreground px-6 py-2.5 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-background">
            {ctaLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Square grid of post images, 3 across. Tapping a tile opens the
// fullscreen lightbox modal at the root of the screen.
function PostGrid({
  posts,
  onPressItem,
}: {
  posts: PostRow[];
  onPressItem: (p: PostRow) => void;
}) {
  return (
    <FlatList
      data={posts}
      keyExtractor={(p) => p.id}
      numColumns={3}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onPressItem(item)}
          style={{ flex: 1 / 3, aspectRatio: 1, padding: 4 }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 12,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
              backgroundColor: "#f5f5f5",
            }}
          >
            <Image
              source={{ uri: item.image_url }}
              style={{ flex: 1 }}
              resizeMode="cover"
            />
          </View>
        </Pressable>
      )}
    />
  );
}

// Same as PostGrid but with a play-icon overlay so it reads as video.
function ReelGrid({
  reels,
  onPressItem,
}: {
  reels: ReelRow[];
  onPressItem: (r: ReelRow) => void;
}) {
  return (
    <FlatList
      data={reels}
      keyExtractor={(r) => r.id}
      numColumns={3}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onPressItem(item)}
          style={{ flex: 1 / 3, aspectRatio: 1, padding: 4 }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 12,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
              backgroundColor: "#1a1a1a",
            }}
          >
            {/* Use the stored thumbnail when we have one (added by the
                MediaComposer once expo-video-thumbnails is wired up).
                Fall back to a dark tile + play icon for older reels
                that were uploaded before thumbnail generation
                existed. */}
            {item.thumbnail_url ? (
              <Image
                source={{ uri: item.thumbnail_url }}
                style={{ flex: 1 }}
                resizeMode="cover"
              />
            ) : null}
            <View
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: item.thumbnail_url
                  ? "rgba(0,0,0,0.18)"
                  : "transparent",
              }}
            >
              <Feather name="play" size={28} color="#fff" />
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

function BuzzList({ items }: { items: BuzzRow[] }) {
  return (
    <View className="gap-3 px-2">
      {items.map((b) => (
        <View
          key={b.id}
          className="rounded-xl border border-border bg-background p-4"
        >
          <Text className="text-base text-foreground">{b.body}</Text>
          <Text className="mt-2 text-xs text-muted-foreground">
            {new Date(b.created_at).toLocaleString()}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ListingTab({
  loading,
  profile,
  isComplete,
}: {
  loading: boolean;
  profile: VendorProfile | null;
  isComplete: boolean;
}) {
  if (loading) {
    return (
      <Text className="text-sm text-muted-foreground">Loading…</Text>
    );
  }
  if (!profile || !isComplete) {
    return (
      <EmptyState
        icon="shopping-bag"
        title="No listings yet"
        body="Add your location and starting price to publish your listing to the marketplace."
        ctaLabel="Create listing"
        onCta={() =>
          Linking.openURL("https://eventvendora.com/vendor/listing")
        }
      />
    );
  }
  return (
    <View className="w-full gap-3 px-2">
      <Field label="Business name" value={profile.business_name ?? "—"} />
      <Field label="Category" value={profile.category ?? "—"} />
      <Field label="Location" value={profile.location ?? "—"} />
      <Field
        label="Verification"
        value={profile.verified_at ? "Verified" : "Unverified"}
      />
      <Field
        label="Application status"
        value={profile.application_status ?? "draft"}
      />
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="rounded-xl border border-border bg-background px-4 py-3">
      <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text className="mt-1 text-base text-foreground">{value}</Text>
    </View>
  );
}

function SettingsSheet({
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
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  async function changePassword() {
    if (newPwd.length < 8) {
      Alert.alert("Password too short", "Must be at least 8 characters.");
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert("Passwords don't match", "Please re-type the new password.");
      return;
    }
    setPwdSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setPwdSubmitting(false);
    if (error) {
      Alert.alert("Couldn't change password", error.message);
      return;
    }
    setNewPwd("");
    setConfirmPwd("");
    setPwdOpen(false);
    Alert.alert("Password updated", "Your new password is active.");
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
            backgroundColor: "#fff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 32,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: "rgba(10,10,10,0.18)",
              marginBottom: 16,
            }}
          />

          <Text className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Account
          </Text>

          <View className="rounded-xl border border-border bg-background px-4 py-3">
            <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </Text>
            <Text className="mt-1 text-base text-foreground">{email || "—"}</Text>
          </View>

          {pwdOpen ? (
            <View className="mt-2 rounded-xl border border-border bg-background p-4 gap-3">
              <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Change password
              </Text>
              <TextInput
                secureTextEntry
                value={newPwd}
                onChangeText={setNewPwd}
                placeholder="New password (min 8 chars)"
                placeholderTextColor="#a3a3a3"
                className="rounded-lg border border-border px-3 py-2 text-base text-foreground"
              />
              <TextInput
                secureTextEntry
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                placeholder="Confirm new password"
                placeholderTextColor="#a3a3a3"
                className="rounded-lg border border-border px-3 py-2 text-base text-foreground"
              />
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => {
                    setPwdOpen(false);
                    setNewPwd("");
                    setConfirmPwd("");
                  }}
                  disabled={pwdSubmitting}
                  className="flex-1 rounded-lg border border-border py-2.5 active:opacity-70"
                >
                  <Text className="text-center text-sm font-medium text-foreground">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={changePassword}
                  disabled={pwdSubmitting}
                  className="flex-1 rounded-lg bg-foreground py-2.5 active:opacity-70"
                >
                  <Text className="text-center text-sm font-medium text-background">
                    {pwdSubmitting ? "Saving…" : "Save"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setPwdOpen(true)}
              className="mt-2 rounded-xl border border-border bg-background px-4 py-3 active:opacity-70"
            >
              <Text className="text-sm text-foreground">Change password</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => {
              Alert.alert("Sign out", "Are you sure?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign out",
                  style: "destructive",
                  onPress: () => {
                    onClose();
                    onSignOut();
                  },
                },
              ]);
            }}
            className="mt-6 rounded-lg border border-border bg-background py-3 active:opacity-70"
          >
            <Text className="text-center text-sm font-medium text-foreground">
              Log out
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
