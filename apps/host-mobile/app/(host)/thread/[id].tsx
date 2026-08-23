// Host-side conversation screen. Bubble grouping mirrors iMessage —
// consecutive messages from the same sender within the same day form
// a "group", and only the FIRST message of the other party's group
// shows the avatar. Date separators ("— Today —", "— Yesterday —",
// etc.) cut the timeline visually.
//
// Presence: we peek at the other party's most recent
// device_push_tokens.last_seen_at via the get_user_last_seen RPC.
// If it was within the last 5 minutes, we render the green dot +
// "Active now"; otherwise the subtitle hides.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

// Cross-platform attachment shape. Mobile-originated attachments
// carry { url, kind }; web-originated attachments carry the storage
// metadata triple { storage_path, filename, size, mime }. We accept
// either and normalize at render time so a vendor-on-web's pic
// renders on the host's iPhone (and vice-versa).
type AttachmentRef = {
  url?: string;
  kind?: string;
  storage_path?: string;
  filename?: string;
  size?: number;
  mime?: string;
};

function resolveAttachmentUrl(a: AttachmentRef): string | null {
  if (a.url) return a.url;
  if (a.storage_path) {
    return supabase.storage
      .from("message-attachments")
      .getPublicUrl(a.storage_path).data.publicUrl;
  }
  return null;
}

function isImageAttachment(a: AttachmentRef): boolean {
  if (a.kind === "image") return true;
  if (a.mime?.startsWith("image/")) return true;
  const candidate = a.url ?? a.storage_path ?? "";
  return /\.(jpe?g|png|webp|gif|heic)$/i.test(candidate);
}

function isAudioAttachment(a: AttachmentRef): boolean {
  if (a.kind === "audio") return true;
  if (a.mime?.startsWith("audio/")) return true;
  const candidate = a.url ?? a.storage_path ?? "";
  return /\.(webm|m4a|mp3|ogg|wav)$/i.test(candidate);
}

import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Small palette inserted via the smile button. Tap one to append it
// to the current draft. Designed for confirmations + emotional
// shorthand, not full conversation — pick a real keyboard for that.
const QUICK_EMOJIS = ["👍", "❤️", "🎉", "🙏", "😂", "🔥", "😍", "😅", "👋", "🤝", "✨", "💯"];

const CREAM = "#f4f1ea";
const CREAM_DEEP = "#ece7db";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const ACTIVE_GREEN = "#2e7d4f";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

interface DirectMessage {
  id: string;
  sender_id: string;
  sender_role: "host" | "vendor";
  body: string;
  created_at: string;
  attachments: AttachmentRef[] | null;
  // Web messaging fields the mobile read-path also needs to render
  // correctly so a vendor's edit / delete / reply-quote flows
  // through to the host's iPhone.
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_message_id?: string | null;
}

interface ThreadHeader {
  otherName: string;
  otherUserId: string | null;
  vendorId: string | null;
  vendorSlug: string | null;
  isActive: boolean;
}

