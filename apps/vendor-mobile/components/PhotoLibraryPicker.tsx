// Vendora photo library picker — Vendora-themed take on the
// Instagram-style flow:
//
//   X            New post           Next
//   ┌────────────────────────────────┐
//   │     1:1 preview of selected    │
//   └────────────────────────────────┘
//   Recents
//   ┌──┬──┬──┬──┐
//   │📸│  │  │  │   ← camera tile + recent photos in a 4-col grid
//   ├──┼──┼──┼──┤
//   │  │  │  │  │
//
// Cream / ink palette to match the rest of the app (no IG dark).
// Tap a thumbnail to select it (selected ring uses accent gold).
// Tap the camera tile to open the camera, captured photo joins the
// preview as the selected asset. "Next" hands the picked URI to the
// caller via onPicked.

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
const ACCENT = "#a08259";
const INK = "#0a0a0a";
const MUTED = "#737373";
const BORDER = "#e5e5e5";

interface PickedAsset {
  uri: string;
  type?: string | null;
  width?: number;
  height?: number;
}

export function PhotoLibraryPicker({
  visible,
  onClose,
  onPicked,
}: {
  visible: boolean;
  onClose: () => void;
  onPicked: (asset: PickedAsset) => void;
}) {
  const [permission, setPermission] =
    useState<MediaLibrary.PermissionResponse | null>(null);
  const [recents, setRecents] = useState<MediaLibrary.Asset[]>([]);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [selectedDims, setSelectedDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      // Reset selection when the modal hides — fresh state next open.
      setSelectedUri(null);
      setSelectedDims(null);
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
        mediaType: ["photo"],
        first: 200,
        sortBy: [["creationTime", false]],
      });
      if (cancelled) return;
      setRecents(assets);
      // Default-select the most recent so the preview isn't blank.
      const first = assets[0];
      if (first) {
        setSelectedUri(first.uri);
        setSelectedDims({ width: first.width, height: first.height });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  async function openCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera access needed",
        "Enable camera access in Settings to take a photo.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setSelectedUri(a.uri);
      setSelectedDims({ width: a.width, height: a.height });
    }
  }

  function handleNext() {
    if (!selectedUri) return;
    onPicked({
      uri: selectedUri,
      width: selectedDims?.width,
      height: selectedDims?.height,
      type: "image/jpeg",
    });
  }

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
            New post
          </Text>
          <Pressable
            onPress={handleNext}
            disabled={!selectedUri}
            hitSlop={8}
            style={{ opacity: selectedUri ? 1 : 0.4 }}
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
          {selectedUri ? (
            <Image
              source={{ uri: selectedUri }}
              className="h-full w-full"
              resizeMode="cover"
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Feather name="image" size={36} color={MUTED} />
              <Text className="mt-2 text-sm text-muted-foreground">
                Pick a photo below
              </Text>
            </View>
          )}
        </View>

        {/* Recents header */}
        <View className="flex-row items-center justify-between px-4 py-2 border-b border-border">
          <View className="flex-row items-center gap-1">
            <Text className="text-sm font-semibold text-foreground">
              Recents
            </Text>
          </View>
        </View>

        {/* Grid */}
        {permission && permission.status !== "granted" ? (
          <View className="flex-1 items-center justify-center px-8">
            <Feather name="image" size={36} color={MUTED} />
            <Text className="mt-3 text-base font-semibold text-foreground">
              Photo access needed
            </Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              Enable photo library access in Settings to pick a photo.
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
            ListHeaderComponent={
              <View className="flex-row" style={{ flexBasis: "100%" }} />
            }
            renderItem={({ item, index }) => {
              if (index === 0) {
                // First slot is camera — but we still want the photo too,
                // so render camera as a header tile and shift the grid by
                // one. Easiest: render a "camera" tile at index 0 and
                // shift the photo to index 1+. We'll handle that via a
                // separate stickyHeader-like thumbnail. For simplicity
                // here, split: render camera tile in line with first
                // photo (overlaying first cell).
              }
              const selected = item.uri === selectedUri;
              return (
                <Pressable
                  onPress={() => {
                    setSelectedUri(item.uri);
                    setSelectedDims({ width: item.width, height: item.height });
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
                    }}
                  >
                    <Image
                      source={{ uri: item.uri }}
                      style={{ flex: 1, opacity: selected ? 0.85 : 1 }}
                      resizeMode="cover"
                    />
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View className="items-center pt-10">
                <Text className="text-sm text-muted-foreground">
                  No photos in your library yet.
                </Text>
              </View>
            }
            // Camera tile pinned at the top-left of the grid via a header
            // row. We render a single camera tile + the rest of the row
            // is filled with the first 3 photos so the layout reads
            // 4-up consistently.
          />
        )}

        {/* Camera button — floats bottom-right above the grid for quick
            access. Less intrusive than baking it into the grid layout
            and avoids the alignment headache of mixing tile types in
            FlatList. */}
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
          <Feather name="camera" size={22} color="#fff" />
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}
