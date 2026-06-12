// Gallery tab — manage portfolio photos without opening the full
// listing builder. Shows the photos for the vendor's listing (chips to
// switch when they have more than one), 3-column grid, multi-pick
// upload, long-press for Make cover / Delete.
//
// Upload/delete/cover logic mirrors listing.tsx (same worker-pool
// parallel upload, HEIC rejection, display_order bookkeeping) so a
// photo added here looks identical to one added in the builder.

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { compressForUpload } from "@/lib/imageManipulation";

// Keep in sync with listing.tsx (and web's ListingWizardModal).
const MAX_PHOTOS = 100;
const UPLOAD_CONCURRENCY = 5;

const INK = "#0a0a0a";
const INK_DIM = "#6b7280";

type ListingRow = {
  id: string;
  business_name: string | null;
  category: string | null;
  application_status: "draft" | "pending" | "approved" | "rejected" | null;
};

type PortfolioRow = {
  id: string;
  storage_path: string;
  display_order: number;
  url: string;
};

export default function GalleryScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [listings, setListings] = useState<ListingRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const loadPhotos = useCallback(async (vendorId: string) => {
    const { data, error } = await supabase
      .from("vendor_portfolio_images")
      .select("id, storage_path, display_order")
      .eq("vendor_id", vendorId)
      .order("display_order", { ascending: true });
    if (error) return;
    const enriched = ((data ?? []) as Omit<PortfolioRow, "url">[]).map((r) => ({
      ...r,
      url: supabase.storage.from("vendor-portfolios").getPublicUrl(
        r.storage_path,
      ).data.publicUrl,
    }));
    setPhotos(enriched);
  }, []);

  const loadAll = useCallback(
    async (preferId?: string | null) => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("vendor_profiles")
        .select("id, business_name, category, application_status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      const rows = (data ?? []) as ListingRow[];
      setListings(rows);
      const target =
        rows.find((r) => r.id === preferId)?.id ?? rows[0]?.id ?? null;
      setSelectedId(target);
      if (target) await loadPhotos(target);
      else setPhotos([]);
    },
    [user?.id, loadPhotos],
  );

  // Re-sync whenever the tab gains focus — photos can change in the
  // listing builder (or on web) between visits.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        await loadAll(selectedId);
        if (alive) setLoading(false);
      })();
      return () => {
        alive = false;
      };
      // selectedId intentionally read once per focus, not re-triggering.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadAll]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadAll(selectedId);
    setRefreshing(false);
  }

  async function switchListing(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setPhotos([]);
    await loadPhotos(id);
  }

  // Same flow as listing.tsx pickAndUploadPhoto — multi-pick capped to
  // remaining slots, HEIC rejected up-front, parallel worker uploads
  // that preserve pick order via baseOrder + index.
  async function addPhotos() {
    if (!selectedId || !user?.id || uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Library access needed",
        "Enable photo library access in Settings to upload listing photos.",
      );
      return;
    }
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      Alert.alert(
        "Photo limit reached",
        `Listings cap at ${MAX_PHOTOS} photos. Delete a photo to add a new one.`,
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (result.canceled || result.assets.length === 0) return;

    const isHeic = (a: ImagePicker.ImagePickerAsset) => {
      const mime = (a.mimeType ?? "").toLowerCase();
      const uri = (a.uri ?? "").toLowerCase();
      return (
        mime === "image/heic" ||
        mime === "image/heif" ||
        uri.endsWith(".heic") ||
        uri.endsWith(".heif")
      );
    };
    const heicCount = result.assets.filter(isHeic).length;
    const assets = result.assets.filter((a) => !isHeic(a));
    if (heicCount > 0) {
      Alert.alert(
        "Some photos were skipped",
        `${heicCount} HEIC photo${heicCount === 1 ? "" : "s"} skipped. Open the Photos app → Settings → Camera → Formats → Most Compatible to upload as JPEG instead.`,
      );
    }
    if (assets.length === 0) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: assets.length });

    const vendorId = selectedId;
    const baseOrder =
      photos.length === 0
        ? 0
        : Math.max(...photos.map((p) => p.display_order)) + 1;

    const uploaded: Array<
      { vendor_id: string; storage_path: string; display_order: number } | null
    > = new Array(assets.length).fill(null);
    let cursor = 0;
    let doneCount = 0;
    let firstError: { message?: string } | null = null;

    async function worker() {
      while (true) {
        const myIdx = cursor++;
        if (myIdx >= assets.length) return;
        const asset = assets[myIdx];
        try {
          // Downscale to 2400px / JPEG 0.85 before upload (same as web
          // + the listing builder). Output is always JPEG.
          const { uri: upUri, mime } = await compressForUpload(asset);
          const path = `${vendorId}/${Date.now()}-${baseOrder + myIdx}-${myIdx}.jpg`;
          const arrayBuffer = await (await fetch(upUri)).arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          if (bytes.byteLength === 0) throw new Error("Empty file");
          const up = await supabase.storage
            .from("vendor-portfolios")
            .upload(path, bytes, {
              contentType: mime,
              upsert: false,
            });
          if (up.error) throw up.error;
          uploaded[myIdx] = {
            vendor_id: vendorId,
            storage_path: path,
            display_order: baseOrder + myIdx,
          };
        } catch (err) {
          if (!firstError) {
            firstError =
              (err as { message?: string }) ?? { message: "upload failed" };
          }
          // eslint-disable-next-line no-console
          console.warn("[gallery] photo upload failed", myIdx, err);
        } finally {
          doneCount++;
          setUploadProgress({ done: doneCount, total: assets.length });
        }
      }
    }

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(UPLOAD_CONCURRENCY, assets.length) },
          () => worker(),
        ),
      );
      const successful = uploaded.filter(
        (
          r,
        ): r is { vendor_id: string; storage_path: string; display_order: number } =>
          r !== null,
      );
      if (successful.length === 0) {
        throw firstError ?? new Error("Upload failed");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ins, error } = await (supabase as any)
        .from("vendor_portfolio_images")
        .insert(successful)
        .select("id, storage_path, display_order");
      if (error) throw error;
      const enriched = ((ins ?? []) as Omit<PortfolioRow, "url">[]).map((r) => ({
        ...r,
        url: supabase.storage
          .from("vendor-portfolios")
          .getPublicUrl(r.storage_path).data.publicUrl,
      }));
      setPhotos((curr) =>
        [...curr, ...enriched].sort((a, b) => a.display_order - b.display_order),
      );
      if (successful.length < assets.length) {
        Alert.alert(
          "Partial upload",
          `${successful.length} of ${assets.length} photos uploaded. Try again for the rest.`,
        );
      }
    } catch (err) {
      Alert.alert(
        "Couldn't upload photos",
        (err as { message?: string })?.message ?? "Try again in a moment.",
      );
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function deletePhoto(p: PortfolioRow) {
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert("Delete photo?", "This removes it from your listing.", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Delete", style: "destructive", onPress: () => resolve(true) },
      ]);
    });
    if (!ok) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_portfolio_images")
      .delete()
      .eq("id", p.id);
    if (error) {
      Alert.alert("Couldn't delete", error.message);
      return;
    }
    await supabase.storage.from("vendor-portfolios").remove([p.storage_path]);
    setPhotos((curr) => curr.filter((x) => x.id !== p.id));
  }

  // Same approach as listing.tsx makeCover: bump display_order to one
  // below the current minimum — relative order is all that matters.
  async function makeCover(target: PortfolioRow) {
    if (photos.length === 0) return;
    const minOrder = Math.min(...photos.map((p) => p.display_order));
    const newOrder = minOrder - 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_portfolio_images")
      .update({ display_order: newOrder })
      .eq("id", target.id);
    if (error) {
      Alert.alert("Couldn't update cover", error.message);
      return;
    }
    setPhotos((curr) =>
      curr
        .map((p) => (p.id === target.id ? { ...p, display_order: newOrder } : p))
        .sort((a, b) => a.display_order - b.display_order),
    );
  }

  function photoMenu(p: PortfolioRow) {
    const isCover = photos[0]?.id === p.id;
    const options: Array<{
      text: string;
      style?: "default" | "cancel" | "destructive";
      onPress?: () => void;
    }> = [{ text: "Cancel", style: "cancel" }];
    if (!isCover) {
      options.unshift({
        text: "Make cover",
        onPress: () => {
          void makeCover(p);
        },
      });
    }
    options.push({
      text: "Delete",
      style: "destructive",
      onPress: () => {
        void deletePhoto(p);
      },
    });
    Alert.alert("Photo options", undefined, options);
  }

  // 3-column grid sizing: screen − px-5 padding (20×2) − 2 gaps of 6.
  const TILE = Math.floor((Dimensions.get("window").width - 40 - 12) / 3);

  const selected = listings.find((l) => l.id === selectedId) ?? null;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="px-5 pb-32 pt-6"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-4xl font-bold text-foreground">Gallery</Text>
          {selected ? (
            <Pressable
              onPress={addPhotos}
              disabled={uploading}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: INK,
                borderRadius: 999,
                paddingHorizontal: 16,
                height: 40,
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Feather name="plus" size={16} color="#ffffff" />
              )}
              <Text
                style={{
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: "700",
                  marginLeft: 6,
                }}
              >
                {uploading && uploadProgress
                  ? `${uploadProgress.done}/${uploadProgress.total}`
                  : "Add"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text className="mt-2 mb-5 text-base text-muted-foreground">
          {selected
            ? `${photos.length} of ${MAX_PHOTOS} photos — the first is your cover.`
            : "Photos for your listing live here."}
        </Text>

        {/* Listing switcher — only when the vendor has more than one. */}
        {listings.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
          >
            {listings.map((l, i) => {
              const active = l.id === selectedId;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => switchListing(l.id)}
                  style={{
                    paddingHorizontal: 14,
                    height: 36,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active ? INK : "#f5f5f5",
                  }}
                >
                  <Text
                    style={{
                      color: active ? "#ffffff" : INK,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                    numberOfLines={1}
                  >
                    {l.business_name ?? l.category ?? `Listing ${i + 1}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {loading ? (
          <View style={{ paddingTop: 80, alignItems: "center" }}>
            <ActivityIndicator />
          </View>
        ) : !selected ? (
          // No listing yet — send them to the builder first.
          <View
            style={{
              backgroundColor: "#f5f5f5",
              borderRadius: 20,
              padding: 24,
              alignItems: "center",
            }}
          >
            <Feather name="image" size={28} color={INK_DIM} />
            <Text
              style={{
                marginTop: 12,
                fontSize: 17,
                fontWeight: "700",
                color: INK,
              }}
            >
              No listing yet
            </Text>
            <Text
              style={{
                marginTop: 6,
                textAlign: "center",
                color: INK_DIM,
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              Create your listing first — then your portfolio photos live
              here.
            </Text>
            <Pressable
              onPress={() => router.push("/(vendor)/listing" as never)}
              style={{
                marginTop: 16,
                backgroundColor: INK,
                borderRadius: 999,
                paddingHorizontal: 20,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                Create listing
              </Text>
            </Pressable>
          </View>
        ) : photos.length === 0 ? (
          <Pressable
            onPress={addPhotos}
            style={{
              backgroundColor: "#f5f5f5",
              borderRadius: 20,
              padding: 24,
              alignItems: "center",
            }}
          >
            <Feather name="upload" size={28} color={INK_DIM} />
            <Text
              style={{
                marginTop: 12,
                fontSize: 17,
                fontWeight: "700",
                color: INK,
              }}
            >
              Add your first photos
            </Text>
            <Text
              style={{
                marginTop: 6,
                textAlign: "center",
                color: INK_DIM,
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              Tap to pick from your library. The first photo becomes your
              listing cover.
            </Text>
          </Pressable>
        ) : (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {photos.map((p, i) => (
              <Pressable
                key={p.id}
                onLongPress={() => photoMenu(p)}
                delayLongPress={300}
                style={{
                  width: TILE,
                  height: TILE,
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: "#f0f0f0",
                }}
              >
                <Image
                  source={{ uri: p.url }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
                {i === 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 6,
                      left: 6,
                      backgroundColor: "rgba(10,10,10,0.78)",
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text
                      style={{
                        color: "#ffffff",
                        fontSize: 10,
                        fontWeight: "800",
                        letterSpacing: 0.6,
                      }}
                    >
                      COVER
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        {selected && photos.length > 0 ? (
          <Text
            style={{
              marginTop: 14,
              color: INK_DIM,
              fontSize: 13,
              textAlign: "center",
            }}
          >
            Long-press a photo for options — make it the cover or delete it.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