function initialsOf(name: string): string {
  const s = name.trim();
  if (!s) return "?";
  return s.charAt(0).toUpperCase();
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type EnrichedMessage = DirectMessage & {
  dateBreak: string | null;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  replyTo: {
    senderRole: "host" | "vendor";
    body: string;
    deleted: boolean;
  } | null;
};

function enrichMessages(msgs: DirectMessage[]): EnrichedMessage[] {
  const byId = new Map(msgs.map((m) => [m.id, m]));
  const out: EnrichedMessage[] = [];
  let lastLabel: string | null = null;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const label = formatDateSeparator(m.created_at);
    const dateBreak = label !== lastLabel ? label : null;
    lastLabel = label;
    const prev = i > 0 ? msgs[i - 1] : null;
    const next = i + 1 < msgs.length ? msgs[i + 1] : null;
    const sameSenderAsPrev =
      prev && prev.sender_role === m.sender_role && !dateBreak;
    const nextLabel = next ? formatDateSeparator(next.created_at) : null;
    const sameSenderAsNext =
      next && next.sender_role === m.sender_role && nextLabel === label;
    let replyTo: EnrichedMessage["replyTo"] = null;
    if (m.reply_to_message_id) {
      const parent = byId.get(m.reply_to_message_id);
      if (parent) {
        replyTo = {
          senderRole: parent.sender_role,
          body: parent.body,
          deleted: parent.deleted_at != null,
        };
      }
    }
    out.push({
      ...m,
      dateBreak,
      isFirstInGroup: !sameSenderAsPrev,
      isLastInGroup: !sameSenderAsNext,
      replyTo,
    });
  }
  return out;
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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const toggleMute = useCallback(async () => {
    if (!user?.id || !threadId) return;
    const next = !muted;
    setMuted(next); // optimistic
    if (next) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("thread_mutes")
        .upsert(
          { user_id: user.id, thread_id: threadId },
          { onConflict: "user_id,thread_id" },
        );
      if (error) setMuted(false);
    } else {
      const { error } = await supabase
        .from("thread_mutes")
        .delete()
        .eq("user_id", user.id)
        .eq("thread_id", threadId);
      if (error) setMuted(true);
    }
  }, [user?.id, threadId, muted]);

  const submitReport = useCallback(
    async (reason: string) => {
      if (!user?.id || !threadId) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("thread_reports").insert({
        thread_id: threadId,
        reporter_id: user.id,
        reason,
      });
      if (error) {
        Alert.alert("Couldn't send report", "Please try again in a moment.");
        return;
      }
      Alert.alert(
        "Report received",
        "Thanks — our team will review this thread.",
      );
    },
    [user?.id, threadId],
  );

  const onReport = useCallback(() => {
    Alert.alert("Report this thread", "Pick a reason:", [
      { text: "Spam or scam", onPress: () => submitReport("spam") },
      { text: "Harassment or abuse", onPress: () => submitReport("harassment") },
      { text: "Inappropriate content", onPress: () => submitReport("inappropriate") },
      { text: "Something else", onPress: () => submitReport("other") },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [submitReport]);

  // Header overflow → quick options. Real mute toggle persists in
  // thread_mutes; real report writes to thread_reports for admin
  // review.
  const onHeaderMore = useCallback(() => {
    const opts: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [];
    if (header?.vendorId || header?.vendorSlug) {
      opts.push({
        text: "View vendor profile",
        onPress: () => {
          const target = header?.vendorSlug ?? header?.vendorId;
          if (target) router.push(`/(host)/vendor/${target}` as never);
        },
      });
    }
    opts.push({
      text: muted ? "Unmute notifications" : "Mute notifications",
      onPress: toggleMute,
    });
    opts.push({
      text: "Report",
      style: "destructive",
      onPress: onReport,
    });
    opts.push({ text: "Cancel", style: "cancel" });
    Alert.alert(header?.otherName ?? "Conversation", undefined, opts);
  }, [header, router, muted, toggleMute, onReport]);

  // Composer "+" tap. The host build doesn't yet bundle
  // expo-image-picker (vendor-mobile does), so sending photos from
  // this side has to wait for the next App Store build. Receiving
  // attachments still works — see bubble renderer below.
  const onAttach = useCallback(() => {
    Alert.alert(
      "Sending photos arrives soon",
      "Photo attachments will arrive in the next app update. You can already receive photos sent from a vendor's app.",
    );
  }, []);

  const onEmojiPick = useCallback(
    (emoji: string) => {
      setDraft((v) => v + emoji);
      setEmojiOpen(false);
    },
    [],
  );

  const loadHeader = useCallback(async () => {
    if (!threadId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("direct_threads")
      .select(
        "vendor_id, vendor:vendor_profiles!direct_threads_vendor_id_fkey(business_name, user_id, slug)",
      )
      .eq("id", threadId)
      .maybeSingle();
    if (!data) return;
    const otherUserId: string | null = data.vendor?.user_id ?? null;
    let isActive = false;
    if (otherUserId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lastSeen } = await (supabase as any).rpc(
        "get_user_last_seen",
        { p_user_id: otherUserId },
      );
      if (lastSeen) {
        isActive = Date.now() - new Date(lastSeen as string).getTime() < ACTIVE_WINDOW_MS;
      }
    }
    setHeader({
      otherName: data.vendor?.business_name ?? "Vendor",
      otherUserId,
      vendorId: data.vendor_id ?? null,
      vendorSlug: data.vendor?.slug ?? null,
      isActive,
    });
  }, [threadId]);

  const loadMessages = useCallback(async () => {
    if (!threadId) return;
    const { data } = await supabase
      .from("direct_messages")
      .select(
        "id, sender_id, sender_role, body, created_at, attachments, edited_at, deleted_at, reply_to_message_id",
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as DirectMessage[]);
    setLoading(false);
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: false }),
    );
  }, [threadId]);

  useEffect(() => {
    loadHeader();
    loadMessages();
  }, [loadHeader, loadMessages]);

  // Seed mute state from thread_mutes so the menu shows
  // Unmute/Mute correctly on open.
  useEffect(() => {
    if (!user?.id || !threadId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("thread_mutes")
        .select("thread_id")
        .eq("user_id", user.id)
        .eq("thread_id", threadId)
        .maybeSingle();
      if (!cancelled) setMuted(data != null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, threadId]);

  // Refresh presence every 30s while the thread is open.
  useEffect(() => {
    const id = setInterval(loadHeader, 30_000);
    return () => clearInterval(id);
  }, [loadHeader]);

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
    if (error) {
      Alert.alert("Couldn't send", error.message);
      return;
    }
    setDraft("");
    const optimistic: DirectMessage = {
      id: `tmp-${Date.now()}`,
      sender_id: user.id,
      sender_role: "host",
      body,
      created_at: new Date().toISOString(),
      attachments: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
  }

  const enriched = useMemo(() => enrichMessages(messages), [messages]);
  const myLastSentId = useMemo(() => {
    for (let i = enriched.length - 1; i >= 0; i--) {
      if (enriched[i].sender_role === "host") return enriched[i].id;
    }
    return null;
  }, [enriched]);

  const initial = header ? initialsOf(header.otherName) : "?";

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <Header
          name={header?.otherName ?? "Conversation"}
          initial={initial}
          isActive={!!header?.isActive}
          onBack={() => router.back()}
          onMore={onHeaderMore}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
          style={{ flex: 1 }}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 16 }}
            onContentSizeChange={() =>
              scrollRef.current?.scrollToEnd({ animated: false })
            }
          >
            {loading ? (
              <View style={{ alignItems: "center", paddingVertical: 48 }}>
                <ActivityIndicator color={INK} />
              </View>
            ) : enriched.length === 0 ? (
              <EmptyState />
            ) : (
              enriched.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  initial={initial}
                  isMine={m.sender_role === "host"}
                  showDelivered={m.id === myLastSentId}
                />
              ))
            )}
          </ScrollView>

          <Composer
            value={draft}
            onChange={setDraft}
            onSend={send}
            sending={sending}
            onAttach={onAttach}
            onEmoji={() => setEmojiOpen(true)}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>

      <EmojiPickerModal
        visible={emojiOpen}
        onPick={onEmojiPick}
        onClose={() => setEmojiOpen(false)}
      />
    </View>
  );
}

