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
// which writes vendor_buzz directly. Listing tab links to the native
// listing builder; the count is 1 only once the listing has location
// and price.

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { ResizeMode, Video } from "expo-av";
import type { VendorProfile } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { BuzzComposer } from "@/components/BuzzComposer";
import { MediaComposer, type MediaKind } from "@/components/MediaComposer";
import { PhotoLibraryPicker } from "@/components/PhotoLibraryPicker";

// Editorial palette + helpers — match the Profile redesign mockup
// (cream + ink + soft peach gradient, italic serif for personal
// details, sans for chrome).
const CREAM = "#faf5ec";
const CREAM_DEEP = "#f5efe5";
const INK = "#1a1410";
const INK_DIM = "#776c5f";
const GREEN_OK = "#3a7d4a";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

function categoryIcon(cat: string | null): keyof typeof Feather.glyphMap {
  if (!cat) return "circle";
  const c = cat.toLowerCase();
  if (/catering|cake|dessert|food|coffee|bake/.test(c)) return "coffee";
  if (/music|dj|band|sound/.test(c)) return "music";
  if (/photo|video|film/.test(c)) return "camera";
  if (/floral|florist|flower/.test(c)) return "feather";
  if (/venue|space|loft/.test(c)) return "home";
  if (/plan|coord/.test(c)) return "clipboard";
  return "circle";
}

