// Buzz composer — full-screen modal for short text posts. Twitter/X-style:
// avatar in the top-left, multiline "What's happening?" input, Post button
// on the top-right that activates once the user types something.
//
// Posts to the public.vendor_buzz table. Schema enforces ≤280 chars.

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
import { supabase } from "@/lib/supabase";

const MAX_LEN = 280;

export function BuzzComposer({
  visible,
  userId,
  vendorId,
  onClose,
  onPosted,
}: {
  visible: boolean;
  userId: string | null;
  vendorId: string | null;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const trimmed = text.trim();
  const canPost =
    trimmed.length > 0 && trimmed.length <= MAX_LEN && !posting && !!vendorId;

  async function handlePost() {
    if (!canPost) return;
    if (!userId || !vendorId) {
      Alert.alert("Can't post yet", "Profile not loaded — try again in a sec.");
      return;
    }
    setPosting(true);
    const { error } = await supabase.from("vendor_buzz").insert({
      vendor_id: vendorId,
      user_id: userId,
      body: trimmed,
    });
    setPosting(false);
    if (error) {
      Alert.alert("Couldn't post", error.message);
      return;
    }
    setText("");
    onPosted();
    onClose();
  }

  function handleCancel() {
    if (posting) return;
    if (trimmed.length > 0) {
      Alert.alert("Discard buzz?", "Your draft will be lost.", [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            setText("");
            onClose();
          },
        },
      ]);
      return;
    }
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Pressable onPress={handleCancel} hitSlop={8} className="active:opacity-60">
              <Text className="text-base font-medium text-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handlePost}
              disabled={!canPost}
              hitSlop={8}
              className="rounded-full bg-foreground px-5 py-2"
              style={{ opacity: canPost ? 1 : 0.4 }}
            >
              <Text className="text-sm font-semibold text-background">
                {posting ? "Posting…" : "Post"}
              </Text>
            </Pressable>
          </View>

          {/* Body */}
          <View className="flex-1 flex-row gap-3 px-4 pt-4">
            <View className="h-11 w-11 overflow-hidden rounded-full bg-secondary/60">
              <Image
                source={require("../assets/icon.png")}
                className="h-full w-full"
                resizeMode="cover"
              />
            </View>
            <TextInput
              value={text}
              onChangeText={(v) => setText(v.slice(0, MAX_LEN))}
              placeholder="What's happening?"
              placeholderTextColor="#a3a3a3"
              autoFocus
              multiline
              editable={!posting}
              className="flex-1 text-lg text-foreground"
              style={{ paddingTop: 8, lineHeight: 24 }}
            />
          </View>

          {/* Footer — char count */}
          <View className="flex-row items-center justify-end border-t border-border px-4 py-3">
            <Feather name="globe" size={14} color="#737373" />
            <Text className="ml-2 flex-1 text-xs text-muted-foreground">
              Visible to everyone who follows you
            </Text>
            <Text
              className="text-xs"
              style={{
                color:
                  trimmed.length > MAX_LEN - 20
                    ? trimmed.length >= MAX_LEN
                      ? "#b42318"
                      : "#1B3654"
                    : "#737373",
              }}
            >
              {MAX_LEN - trimmed.length}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