function EmojiPickerModal({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (e: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.35)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: "#fbf9f4",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 12,
            paddingBottom: 32,
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              width: 48,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#e6e1d5",
              alignSelf: "center",
              marginBottom: 12,
            }}
          />
          <Text
            style={{
              color: INK,
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 18,
              fontWeight: "500",
              marginBottom: 12,
              paddingHorizontal: 4,
            }}
          >
            Quick reactions
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
            }}
          >
            {QUICK_EMOJIS.map((e) => (
              <Pressable
                key={e}
                onPress={() => onPick(e)}
                style={{ width: "16.66%" }}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      paddingVertical: 12,
                      alignItems: "center",
                      opacity: pressed ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>{e}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Header({
  name,
  initial,
  isActive,
  onBack,
  onMore,
}: {
  name: string;
  initial: string;
  isActive: boolean;
  onBack: () => void;
  onMore: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#e6e1d5",
      }}
    >
      <Pressable onPress={onBack} hitSlop={10} style={{ paddingRight: 8 }}>
        <Feather name="chevron-left" size={26} color={INK} />
      </Pressable>
      <View style={{ position: "relative" }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            backgroundColor: INK,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: CREAM,
              fontFamily: SERIF,
              fontWeight: "600",
              fontSize: 18,
            }}
          >
            {initial}
          </Text>
        </View>
        {isActive ? (
          <View
            style={{
              position: "absolute",
              right: -1,
              bottom: -1,
              width: 12,
              height: 12,
              borderRadius: 999,
              backgroundColor: ACTIVE_GREEN,
              borderWidth: 2,
              borderColor: CREAM,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          numberOfLines={1}
          style={{
            color: INK,
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: "700",
            fontSize: 18,
          }}
        >
          {name}
        </Text>
        {isActive ? (
          <Text
            style={{
              color: ACTIVE_GREEN,
              fontSize: 12,
              fontWeight: "600",
              marginTop: 1,
            }}
          >
            Active now
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onMore}
        hitSlop={10}
        style={{ paddingLeft: 8 }}
      >
        <Feather name="more-horizontal" size={22} color={INK} />
      </Pressable>
    </View>
  );
}

function MessageRow({
  m,
  initial,
  isMine,
  showDelivered,
}: {
  m: EnrichedMessage;
  initial: string;
  isMine: boolean;
  showDelivered: boolean;
}) {
  return (
    <View>
      {m.dateBreak ? <DateSeparator label={m.dateBreak} /> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          marginTop: m.isFirstInGroup ? 10 : 2,
          paddingHorizontal: 2,
          justifyContent: isMine ? "flex-end" : "flex-start",
        }}
      >
        {!isMine ? (
          <View style={{ width: 30, marginRight: 8 }}>
            {m.isFirstInGroup ? (
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: INK,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: CREAM,
                    fontFamily: SERIF,
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  {initial}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ maxWidth: "78%" }}>
          {/* Attachments — render images inline, audio as a tappable
              chip that opens the system audio player, everything else
              as a tap-to-open file chip. Skip entirely when the
              message is soft-deleted. */}
          {!m.deleted_at && m.attachments && m.attachments.length > 0
            ? m.attachments.map((a, idx) => {
                const url = resolveAttachmentUrl(a);
                if (!url) return null;
                if (isImageAttachment(a)) {
                  return (
                    <Image
                      key={idx}
                      source={{ uri: url }}
                      style={{
                        width: 220,
                        height: 220,
                        borderRadius: 18,
                        marginBottom:
                          m.body || idx < m.attachments!.length - 1 ? 6 : 0,
                        backgroundColor: CREAM_DEEP,
                      }}
                      resizeMode="cover"
                    />
                  );
                }
                const audio = isAudioAttachment(a);
                return (
                  <Pressable
                    key={idx}
                    onPress={() => Linking.openURL(url)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 18,
                      backgroundColor: CREAM_DEEP,
                      marginBottom:
                        m.body || idx < m.attachments!.length - 1 ? 6 : 0,
                    }}
                  >
                    <Feather
                      name={audio ? "mic" : "paperclip"}
                      size={16}
                      color={INK}
                    />
                    <Text style={{ color: INK, fontSize: 14 }}>
                      {audio
                        ? "Voice message"
                        : a.filename ?? "Attachment"}
                    </Text>
                  </Pressable>
                );
              })
            : null}
          {m.body || m.deleted_at ? (
            <View
              style={{
                backgroundColor: m.deleted_at
                  ? CREAM_DEEP
                  : isMine
                    ? INK
                    : CREAM_DEEP,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 22,
                borderTopRightRadius: isMine && m.isFirstInGroup ? 22 : 22,
                borderBottomRightRadius: isMine && !m.isLastInGroup ? 8 : 22,
                borderTopLeftRadius: !isMine && m.isFirstInGroup ? 22 : 22,
                borderBottomLeftRadius: !isMine && !m.isLastInGroup ? 8 : 22,
                opacity: m.deleted_at ? 0.7 : 1,
              }}
            >
              {/* Reply-to header — shown only when the message
                  references a parent message. Mirrors the web
                  MessageReplyContext (bubble tone). */}
              {!m.deleted_at && m.replyTo ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 6,
                    marginBottom: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    borderRadius: 10,
                    backgroundColor: isMine
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(0,0,0,0.05)",
                  }}
                >
                  <View
                    style={{
                      width: 2,
                      alignSelf: "stretch",
                      borderRadius: 2,
                      backgroundColor: isMine
                        ? "rgba(255,255,255,0.5)"
                        : INK,
                    }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        color: isMine ? CREAM : INK,
                        fontSize: 11,
                        fontWeight: "700",
                        marginBottom: 1,
                      }}
                      numberOfLines={1}
                    >
                      {m.replyTo.senderRole === "host" ? "You" : "Vendor"}
                    </Text>
                    <Text
                      style={{
                        color: isMine ? CREAM : INK,
                        fontSize: 12,
                        opacity: 0.75,
                      }}
                      numberOfLines={2}
                    >
                      {m.replyTo.deleted
                        ? "Message deleted"
                        : m.replyTo.body}
                    </Text>
                  </View>
                </View>
              ) : null}
              <Text
                style={{
                  color: m.deleted_at ? INK_DIM : isMine ? CREAM : INK,
                  fontSize: 16,
                  lineHeight: 22,
                  fontStyle: m.deleted_at ? "italic" : "normal",
                }}
              >
                {m.deleted_at ? "Message deleted" : m.body}
              </Text>
              {m.edited_at && !m.deleted_at ? (
                <Text
                  style={{
                    color: isMine ? CREAM : INK_DIM,
                    fontSize: 10,
                    marginTop: 3,
                    opacity: 0.6,
                  }}
                >
                  edited
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      {isMine && showDelivered && m.isLastInGroup ? (
        <Text
          style={{
            alignSelf: "flex-end",
            color: INK_DIM,
            fontSize: 11,
            marginTop: 4,
            marginRight: 4,
          }}
        >
          Delivered
        </Text>
      ) : null}
    </View>
  );
}

function DateSeparator({ label }: { label: string }) {
  return (
    <View style={{ alignItems: "center", marginTop: 16, marginBottom: 4 }}>
      <Text
        style={{
          color: INK_DIM,
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: 13,
        }}
      >
        — {label} —
      </Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={{ alignItems: "center", paddingTop: 64, paddingHorizontal: 24 }}>
      <Feather name="message-square" size={28} color={INK_DIM} />
      <Text
        style={{
          color: INK_DIM,
          marginTop: 12,
          textAlign: "center",
          fontSize: 14,
        }}
      >
        No messages yet — say hi.
      </Text>
    </View>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  sending,
  onAttach,
  onEmoji,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  onAttach: () => void;
  onEmoji: () => void;
}) {
  const enabled = value.trim().length > 0 && !sending;
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#fbf9f4",
          borderRadius: 999,
          paddingLeft: 14,
          paddingRight: 6,
          paddingVertical: 6,
          shadowColor: INK,
          shadowOpacity: 0.10,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
      >
        <Pressable onPress={onAttach} hitSlop={6} style={{ paddingRight: 10 }}>
          <Feather name="plus" size={22} color={INK_DIM} />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Write a message…"
          placeholderTextColor="#a89b8a"
          multiline
          style={{
            flex: 1,
            color: INK,
            fontSize: 15,
            paddingVertical: Platform.OS === "ios" ? 8 : 4,
            maxHeight: 120,
          }}
        />
        <Pressable onPress={onEmoji} hitSlop={6} style={{ paddingHorizontal: 6 }}>
          <Feather name="smile" size={22} color={INK_DIM} />
        </Pressable>
        <Pressable
          onPress={onSend}
          disabled={!enabled}
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            backgroundColor: enabled ? INK : "#e6e1d5",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: 4,
          }}
        >
          <Feather name="navigation" size={18} color={CREAM} />
        </Pressable>
      </View>
    </View>
  );
}