function joinedLabel(createdAt: string | null): string {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Joined today";
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days < 7) return `Joined ${days}d ago`;
  if (days < 30) return `Joined ${Math.floor(days / 7)}w ago`;
  if (days < 365) {
    return `Joined ${d.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
  }
  return `Joined ${d.toLocaleDateString(undefined, { year: "numeric" })}`;
}

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
  const [profileCreatedAt, setProfileCreatedAt] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    bookings: number;
    reviews: number;
    rating: number | null;
  }>({ bookings: 0, reviews: 0, rating: null });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewKind>("grid");
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [buzzOpen, setBuzzOpen] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [reelPickerOpen, setReelPickerOpen] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<
    { asset: ImagePicker.ImagePickerAsset; kind: MediaKind } | null
  >(null);

  // All vendor_profiles rows this user owns. profile = the first/
  // primary one (used for top-of-profile identity — logo, name, stats).
  // listings = the full set, rendered as separate cards on the
  // "Listing" tab so the vendor can manage multiple.
  const [listings, setListings] = useState<VendorProfile[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);  const [reels, setReels] = useState<ReelRow[]>([]);
  const [buzz, setBuzz] = useState<BuzzRow[]>([]);
  // Lightbox: tapping a grid tile opens a fullscreen modal with a back
  // button top-left. null when nothing is open.
  const [openMedia, setOpenMedia] = useState<
    | { kind: "post"; image_url: string; caption: string | null; created_at: string }
    | { kind: "reel"; video_url: string; caption: string | null; created_at: string }
    | null
  >(null);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("vendor_profiles")
      .select(
        "id, business_name, category, bio, base_price_cents, location, verified_at, application_status, application_review_notes, intro_video_url, weekly_digest_enabled, slug, instagram_handle, tiktok_handle, logo_url, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];
    setListings(rows as VendorProfile[]);
    const primary = rows[0] ?? null;
    setProfile(primary);
    setProfileCreatedAt(primary?.created_at ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Stats card: bookings = won inquiries across all the user's
  // listings; reviews + rating = aggregate of public reviews on those
  // listings. Single round-trip per side. Falls back to "—" / "0" when
  // there's no data yet (matches the mockup's empty-state numerals).
  useEffect(() => {
    if (listings.length === 0) {
      setStats({ bookings: 0, reviews: 0, rating: null });
      return;
    }
    const vendorIds = listings.map((l) => l.id);
    let cancelled = false;
    (async () => {
      const [{ count: bookings }, { data: reviewRows }] = await Promise.all([
        supabase
          .from("inquiries")
          .select("id", { count: "exact", head: true })
          .in("vendor_id", vendorIds)
          .eq("status", "won"),
        supabase
          .from("reviews")
          .select("rating")
          .in("vendor_id", vendorIds),
      ]);
      if (cancelled) return;
      const rs = (reviewRows ?? []) as { rating: number | null }[];
      const ratings = rs
        .map((r) => r.rating)
        .filter((r): r is number => typeof r === "number");
      const avg =
        ratings.length === 0
          ? null
          : Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 10) / 10;
      setStats({
        bookings: bookings ?? 0,
        reviews: rs.length,
        rating: avg,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [listings]);

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

  // Count of *publishable* listings — used by the Profile stat row.
  // A listing counts once it has the bare minimum to live in the
  // marketplace (approved status + location + starting price).
  const listingsCount = listings.filter(
    (l) =>
      l.application_status === "approved" &&
      l.location &&
      l.base_price_cents != null,
  ).length;

  // Share the vendor's public listing URL — uses slug when available
  // so the receiver lands on the SEO-friendly path.
  async function shareProfile() {
    if (!profile) return;
    const slugOrId = profile.slug ?? profile.id;
    const url = `https://eventvendora.com/vendors/${slugOrId}`;
    await Share.share({
      message: `${profile.business_name ?? "Check out my listing"} on Vendora — ${url}`,
      url,
    }).catch(() => {});
  }

  // Edit profile → jump straight into the listing builder for the
  // primary listing. Vendors with multiple listings still pick which
  // one to edit on the Listing tab; this button is the fast path for
  // the most common case (one listing).
  function openEditListing() {
    if (!profile?.id) return;
    router.push(`/(vendor)/listing?id=${profile.id}` as never);
  }

  // Insert a fresh draft and jump to its editor. Used by the "+
  // Listing" row in CreateSheet so vendors can create additional
  // marketplace listings without being blocked by the existing one.
  async function createNewListing() {
    if (!user?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_profiles")
      .insert({ user_id: user.id, application_status: "draft" })
      .select("id")
      .single();
    if (error || !data?.id) {
      Alert.alert("Couldn't create listing", error?.message ?? "Unknown error");
      return;
    }
    await loadProfile();
    router.push(`/(vendor)/listing?id=${data.id}` as never);
  }

  function openCreatePost() {
    setPhotoPickerOpen(true);
  }

  function openCreateReel() {
    setReelPickerOpen(true);
  }

  // Tap the avatar → photo picker → upload to vendor-posts/<userId>/
  // logo-<ts>.<ext> → persist URL to vendor_profiles.logo_url. Reuses
  // the existing vendor-posts bucket (owner-folder RLS already in
  // place) so no new storage rules needed. Mirrors what the web
  // Profile page does on logo click.
  const [logoUploading, setLogoUploading] = useState(false);
  async function changeLogo() {
    if (!profile?.id || logoUploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Library access needed",
        "Enable photo library access in Settings to pick a logo.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setLogoUploading(true);
    try {
      const ext = (asset.uri.split(".").pop() ?? "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const path = `${user?.id}/logo-${Date.now()}.${ext}`;
      // RN's fetch().blob() returns an empty payload for local file://
      // URIs on iOS, which makes Supabase Storage reject the upload
      // with "No content provided". arrayBuffer() reliably reads the
      // underlying bytes, which we wrap as a Uint8Array — the
      // supabase-js storage client accepts that directly.
      const arrayBuffer = await (await fetch(asset.uri)).arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      if (bytes.byteLength === 0) {
        throw new Error("Couldn't read the picked photo. Try a different image.");
      }
      const up = await supabase.storage
        .from("vendor-posts")
        .upload(path, bytes, {
          contentType: asset.mimeType ?? "image/jpeg",
          upsert: false,
        });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage
        .from("vendor-posts")
        .getPublicUrl(path);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("vendor_profiles")
        .update({ logo_url: pub.publicUrl })
        .eq("id", profile.id);
      if (error) throw error;
      setProfile({ ...profile, logo_url: pub.publicUrl });
    } catch (err) {
      Alert.alert(
        "Couldn't update logo",
        (err as { message?: string })?.message ?? "Try again in a moment.",
      );
    } finally {
      setLogoUploading(false);
    }
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

  const businessInitial =
    profile?.business_name?.trim()?.[0]?.toUpperCase() ??
    user?.email?.[0]?.toUpperCase() ??
    "V";

  return (
    <View className="flex-1" style={{ backgroundColor: CREAM }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero banner — warm peach plate. Three layered tints fake a
            soft gradient without adding expo-linear-gradient (native
            dep would block OTA). */}
        <View style={{ height: 220, backgroundColor: "#f0d4ba" }}>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#d9c0a4",
              opacity: 0.45,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 110,
              backgroundColor: "#f3dcc2",
              opacity: 0.7,
            }}
          />
          <SafeAreaView edges={["top"]}>
            {/* Top row: +  email pill  ☰ */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingTop: 6,
              }}
            >
              <Pressable
                hitSlop={8}
                onPress={() => setCreateOpen(true)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  backgroundColor: CREAM_DEEP,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="plus" size={20} color={INK} />
              </Pressable>

              <View
                style={{
                  flex: 1,
                  marginHorizontal: 10,
                  backgroundColor: CREAM_DEEP,
                  borderRadius: 999,
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  alignItems: "center",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: INK,
                    fontSize: 14,
                    fontWeight: "500",
                  }}
                >
                  {user?.email ?? ""}
                </Text>
              </View>

              <Pressable
                hitSlop={8}
                onPress={() => setMenuOpen(true)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  backgroundColor: CREAM_DEEP,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="menu" size={20} color={INK} />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>

        {/* Avatar + actions row — avatar pulled up to overlap banner */}
        <View
          style={{
            paddingHorizontal: 18,
            marginTop: -56,
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <Pressable
            onPress={changeLogo}
            disabled={logoUploading || !profile?.id}
            style={{
              width: 116,
              height: 116,
              borderRadius: 24,
              backgroundColor: INK,
              borderWidth: 5,
              borderColor: CREAM,
              alignItems: "center",
              justifyContent: "center",
              overflow: "visible",
            }}
          >
            {profile?.logo_url ? (
              <Image
                source={{ uri: profile.logo_url }}
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 19,
                }}
                resizeMode="cover"
              />
            ) : (
              <Text
                style={{
                  color: CREAM,
                  fontFamily: SERIF,
                  fontStyle: "italic",
                  fontWeight: "700",
                  fontSize: 64,
                  lineHeight: 72,
                }}
              >
                {businessInitial}
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
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(0,0,0,0.4)",
                  borderRadius: 19,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
                  Uploading…
                </Text>
              </View>
            ) : null}
            {profile?.verified_at ? (
              <View
                style={{
                  position: "absolute",
                  right: -2,
                  bottom: -2,
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: GREEN_OK,
                  borderWidth: 3,
                  borderColor: CREAM,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="check" size={14} color="#fff" />
              </View>
            ) : null}
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Pressable
              onPress={shareProfile}
              hitSlop={8}
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                backgroundColor: CREAM_DEEP,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 10,
              }}
            >
              <Feather name="share" size={18} color={INK} />
            </Pressable>
            <Pressable
              onPress={openEditListing}
              style={{
                backgroundColor: INK,
                borderRadius: 999,
                paddingHorizontal: 18,
                paddingVertical: 12,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Feather name="edit-2" size={14} color={CREAM} />
              <Text
                style={{
                  color: CREAM,
                  fontSize: 14,
                  fontWeight: "600",
                  marginLeft: 6,
                }}
              >
                Edit profile
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Identity */}
        <View style={{ paddingHorizontal: 18, marginTop: 16 }}>
          <Text
            style={{
              color: INK,
              fontFamily: SERIF,
              fontWeight: "700",
              fontSize: 36,
              lineHeight: 40,
              letterSpacing: -0.5,
            }}
            numberOfLines={2}
          >
            {profile?.business_name ?? "Your business"}
          </Text>
          {profile?.category || profile?.location || profileCreatedAt ? (
            <View
              style={{
                marginTop: 8,
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {profile?.category ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Feather
                    name={categoryIcon(profile.category)}
                    size={13}
                    color={INK_DIM}
                  />
                  <Text style={{ color: INK_DIM, fontSize: 14, marginLeft: 5 }}>
                    {profile.category}
                  </Text>
                </View>
              ) : null}
              {profile?.location ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: INK_DIM, fontSize: 14, marginHorizontal: 8 }}>
                    ·
                  </Text>
                  <Feather name="map-pin" size={13} color={INK_DIM} />
                  <Text style={{ color: INK_DIM, fontSize: 14, marginLeft: 5 }}>
                    {profile.location}
                  </Text>
                </View>
              ) : null}
              {profileCreatedAt ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: INK_DIM, fontSize: 14, marginHorizontal: 8 }}>
                    ·
                  </Text>
                  <Text style={{ color: INK_DIM, fontSize: 14 }}>
                    {joinedLabel(profileCreatedAt)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Bio — italic serif. Placeholder copy with subtle highlight
            on "one or two sentences" when the vendor hasn't written
            one yet (invites them to fill it in via Edit profile). */}
        <View style={{ paddingHorizontal: 18, marginTop: 18 }}>
          {profile?.bio?.trim() ? (
            <Text
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                color: INK,
                fontSize: 17,
                lineHeight: 24,
              }}
            >
              {profile.bio}
            </Text>
          ) : (
            <Text
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                color: INK,
                fontSize: 17,
                lineHeight: 24,
              }}
            >
              A short bio belongs here —{" "}
              <Text
                style={{
                  backgroundColor: "#f5e2c9",
                  fontWeight: "700",
                }}
              >
                {" one or two sentences "}
              </Text>{" "}
              on what makes your work worth booking.
            </Text>
          )}
        </View>

        {/* Stats card */}
        <View
          style={{
            marginHorizontal: 18,
            marginTop: 22,
            paddingVertical: 16,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: "#e9dfc8",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <StatCell value={String(stats.bookings)} label="BOOKINGS" />
          <View
            style={{
              width: 1,
              alignSelf: "stretch",
              backgroundColor: "#e9dfc8",
            }}
          />
          <StatCell
            value={stats.rating != null ? stats.rating.toFixed(1) : "—"}
            label="RATING"
          />
          <View
            style={{
              width: 1,
              alignSelf: "stretch",
              backgroundColor: "#e9dfc8",
            }}
          />
          <StatCell value={String(stats.reviews)} label="REVIEWS" />
        </View>

        {/* Tabs — chip-pill row */}
        <View
          style={{
            marginTop: 22,
            paddingHorizontal: 18,
            flexDirection: "row",
            gap: 8,
          }}
        >
          <ViewTab
            active={view === "grid"}
            onPress={() => setView("grid")}
            label="Posts"
            count={posts.length}
          />
          <ViewTab
            active={view === "reels"}
            onPress={() => setView("reels")}
            label="Reels"
            count={reels.length}
          />
          <ViewTab
            active={view === "buzz"}
            onPress={() => setView("buzz")}
            label="Buzz"
            count={buzz.length}
          />
          <ViewTab
            active={view === "listing"}
            onPress={() => setView("listing")}
            label="Listings"
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
                listings={listings}
                onEdit={(id) =>
                  router.push(`/(vendor)/listing?id=${id}` as never)
                }
                onCreateNew={createNewListing}
                onChanged={loadProfile}
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

      <CreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onPost={() => {
          setCreateOpen(false);
          openCreatePost();
        }}
        onReel={() => {
          setCreateOpen(false);
          openCreateReel();
        }}
        onBuzz={() => {
          setCreateOpen(false);
          setBuzzOpen(true);
        }}
        onListing={() => {
          setCreateOpen(false);
          createNewListing();
        }}
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
              <Video
                source={{ uri: openMedia.video_url }}
                style={{ width: "100%", height: "100%", borderRadius: 12 }}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay
                isLooping
              />
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
    </View>
  );
}

