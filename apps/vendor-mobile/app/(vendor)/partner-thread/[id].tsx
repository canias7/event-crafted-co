// Vendor↔vendor partner thread, native edition. Mirrors the
// host↔vendor (vendor)/thread/[id].tsx shape but reads from
// vendor_partner_messages instead of direct_messages and routes
// attribution by sender_vendor_id (which vendor profile the user is
// acting as), not sender_role.
//
// Wiring: opened from inbox.tsx PartnerRow via
//   router.push(`/(vendor)/partner-thread/${thread.id}`).
// Previously that opened the web URL — partner messaging now lives
// fully in-app.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const CREAM = "#f4f1ea";
const CREAM_DEEP = "#ece7db";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

interface PartnerMessage {
  id: string;
  thread_id: string;
  sender_vendor_id: string;
  body: string;
  created_at: string;
}

interface PartnerThreadHeader {
  myVendorId: string;
  partnerName: string;
  partnerCategory: string | null;
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
    return "Today";
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  )
    return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

interface EnrichedMessage extends PartnerMessage {
  dateBreak: string | null;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
}

function enrichMessages(rows: PartnerMessage[]): EnrichedMessage[] {
  const out: EnrichedMessage[] = [];
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];
    const prev = rows[i - 1];
    const next = rows[i + 1];
    const label = formatDateSeparator(m.created_at);
    const prevLabel = prev ? formatDateSeparator(prev.created_at) : null;
    const nextLabel = next ? formatDateSeparator(next.created_at) : null;
    const dateBreak = label !== prevLabel ? label : null;
    const sameSenderAsPrev =
      prev && prev.sender_vendor_id === m.sender_vendor_id && prevLabel === label;
    const sameSenderAsNext =
      next && next.sender_vendor_id === m.sender_vendor_id && nextLabel === label;
    out.push({
      ...m,
      dateBreak,
      isFirstInGroup: !sameSenderAsPrev,
      isLastInGroup: !sameSenderAsNext,
    });
  }
  return out;
}

