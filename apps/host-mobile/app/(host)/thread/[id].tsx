// Host-side conversation screen — same shape as the vendor-mobile
// equivalent but the "other party" is the vendor (business name) and
// outgoing messages carry sender_role = 'host'.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

interface DirectMessage {
  id: string;
  sender_id: string;
  sender_role: "host" | "vendor";
  body: string;
  created_at: string;
}

interface ThreadHeader {
  vendorName: string;
  inquirySummary: string | null;
}

export default function ThreadScreen() {
  const router = useRouter();
  const { id: threadId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [header, setHeader] = useState<ThreadHeader | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const loadHeader = useCallback(async () => {
    if (!threadId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("direct_threads")
      .select(
        "id, vendor_id, inquiry_id, vendor:vendor_profiles!direct_threads_vendor_id_fkey(business_name, category), inquiry:inquiries!direct_threads_inquiry_id_fkey(event_type, event_date)",
      )
      .eq("id", threadId)
      .maybeSingle();
    if (!data) return;
    const inquiry = data.inquiry;
    setHeader({
      vendorName: data.vendor?.business_name ?? "Vendor",
      inquirySummary: inquiry
        ? [inquiry.event_type, inquiry.event_date].filter(Boolean).join(" · ")
        : null,
    });
  }, [threadId]);

  const loadMessages = useCallback(async () => {
    if (!threadId) return;
    const { data } = await supabase
      .from("direct_messages")
      .select("id, sender_id, sender_role, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as DirectMessage[]);
    setLoading(false);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, [threadId]);

  useEffect(() => {
    loadHeader();
    loadMessages();
  }, [loadHeader, loadMessages]);

  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as DirectMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row],
          );
          requestAnimationFrame(() =>
            scrollRef.current?.scrollToEnd({ animated: true }),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  async function send() {
    if (!draft.trim() || !user?.id || !threadId) return;
    const body = draft.trim();
    setSending(true);
    const { error } = await supabase.from("direct_messages").insert({
      thread_id: threadId,
      sender_id: user.id,
      sender_role: "host",
      body,
    });
    setSending(false);
    if (!error) {
      setDraft("");
      const optimistic: DirectMessage = {
        id: `tmp-${Date.now()}`,
        sender_id: user.id,
        sender_role: "host",
        body,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable onPress={() => router.back()} hitSlop={10} className="mr-2">
          <Feather name="chevron-left" size={26} color="#0a0a0a" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
            {header?.vendorName ?? "Conversation"}
          </Text>
          {header?.inquirySummary ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {header.inquirySummary}
            </Text>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
        className="flex-1"
      >
        <ScrollView
          ref={scrollRef}
          contentContainerClassName="px-4 py-4 gap-2"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: false })
          }
        >
          {loading ? (
            <View className="items-center py-12">
              <ActivityIndicator />
            </View>
          ) : messages.length === 0 ? (
            <View className="items-center pt-16 px-6">
              <Feather name="message-square" size={28} color="#a1a1aa" />
              <Text className="mt-3 text-sm text-muted-foreground text-center">
                No messages yet — say hi.
              </Text>
            </View>
          ) : (
            messages.map((m) => <Bubble key={m.id} msg={m} mine={m.sender_role === "host"} />)
          )}
        </ScrollView>

        <View className="flex-row items-end gap-2 px-3 py-2 border-t border-border bg-background">
          <View className="flex-1 rounded-2xl bg-muted px-4 py-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor="#a3a3a3"
              multiline
              className="text-base text-foreground"
              style={{ maxHeight: 120 }}
            />
          </View>
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            className="h-11 w-11 rounded-full items-center justify-center"
            style={{
              backgroundColor: draft.trim() && !sending ? "#0a0a0a" : "#d4d4d8",
            }}
            hitSlop={6}
          >
            <Feather name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ msg, mine }: { msg: DirectMessage; mine: boolean }) {
  return (
    <View
      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
        mine ? "self-end bg-foreground" : "self-start bg-muted"
      }`}
    >
      <Text className={`text-base ${mine ? "text-background" : "text-foreground"}`}>
        {msg.body}
      </Text>
    </View>
  );
}
