// Vendora media picker — Vendora-themed take on the Instagram-style
// in-app picker. Handles both photos and videos via the `mediaType`
// prop:
//
//   X            New post / New reel            Next
//   ┌────────────────────────────────┐
//   │     1:1 preview of selected    │
//   └────────────────────────────────┘
//   Recents
//   ┌──┬──┬──┬──┐
//   │  │  │  │  │   ← 4-col thumbnail grid
//   ├──┼──┼──┼──┤
//
// Camera FAB floats bottom-right and launches the camera in the right
// mode (photo or video). Selected tile gets an accent-gold ring. Tap
// Next → onPicked(asset) hands the URI back to the caller, which then
// opens the MediaComposer for caption + upload.

import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import * as ImagePicker from "expo-image-picker";

const COLS = 4;
const ACCENT = "#1B3654";
const INK = "#14161a";
const MUTED = "#737373";

interface PickedAsset {
  uri: string;
  type?: string | null;
  duration?: number | null;
  width?: number;
  height?: number;
}

export type PickerMediaType = "photo" | "video";

function formatDuration(ms: number | undefined | null): string {
  if (!ms || ms <= 0) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PhotoLibraryPicker({
  visible,
  mediaType = "photo",
  onClose,
  onPicked,
}: {
  visible: boolean;
  mediaType?: PickerMediaType;
  onClose: () => void;
  onPicked: (asset: PickedAsset) => void;
}) {
  const [permission, setPermission] =
    useState<MediaLibrary.PermissionResponse | null>(null);
  const [recents, setRecents] = useState<MediaLibrary.Asset[]>([]);
  const [selectedAsset, setSelectedAsset] =
    useState<MediaLibrary.Asset | null>(null);
  // Captured assets from camera don't live in MediaLibrary.Asset; track
  // their URIs separately so we can preview + post them.
  const [capturedOverride, setCapturedOverride] = useState<PickedAsset | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const isVideo = mediaType === "video";
  const title = isVideo ? "New reel" : "New post";

  useEffect(() => {
    if (!visible) {
      setSelectedAsset(null);
      setCapturedOverride(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      let perm = await MediaLibrary.getPermissionsAsync();
      if (perm.status !== "granted") {
        perm = await MediaLibrary.requestPermissionsAsync();
      }
      if (cancelled) return;
      setPermission(perm);
      if (perm.status !== "granted") {
        setLoading(false);
        return;
      }
      const { assets } = await MediaLibrary.getAssetsAsync({
        mediaType: isVideo ? ["video"] : ["photo"],
        first: 200,
        sortBy: [["creationTime", false]],
      });
      if (cancelled) return;
      setRecents(assets);
      const first = assets[0];
      if (first) setSelectedAsset(first);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, isVideo]);

  async function openCamera() {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (!camPerm.granted) {
      Alert.alert(
        "Camera access needed",
        `Enable camera access in Settings to capture a ${isVideo ? "video" : "photo"}.`,
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: isVideo
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setSelectedAsset(null);
      setCapturedOverride({
        uri: a.uri,
        width: a.width,
        height: a.height,
        duration: a.duration ?? null,
        type: isVideo ? "video/mp4" : "image/jpeg",
      });
    }
  }

  function handleNext() {
    const picked: PickedAsset | null = capturedOverride
      ? capturedOverride
      : selectedAsset
        ? {
            uri: selectedAsset.uri,
            width: selectedAsset.width,
            height: selectedAsset.height,
            duration: isVideo ? selectedAsset.duration * 1000 : null,
            type: isVideo ? "video/mp4" : "image/jpeg",
          }
        : null;
    if (!picked) return;
    onPicked(picked);
  }

  const previewUri = capturedOverride?.uri ?? selectedAsset?.uri ?? null;
  const previewDurationMs =
    capturedOverride?.duration ??
    (selectedAsset?.duration ? selectedAsset.duration * 1000 : null);
  const canProceed = previewUri !== null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Pressable onPress={onClose} hitSlop={8} className="active:opacity-60">
            <Feather name="x" size={24} color={INK} />
          </Pressable>
          <Text className="text-base font-semibold text-foreground">
            {title}
          </Text>
          <Pressable
            onPress={handleNext}
            disabled={!canProceed}
            hitSlop={8}
            style={{ opacity: canProceed ? 1 : 0.4 }}
          >
            <Text
              className="text-base font-semibold"
              style={{ color: ACCENT }}
            >
              Next
            </Text>
          </Pressable>
        </View>

        {/* Preview */}
        <View
          className="bg-secondary/30"
          style={{ aspectRatio: 1, width: "100%" }}
        >
          {previewUri ? (
            isVideo ? (
              <View className="flex-1 items-center justify-center bg-foreground/5">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-foreground/80">
                  <Feather name="play" size={28} color="#fff" />
                </View>
                {previewDurationMs ? (
                  <Text className="mt-3 text-sm text-muted-foreground">
                    {formatDuration(previewDurationMs)}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Image
                source={{ uri: previewUri }}
                className="h-full w-full"
                resizeMode="cover"
              />
            )
          ) : (
            <View className="flex-1 items-center justify-center">
              <Feather
                name={isVideo ? "video" : "image"}
                size={36}
                color={MUTED}
              />
              <Text className="mt-2 text-sm text-muted-foreground">
                Pick a {isVideo ? "video" : "photo"} below
              </Text>
            </View>
          )}
        </View>

        {/* Recents header */}
        <View className="flex-row items-center justify-between px-4 py-2 border-b border-border">
          <Text className="text-sm font-semibold text-foreground">Recents</Text>
        </View>

        {/* Grid */}
        {permission && permission.status !== "granted" ? (
          <View className="flex-1 items-center justify-center px-8">
            <Feather
              name={isVideo ? "video" : "image"}
              size={36}
              color={MUTED}
            />
            <Text className="mt-3 text-base font-semibold text-foreground">
              {isVideo ? "Video" : "Photo"} access needed
            </Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              Enable photo library access in Settings to pick a{" "}
              {isVideo ? "video" : "photo"}.
            </Text>
          </View>
        ) : loading ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-sm text-muted-foreground">Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={recents}
            keyExtractor={(a) => a.id}
            numColumns={COLS}
            renderItem={({ item }) => {
              const selected =
                !capturedOverride && item.id === selectedAsset?.id;
              return (
                <Pressable
                  onPress={() => {
                    setCapturedOverride(null);
                    setSelectedAsset(item);
                  }}
                  style={{
                    flex: 1 / COLS,
                    aspectRatio: 1,
                    padding: 1,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      borderWidth: selected ? 3 : 0,
                      borderColor: ACCENT,
                      overflow: "hidden",
                      backgroundColor: isVideo ? "#1a1a1a" : "transparent",
                    }}
                  >
                    {isVideo ? (
                      <View className="flex-1 items-center justify-center">
                        <Feather name="play" size={20} color="#ffffff" />
                        {item.duration ? (
                          <Text className="absolute bottom-1 right-1 text-[10px] text-white">
                            {formatDuration(item.duration * 1000)}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Image
                        source={{ uri: item.uri }}
                        style={{ flex: 1, opacity: selected ? 0.85 : 1 }}
                        resizeMode="cover"
                      />
                    )}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View className="items-center pt-10">
                <Text className="text-sm text-muted-foreground">
                  No {isVideo ? "videos" : "photos"} in your library yet.
                </Text>
              </View>
            }
          />
        )}

        <Pressable
          onPress={openCamera}
          className="absolute right-5 bottom-5 h-14 w-14 items-center justify-center rounded-full bg-foreground active:opacity-80"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          <Feather name={isVideo ? "video" : "camera"} size={22} color="#fff" />
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}
