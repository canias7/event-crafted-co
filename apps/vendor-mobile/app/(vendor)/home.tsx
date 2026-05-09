// Home tab — 4-segment content browser. Same data and composers as
// the Profile tab, just a different surface so the vendor can flip
// through their grid / reels / buzz / listings without leaving the
// home position.

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  caption: string | null;
  created_at: string;
}
interface BuzzRow {
  id: string;
  body: string;
  created_at: string;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [view, setView] = useState<ViewKind>("grid");
  const [buzzOpen, setBuzzOpen] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<
    { asset: ImagePicker.ImagePickerAsset; kind: MediaKind } | null
  >(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [buzz, setBuzz] = useState<BuzzRow[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, location, base_price_cents, application_status",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setProfile(data as VendorProfile | null);
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
        .select("id, video_url, caption, created_at")
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
    Alert.alert(
      "New reel",
      "Record a short video or pick one from your library.",
      [
        { text: "Record video", onPress: () => pickMedia("camera", "Videos") },
        { text: "Choose from library", onPress: () => pickMedia("library", "Videos") },
        { text: "Cancel", style: "cancel" },
      ],
    );
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
      <View className="px-4 pt-4">
        <Text className="text-2xl font-semibold text-foreground">Home</Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Your posts, reels, and listings
        </Text>
      </View>

      <View className="mt-6 flex-row border-t border-border">
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

      <ScrollView contentContainerClassName="pb-32 pt-4">
        {view === "grid" ? (
          posts.length === 0 ? (
            <View className="items-center px-6 pt-10">
              <EmptyState
                icon="grid"
                title="No posts yet"
                body="Share photos from past events to build trust with hosts."
                ctaLabel="Create"
                onCta={openCreatePost}
              />
            </View>
          ) : (
            <PostGrid posts={posts} />
          )
        ) : view === "reels" ? (
          reels.length === 0 ? (
            <View className="items-center px-6 pt-10">
              <EmptyState
                icon="play"
                title="No reels yet"
                body="Short videos help your listing convert."
                ctaLabel="Create"
                onCta={openCreateReel}
              />
            </View>
          ) : (
            <ReelGrid reels={reels} />
          )
        ) : view === "buzz" ? (
          buzz.length === 0 ? (
            <View className="items-center px-6 pt-10">
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
          <View className="items-center px-6 pt-10">
            <EmptyState
              icon="shopping-bag"
              title={listingsCount > 0 ? "Your listing" : "No listings yet"}
              body={
                listingsCount > 0
                  ? "Manage details on your Profile tab."
                  : "Add your location and starting price to publish your listing to the marketplace."
              }
              ctaLabel={listingsCount > 0 ? undefined : "Create listing"}
              onCta={
                listingsCount > 0
                  ? undefined
                  : () =>
                      Linking.openURL("https://eventvendora.com/vendor/listing")
              }
            />
          </View>
        )}
      </ScrollView>

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

function PostGrid({ posts }: { posts: PostRow[] }) {
  return (
    <FlatList
      data={posts}
      keyExtractor={(p) => p.id}
      numColumns={3}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <View style={{ flex: 1 / 3, aspectRatio: 1, padding: 1 }}>
          <Image
            source={{ uri: item.image_url }}
            style={{ flex: 1 }}
            resizeMode="cover"
          />
        </View>
      )}
    />
  );
}

function ReelGrid({ reels }: { reels: ReelRow[] }) {
  return (
    <FlatList
      data={reels}
      keyExtractor={(r) => r.id}
      numColumns={3}
      scrollEnabled={false}
      renderItem={() => (
        <View style={{ flex: 1 / 3, aspectRatio: 1, padding: 1 }}>
          <View className="flex-1 items-center justify-center bg-secondary/50">
            <Feather name="play" size={28} color="#fff" />
          </View>
        </View>
      )}
    />
  );
}

function BuzzList({ items }: { items: BuzzRow[] }) {
  return (
    <View className="gap-3 px-4">
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
