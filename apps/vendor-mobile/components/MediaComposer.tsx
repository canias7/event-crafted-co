// MediaComposer — preview + caption + upload modal for both photos
// (vendor_posts) and videos (vendor_reels). After the user picks an
// asset from the camera or library, this modal walks them through
// captioning and posting.
//
// Upload pipeline:
//   1. fetch(uri) → Blob (works in RN via expo-image-picker output URIs)
//   2. supabase.storage.from(bucket).upload({user_id}/{filename}, blob)
//   3. getPublicUrl → store in vendor_posts/vendor_reels row
//   4. onPosted callback so the parent screen can refresh its grid

import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as VideoThumbnails from "expo-video-thumbnails";
import { supabase } from "@/lib/supabase";

interface PickedAsset {
  uri: string;
  type?: string | null;
  duration?: number | null;
  width?: number;
  height?: number;
}

export type MediaKind = "photo" | "video";

export function MediaComposer({
  visible,
  kind,
  asset,
  userId,
  vendorId,
  onClose,
  onPosted,
}: {
  visible: boolean;
  kind: MediaKind;
  asset: PickedAsset | null;
  userId: string | null;
  vendorId: string | null;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);

  const bucket = kind === "photo" ? "vendor-posts" : "vendor-reels";
  const noun = kind === "photo" ? "photo" : "video";

  function reset() {
    setCaption("");
    setPosting(false);
  }

  function handleClose() {
    if (posting) return;
    reset();
    onClose();
  }

  async function handlePost() {
    if (!asset || !userId || !vendorId) {
      Alert.alert("Can't post yet", "Profile not loaded — try again in a sec.");
      return;
    }
    setPosting(true);
    try {
      const ext = (asset.uri.split(".").pop() ?? (kind === "photo" ? "jpg" : "mp4"))
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${userId}/${filename}`;

      // Pull the file off device and ship it to Storage. Supabase JS
      // supports passing a Blob directly here.
      const res = await fetch(asset.uri);
      const blob = await res.blob();

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, blob, {
          contentType:
            asset.type ||
            (kind === "photo" ? "image/jpeg" : "video/mp4"),
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);

      if (kind === "photo") {
        const { error: insErr } = await supabase.from("vendor_posts").insert({
          vendor_id: vendorId,
          user_id: userId,
          image_url: pub.publicUrl,
          caption: caption.trim() || null,
        });
        if (insErr) throw insErr;
      } else {
        // Generate a thumbnail off the local video URI (before we lose
        // it on close). Falls back to null if the platform refuses —
        // the grid renders the dark play-icon placeholder in that case.
        let thumbnailUrl: string | null = null;
        try {
          const thumb = await VideoThumbnails.getThumbnailAsync(asset.uri, {
            time: 100,
            quality: 0.85,
          });
          if (thumb?.uri) {
            const thumbPath = `${userId}/${filename.replace(/\.[^.]+$/, "")}.thumb.jpg`;
            const thumbRes = await fetch(thumb.uri);
            const thumbBlob = await thumbRes.blob();
            const thumbUp = await supabase.storage
              .from(bucket)
              .upload(thumbPath, thumbBlob, {
                contentType: "image/jpeg",
                upsert: false,
              });
            if (!thumbUp.error) {
              thumbnailUrl = supabase.storage
                .from(bucket)
                .getPublicUrl(thumbPath).data.publicUrl;
            }
          }
        } catch {
          // best-effort; thumbnail isn't critical
        }

        const { error: insErr } = await supabase.from("vendor_reels").insert({
          vendor_id: vendorId,
          user_id: userId,
          video_url: pub.publicUrl,
          thumbnail_url: thumbnailUrl,
          caption: caption.trim() || null,
          duration_seconds: asset.duration
            ? Math.round(asset.duration / 1000)
            : null,
        });
        if (insErr) throw insErr;
      }

      reset();
      onPosted();
      onClose();
    } catch (err) {
      setPosting(false);
      Alert.alert(
        "Couldn't post",
        (err as { message?: string })?.message ?? "Try again in a moment.",
      );
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Pressable onPress={handleClose} hitSlop={8} className="active:opacity-60">
              <Text className="text-base font-medium text-foreground">Cancel</Text>
            </Pressable>
            <Text className="text-base font-semibold text-foreground">
              {kind === "photo" ? "New post" : "New reel"}
            </Text>
            <Pressable
              onPress={handlePost}
              disabled={posting}
              hitSlop={8}
              className="rounded-full bg-foreground px-5 py-2"
              style={{ opacity: posting ? 0.5 : 1 }}
            >
              <Text className="text-sm font-semibold text-background">
                {posting ? "Posting…" : "Post"}
              </Text>
            </Pressable>
          </View>

          {/* Preview + caption */}
          <View className="flex-1 px-4 pt-4">
            {asset ? (
              <View
                className="overflow-hidden rounded-xl bg-secondary/40"
                style={{ aspectRatio: 1, marginBottom: 16 }}
              >
                {kind === "photo" ? (
                  <Image
                    source={{ uri: asset.uri }}
                    className="h-full w-full"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Feather name="video" size={36} color="#737373" />
                    <Text className="mt-2 text-sm text-muted-foreground">
                      Video selected
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder={`Add a caption for your ${noun}…`}
              placeholderTextColor="#a3a3a3"
              multiline
              className="rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground"
              style={{ minHeight: 80, textAlignVertical: "top" }}
              editable={!posting}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