export default function PartnerThreadScreen() {
  const router = useRouter();
  const { id: threadId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [header, setHeader] = useState<PartnerThreadHeader | null>(null);
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Resolve the thread + figure out which side is "me" by intersecting
  // the user's vendor_profiles with vendor_a_id / vendor_b_id.
  const loadHeader = useCallback(async () => {
    if (!threadId || !user?.id) return;
    const [{ data: thread }, { data: vendorRows }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_partner_threads")
        .select(
          "vendor_a_id, vendor_b_id, vendor_a:vendor_profiles!vendor_partner_threads_vendor_a_id_fkey(business_name, category), vendor_b:vendor_profiles!vendor_partner_threads_vendor_b_id_fkey(business_name, category)",
        )
        .eq("id", threadId)
        .maybeSingle(),
      supabase.from("vendor_profiles").select("id").eq("user_id", user.id),
    ]);
    if (!thread) return;
    const mine = new Set(((vendorRows ?? []) as { id: string }[]).map((r) => r.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = thread as any;
    const myVendorId: string | null = mine.has(t.vendor_a_id)
      ? t.vendor_a_id
      : mine.has(t.vendor_b_id)
        ? t.vendor_b_id
        : null;
    if (!myVendorId) return;
    const partner = myVendorId === t.vendor_a_id ? t.vendor_b : t.vendor_a;
    setHeader({
      myVendorId,
      partnerName: partner?.business_name ?? "Partner",
      partnerCategory: partner?.category ?? null,
    });
  }, [threadId, user?.id]);

  const loadMessages = useCallback(async () => {
    if (!threadId) return;
    const { data } = await supabase
      .from("vendor_partner_messages")
      .select("id, thread_id, sender_vendor_id, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as PartnerMessage[]);
    setLoading(false);
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: false }),
    );
  }, [threadId]);

  useEffect(() => {
    loadHeader();
    loadMessages();
  }, [loadHeader, loadMessages]);

  // Realtime: stream new inserts to this thread.
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`partner-thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vendor_partner_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as PartnerMessage;
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
    if (!draft.trim() || !header?.myVendorId || !threadId) return;
    const body = draft.trim();
    setSending(true);
    const { error } = await supabase.from("vendor_partner_messages").insert({
      thread_id: threadId,
      sender_vendor_id: header.myVendorId,
      body,
    });
    setSending(false);
    if (error) {
      Alert.alert("Couldn't send", error.message);
      return;
    }
    setDraft("");
    const optimistic: PartnerMessage = {
      id: `tmp-${Date.now()}`,
      thread_id: threadId,
      sender_vendor_id: header.myVendorId,
      body,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
  }

  const enriched = useMemo(() => enrichMessages(messages), [messages]);
  const partnerInitial = (header?.partnerName?.[0] ?? "?").toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: "#efe5d2",
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={{ paddingRight: 10 }}
          >
            <Feather name="chevron-left" size={26} color={INK} />
          </Pressable>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              backgroundColor: INK,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
            }}
          >
            <Text
              style={{
                color: CREAM,
                fontFamily: SERIF_BOLD,
                fontWeight: "600",
                fontSize: 16,
              }}
            >
              {partnerInitial}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: INK, fontSize: 16, fontWeight: "700" }}
              numberOfLines={1}
            >
              {header?.partnerName ?? "Partner"}
            </Text>
            {header?.partnerCategory ? (
              <Text
                style={{ color: INK_DIM, fontSize: 12 }}
                numberOfLines={1}
              >
                {header.partnerCategory}
              </Text>
            ) : null}
          </View>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <View style={{ alignItems: "center", paddingTop: 60 }}>
                <ActivityIndicator color={INK} />
              </View>
            ) : enriched.length === 0 ? (
              <View style={{ alignItems: "center", paddingTop: 80 }}>
                <Text style={{ color: INK_DIM, fontSize: 14 }}>
                  Say hi to start the conversation.
                </Text>
              </View>
            ) : (
              enriched.map((m) => {
                const isMine = m.sender_vendor_id === header?.myVendorId;
                return (
                  <View key={m.id}>
                    {m.dateBreak ? (
                      <Text
                        style={{
                          alignSelf: "center",
                          marginVertical: 12,
                          color: INK_DIM,
                          fontSize: 11,
                          fontWeight: "700",
                          letterSpacing: 0.8,
                        }}
                      >
                        — {m.dateBreak.toUpperCase()} —
                      </Text>
                    ) : null}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: isMine ? "flex-end" : "flex-start",
                        marginBottom: m.isLastInGroup ? 8 : 2,
                        paddingHorizontal: 6,
                      }}
                    >
                      <View
                        style={{
                          maxWidth: "78%",
                          backgroundColor: isMine ? INK : CREAM_DEEP,
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          borderRadius: 22,
                          borderBottomRightRadius:
                            isMine && !m.isLastInGroup ? 8 : 22,
                          borderBottomLeftRadius:
                            !isMine && !m.isLastInGroup ? 8 : 22,
                        }}
                      >
                        <Text
                          style={{
                            color: isMine ? CREAM : INK,
                            fontSize: 16,
                            lineHeight: 22,
                          }}
                        >
                          {m.body}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Composer */}
          <View
            style={{
              paddingHorizontal: 12,
              paddingTop: 6,
              paddingBottom: 12,
              borderTopWidth: 1,
              borderTopColor: "#efe5d2",
              backgroundColor: CREAM,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                backgroundColor: "#fbf9f4",
                borderRadius: 22,
                paddingHorizontal: 14,
                paddingVertical: 6,
              }}
            >
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Message your partner…"
                placeholderTextColor={INK_DIM}
                multiline
                style={{
                  flex: 1,
                  color: INK,
                  fontSize: 16,
                  paddingVertical: 8,
                  maxHeight: 120,
                }}
              />
              <Pressable
                onPress={send}
                disabled={!draft.trim() || sending}
                hitSlop={8}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 999,
                      backgroundColor: draft.trim() ? INK : "#e5dbc8",
                      alignItems: "center",
                      justifyContent: "center",
                      marginLeft: 6,
                      opacity: pressed ? 0.75 : 1,
                    }}
                  >
                    <Feather name="arrow-up" size={18} color={CREAM} />
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