// Chip-pill tab. Active state = cream-deep capsule with INK label +
// count; inactive = transparent with muted ink.
function ViewTab({
  active,
  onPress,
  label,
  count,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  count: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: active ? CREAM_DEEP : "transparent",
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: active ? INK : INK_DIM,
          fontSize: 15,
          fontWeight: active ? "700" : "500",
          marginRight: 6,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: active ? INK_DIM : INK_DIM,
          fontSize: 14,
          fontWeight: "500",
        }}
      >
        {count}
      </Text>
    </Pressable>
  );
}

// Single stat (Bookings / Rating / Reviews). Large italic-serif numeral
// over a tracked uppercase label. Used in the stats row above the
// tab pills.
function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 2 }}>
      <Text
        style={{
          color: INK,
          fontFamily: SERIF,
          fontWeight: "700",
          fontSize: 26,
          lineHeight: 30,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          marginTop: 4,
          color: INK_DIM,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.4,
        }}
      >
        {label}
      </Text>
    </View>
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

// Renders every vendor_profiles row this user owns as its own card.
// Each card has three flavors keyed off application_status:
//   - approved (+ has location + base price) → "Live" card, tappable
//   - pending                                → dimmed "Under review"
//   - draft / rejected / anything else       → "Draft" card with CTA
// An "Add another listing" tile sits at the end so the vendor can
// spin up a second / third / nth listing without leaving the tab.
function ListingTab({
  loading,
  listings,
  onEdit,
  onCreateNew,
  onChanged,
}: {
  loading: boolean;
  listings: VendorProfile[];
  onEdit: (id: string) => void;
  onCreateNew: () => void;
  onChanged: () => void;
}) {
  if (loading) {
    return <Text className="text-sm text-muted-foreground">Loading…</Text>;
  }
  if (listings.length === 0) {
    return (
      <EmptyState
        icon="shopping-bag"
        title="No listings yet"
        body="Add your location and starting price to publish your listing to the marketplace."
        ctaLabel="Create listing"
        onCta={onCreateNew}
      />
    );
  }
  return (
    <View className="w-full px-4" style={{ gap: 18 }}>
      {listings.map((l) => (
        <ListingCard
          key={l.id}
          listing={l}
          onEdit={() => onEdit(l.id)}
          onChanged={onChanged}
        />
      ))}
      <Pressable onPress={onCreateNew}>
        {({ pressed }) => (
          <View
            style={{
              marginTop: 4,
              paddingVertical: 18,
              borderRadius: 18,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "#dcd1c1",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              opacity: pressed ? 0.7 : 1,
            }}
          >
            <Feather name="plus" size={16} color="#1a1410" />
            <Text className="ml-2 text-sm font-semibold text-foreground">
              Add another listing
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function ListingCard({
  listing,
  onEdit,
  onChanged,
}: {
  listing: VendorProfile;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isComplete =
    listing.application_status === "approved" &&
    !!listing.location &&
    listing.base_price_cents != null;
  const isPending = listing.application_status === "pending";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("vendor_portfolio_images")
        .select("storage_path")
        .eq("vendor_id", listing.id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1);
      if (cancelled) return;
      const row = (data ?? [])[0] as { storage_path: string } | undefined;
      if (!row) {
        setHeroUrl(null);
        return;
      }
      const { data: pub } = supabase.storage
        .from("vendor-portfolios")
        .getPublicUrl(row.storage_path);
      setHeroUrl(pub.publicUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [listing.id]);

  async function unpublish() {
    Alert.alert(
      "Remove from marketplace?",
      "Your listing leaves the marketplace but your photos, packages, and other data stay. You can re-publish anytime.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
              .from("vendor_profiles")
              .update({ application_status: "draft" })
              .eq("id", listing.id);
            setBusy(false);
            if (error) {
              Alert.alert("Couldn't remove listing", error.message);
            } else {
              onChanged();
            }
          },
        },
      ],
    );
  }

  async function destroy() {
    Alert.alert(
      "Delete this listing?",
      "All photos, packages, FAQs, and inquiries tied to this listing will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc(
              "delete_my_vendor_profile",
              { p_vendor_id: listing.id },
            );
            setBusy(false);
            if (error) {
              Alert.alert("Couldn't delete listing", error.message);
            } else {
              onChanged();
            }
          },
        },
      ],
    );
  }

  // Draft / rejected card — full-width row with status pill + CTA
  if (!isComplete && !isPending) {
    return (
      <Pressable onPress={onEdit}>
        {({ pressed }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#ffffff",
              borderRadius: 18,
              padding: 14,
              opacity: pressed ? 0.85 : 1,
              shadowColor: "#1a1410",
              shadowOpacity: 0.04,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 1,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: "#f5efe5",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="shopping-bag" size={22} color="#1a1410" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                className="text-base font-semibold text-foreground"
                numberOfLines={1}
              >
                {listing.business_name ?? "Untitled listing"}
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {listing.application_status === "rejected"
                  ? "Rejected — tap to revise"
                  : "Draft — tap to finish setup"}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="#776c5f" />
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onEdit}
      className="active:opacity-90"
      style={{ width: Math.round(Dimensions.get("window").width * 0.4) }}
    >
      <View
        style={{
          borderRadius: 18,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
          aspectRatio: 1,
          width: "100%",
        }}
      >
        {heroUrl ? (
          <Image
            source={{ uri: heroUrl }}
            style={{ flex: 1, opacity: isPending ? 0.35 : 1 }}
            resizeMode="cover"
            blurRadius={isPending ? 8 : 0}
          />
        ) : (
          <View
            className="flex-1 items-center justify-center px-6"
            style={{ backgroundColor: "#f4f4f5" }}
          >
            <Feather name="image" size={28} color="#a1a1aa" />
            <Text className="mt-2 text-center text-xs text-muted-foreground">
              No listing photos yet
            </Text>
          </View>
        )}
        {isPending ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.4)",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
            }}
          >
            <Feather name="clock" size={28} color="#fff" />
            <Text className="mt-2 text-center text-xs font-semibold text-white">
              Under review
            </Text>
          </View>
        ) : (
          <View
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              flexDirection: "row",
              gap: 8,
            }}
          >
            <Pressable
              onPress={onEdit}
              hitSlop={6}
              disabled={busy}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.92)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="edit-2" size={16} color="#1a1410" />
            </Pressable>
            <Pressable
              onPress={unpublish}
              hitSlop={6}
              disabled={busy}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.92)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="eye-off" size={16} color="#1a1410" />
            </Pressable>
            <Pressable
              onPress={destroy}
              hitSlop={6}
              disabled={busy}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.92)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="trash-2" size={16} color="#dc2626" />
            </Pressable>
          </View>
        )}
      </View>
      <View className="mt-3 px-1">
        <Text
          numberOfLines={1}
          className={
            isPending
              ? "text-base font-semibold text-foreground/70"
              : "text-base font-semibold text-foreground"
          }
        >
          {listing.business_name ?? "Vendor"}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-0.5 text-sm text-muted-foreground"
        >
          {listing.category ?? "—"}
          {listing.location ? ` · ${listing.location}` : ""}
        </Text>
        {listing.base_price_cents != null ? (
          <Text className="mt-1 text-sm text-foreground/80">
            From ${Math.round(listing.base_price_cents / 100).toLocaleString()}
          </Text>
        ) : null}
        {isPending ? (
          <View className="mt-3 self-start rounded-full bg-amber-100 px-3 py-1">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              In review
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}


// Bottom-sheet style menu opened by the "+" button. The "Listing"
// row is always present now — vendors can run multiple marketplace
// listings off a single account, and CreateSheet's job is to give
// them every "new content" surface, including a new listing.
function CreateSheet({
  open,
  onClose,
  onPost,
  onReel,
  onBuzz,
  onListing,
}: {
  open: boolean;
  onClose: () => void;
  onPost: () => void;
  onReel: () => void;
  onBuzz: () => void;
  onListing: () => void;
}) {
  // Dark editorial sheet — black canvas with cream serif numerals on
  // each row, a tan "EARN" badge on the Listing entry to signal that
  // a marketplace listing is the money path, and a faint divider
  // between rows so it reads like a numbered table of contents.
  type CreateOption = {
    serial: string;
    label: string;
    sub: string;
    badge?: string;
    onPress: () => void;
  };
  const SHEET_BG = "#0e0c0a";
  const SHEET_TEXT = "#faf5ec";
  const SHEET_TEXT_DIM = "rgba(250,245,236,0.55)";
  const SHEET_DIVIDER = "rgba(250,245,236,0.10)";
  const SHEET_X_BG = "rgba(250,245,236,0.10)";
  const BADGE_BG = "#f5efe5";
  const BADGE_FG = "#1a1410";
  const SERIF =
    Platform.OS === "ios" ? "Times New Roman" : "serif";

  const options: CreateOption[] = [
    {
      serial: "01",
      label: "Post",
      sub: "Photo for your grid",
      onPress: onPost,
    },
    {
      serial: "02",
      label: "Reel",
      sub: "Short vertical video",
      onPress: onReel,
    },
    {
      serial: "03",
      label: "Buzz",
      sub: "Quick text update",
      onPress: onBuzz,
    },
    {
      serial: "04",
      label: "Listing",
      sub: "Set up your marketplace listing",
      badge: "EARN",
      onPress: onListing,
    },
  ];

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop dim — taps fall through to close. */}
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}
      />
      <SafeAreaView
        edges={["bottom"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: SHEET_BG,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
        }}
      >
        {/* Grabber */}
        <View
          style={{
            alignSelf: "center",
            width: 44,
            height: 4,
            borderRadius: 999,
            backgroundColor: "rgba(250,245,236,0.25)",
            marginTop: 10,
            marginBottom: 14,
          }}
        />

        {/* Title row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 24,
            paddingBottom: 8,
          }}
        >
          <Text
            style={{
              color: SHEET_TEXT,
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 30,
              fontWeight: "500",
            }}
          >
            Create
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            {({ pressed }) => (
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  backgroundColor: SHEET_X_BG,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.6 : 1,
                }}
              >
                <Feather name="x" size={16} color={SHEET_TEXT} />
              </View>
            )}
          </Pressable>
        </View>

        {/* Rows */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
          {options.map((o, idx) => (
            <Pressable
              key={o.label}
              onPress={o.onPress}
              android_ripple={{ color: SHEET_DIVIDER }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 18,
                    borderTopWidth: 1,
                    borderTopColor: SHEET_DIVIDER,
                    borderBottomWidth: idx === options.length - 1 ? 1 : 0,
                    borderBottomColor: SHEET_DIVIDER,
                    opacity: pressed ? 0.65 : 1,
                  }}
                >
                  <Text
                    style={{
                      color: SHEET_TEXT_DIM,
                      fontSize: 13,
                      width: 32,
                      letterSpacing: 0.4,
                    }}
                  >
                    {o.serial}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: SHEET_TEXT,
                          fontFamily: SERIF,
                          fontStyle: "italic",
                          fontSize: 24,
                          fontWeight: "500",
                        }}
                      >
                        {o.label}
                      </Text>
                      {o.badge ? (
                        <View
                          style={{
                            marginLeft: 10,
                            backgroundColor: BADGE_BG,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                          }}
                        >
                          <Text
                            style={{
                              color: BADGE_FG,
                              fontSize: 10,
                              fontWeight: "800",
                              letterSpacing: 0.8,
                            }}
                          >
                            {o.badge}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={{
                        marginTop: 2,
                        color: SHEET_TEXT_DIM,
                        fontSize: 13,
                      }}
                    >
                      {o.sub}
                    </Text>
                  </View>
                  <Feather
                    name="chevron-right"
                    size={20}
                    color={SHEET_TEXT_DIM}
                  />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </Modal>
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

          <Pressable
            onPress={() => {
              Alert.alert(
                "Delete your account?",
                "This permanently deletes your account, all listings, messages, and history. You can't undo this.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete account",
                    style: "destructive",
                    onPress: async () => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const { error } = await (supabase as any).rpc(
                        "request_account_deletion",
                      );
                      if (error) {
                        Alert.alert(
                          "Couldn't delete account",
                          error.message,
                        );
                        return;
                      }
                      onClose();
                      // The auth.users row is now gone — sign-out
                      // clears the local session and routes to auth.
                      onSignOut();
                    },
                  },
                ],
              );
            }}
            className="mt-2 rounded-lg border border-rose-300 bg-background py-3 active:opacity-70"
          >
            <Text className="text-center text-sm font-medium text-rose-600">
              Delete account
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
