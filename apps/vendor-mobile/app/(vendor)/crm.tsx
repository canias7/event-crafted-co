// Vendora CRM — the Pro-plan "Clients" section, reached from More.
//
// A client is any host who has inquired with one of this vendor's
// listings. The list comes from the vendor_crm_clients() RPC, which is
// gated server-side to Pro+ (raises 'crm_requires_pro' otherwise — the
// screen shows the upgrade view in that case, same pattern as V2V).
// Per client: their events (inquiries), a notes timeline, and one
// follow-up reminder that lands as a push notification when due
// (hourly crm-reminders sweep, clears itself after sending).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Wordmark } from "@/components/Wordmark";
import { useBrandDialog } from "@/components/listing/WizardKit";

const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const SURFACE = "#ece7db";
const BORDER = "#e6e1d5";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const GOLD = "#c9a86a";
const GOLD_SOFT = "#eadfc6";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

interface ClientRow {
  host_id: string;
  host_name: string;
  host_avatar: string | null;
  inquiries_count: number;
  booked_count: number;
  first_inquiry_at: string;
  last_activity_at: string;
  next_event_date: string | null;
  last_event_date: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  notes_count: number;
}

interface EventRow {
  id: string;
  event_type: string | null;
  event_date: string | null;
  guest_count: number | null;
  location: string | null;
  status: string | null;
  created_at: string;
  vendor_confirmed_booked_at: string | null;
  paid_booked_at: string | null;
}

interface NoteRow {
  id: string;
  body: string;
  created_at: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Follow-up quick picks (days from now).
const FOLLOW_UPS: { label: string; days: number }[] = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
  { label: "In 2 weeks", days: 14 },
  { label: "In a month", days: 30 },
];

export default function CrmScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const dialog = useBrandDialog();

  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [listingIds, setListingIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ClientRow | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: rows, error: err }, { data: listings }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("vendor_crm_clients"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("vendor_profiles").select("id").eq("user_id", user.id),
    ]);
    setListingIds(((listings ?? []) as { id: string }[]).map((l) => l.id));
    if (err) {
      setGated(!!err.message?.includes("crm_requires_pro"));
      setClients([]);
    } else {
      setGated(false);
      setClients((rows ?? []) as ClientRow[]);
    }
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.host_name.toLowerCase().includes(q));
  }, [clients, query]);

  if (loading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: PAGE, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (gated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 130 }}
          showsVerticalScrollIndicator={false}
        >
          <Wordmark />
          <Text
            style={{
              marginTop: 26,
              fontFamily: SERIF,
              fontSize: 36,
              fontWeight: "700",
              letterSpacing: -0.5,
              color: INK,
            }}
          >
            Know every client. <Text style={{ color: GOLD, fontSize: 13 }}>✦</Text>
          </Text>
          <Text style={{ marginTop: 8, fontSize: 15, color: INK_DIM, lineHeight: 22 }}>
            Vendora CRM turns your inquiries into a client book — every host
            you've worked with, their events, your notes, and follow-up
            reminders so no lead goes cold.
          </Text>
          <View style={{ marginTop: 24, gap: 14 }}>
            {[
              { icon: "users", text: "Every client in one place, built from your inquiries" },
              { icon: "file-text", text: "Private notes on each client — only you see them" },
              { icon: "bell", text: "Follow-up reminders that ping your phone" },
              { icon: "calendar", text: "Their upcoming and past events at a glance" },
            ].map((row) => (
              <View
                key={row.icon}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: SURFACE,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={row.icon as never} size={17} color={INK} />
                </View>
                <Text style={{ flex: 1, marginLeft: 12, color: INK, fontSize: 14, lineHeight: 19 }}>
                  {row.text}
                </Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => router.push("/(vendor)/subscription" as never)}
            style={{
              marginTop: 26,
              backgroundColor: INK,
              borderRadius: 999,
              paddingVertical: 15,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
              <Text style={{ color: GOLD }}>✦</Text> Upgrade to Pro
            </Text>
          </Pressable>
          <Text style={{ marginTop: 10, textAlign: "center", color: INK_DIM, fontSize: 12 }}>
            Included with Pro and Premium plans.
          </Text>
        </ScrollView>
        {dialog.element}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark />
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="x" size={17} color={INK} />
          </Pressable>
        </View>

        <Text
          style={{
            marginTop: 14,
            fontFamily: SERIF,
            fontSize: 38,
            fontWeight: "700",
            letterSpacing: -0.5,
            color: INK,
          }}
        >
          Clients <Text style={{ color: GOLD, fontSize: 13 }}>✦</Text>
        </Text>
        <Text style={{ marginTop: 4, fontSize: 13.5, lineHeight: 19, color: INK_DIM }}>
          Your client book, built from every inquiry.
        </Text>

        {/* Search */}
        <View
          style={{
            marginTop: 18,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: CARD,
            borderWidth: 1,
            borderColor: BORDER,
            borderRadius: 999,
            paddingHorizontal: 16,
          }}
        >
          <Feather name="search" size={16} color={INK_DIM} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search clients"
            placeholderTextColor={INK_DIM}
            style={{ flex: 1, marginLeft: 9, paddingVertical: 12, fontSize: 15, color: INK }}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Feather name="x-circle" size={16} color={INK_DIM} />
            </Pressable>
          ) : null}
        </View>

        {filtered.length === 0 ? (
          <View
            style={{
              marginTop: 22,
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 20,
              paddingVertical: 44,
              paddingHorizontal: 24,
              alignItems: "center",
            }}
          >
            <MaterialCommunityIcons name="account-heart-outline" size={34} color={GOLD} />
            <Text
              style={{
                marginTop: 12,
                fontFamily: SERIF,
                fontSize: 20,
                fontWeight: "700",
                color: INK,
                textAlign: "center",
              }}
            >
              {query ? "No clients match" : "No clients yet"}
            </Text>
            <Text style={{ marginTop: 6, color: INK_DIM, fontSize: 13.5, textAlign: "center", lineHeight: 19 }}>
              {query
                ? "Try a different name."
                : "As soon as a host sends you an inquiry, they'll appear here with their events, your notes, and follow-ups."}
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 18, gap: 12 }}>
            {filtered.map((c) => {
              const followSoon =
                c.follow_up_at && new Date(c.follow_up_at).getTime() < Date.now() + 86400_000;
              return (
                <Pressable
                  key={c.host_id}
                  onPress={() => setOpen(c)}
                  style={{
                    backgroundColor: CARD,
                    borderWidth: 1,
                    borderColor: BORDER,
                    borderRadius: 20,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  {c.host_avatar ? (
                    <Image
                      source={{ uri: c.host_avatar }}
                      style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: SURFACE }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 999,
                        backgroundColor: SURFACE,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontFamily: SERIF, fontSize: 17, fontWeight: "700", color: INK }}>
                        {initials(c.host_name)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 13 }}>
                    <Text style={{ fontFamily: SERIF, fontSize: 17, fontWeight: "700", color: INK }}>
                      {c.host_name}
                    </Text>
                    <Text style={{ marginTop: 2, color: INK_DIM, fontSize: 12.5 }}>
                      {c.inquiries_count} {c.inquiries_count === 1 ? "inquiry" : "inquiries"}
                      {c.booked_count > 0 ? ` · ${c.booked_count} booked` : ""}
                      {c.notes_count > 0 ? ` · ${c.notes_count} ${c.notes_count === 1 ? "note" : "notes"}` : ""}
                    </Text>
                    {c.next_event_date ? (
                      <Text style={{ marginTop: 3, color: "#8a6f3e", fontSize: 12, fontWeight: "600" }}>
                        Next event {fmtShort(c.next_event_date)}
                      </Text>
                    ) : null}
                  </View>
                  {c.follow_up_at ? (
                    <View
                      style={{
                        backgroundColor: followSoon ? GOLD_SOFT : SURFACE,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        marginRight: 6,
                      }}
                    >
                      <Feather name="bell" size={11} color="#8a6f3e" />
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#8a6f3e" }}>
                        {fmtShort(c.follow_up_at)}
                      </Text>
                    </View>
                  ) : null}
                  <Feather name="chevron-right" size={19} color={INK_DIM} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {open ? (
        <ClientSheet
          client={open}
          listingIds={listingIds}
          onClose={() => setOpen(null)}
          onChanged={() => void load()}
        />
      ) : null}
      {dialog.element}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------
// Client detail sheet: events, notes timeline, follow-up reminder.
// ---------------------------------------------------------------
function ClientSheet({
  client,
  listingIds,
  onClose,
  onChanged,
}: {
  client: ClientRow;
  listingIds: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const dialog = useBrandDialog();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [followUpAt, setFollowUpAt] = useState<string | null>(client.follow_up_at);
  const [savingFollow, setSavingFollow] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: evs }, { data: ns }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("inquiries")
          .select(
            "id, event_type, event_date, guest_count, location, status, created_at, vendor_confirmed_booked_at, paid_booked_at",
          )
          .eq("host_id", client.host_id)
          .in("vendor_id", listingIds.length ? listingIds : ["00000000-0000-0000-0000-000000000000"])
          .order("created_at", { ascending: false })
          .limit(25),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_crm_notes")
          .select("id, body, created_at")
          .eq("host_id", client.host_id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (!alive) return;
      setEvents((evs ?? []) as EventRow[]);
      setNotes((ns ?? []) as NoteRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [client.host_id, listingIds]);

  async function addNote() {
    const body = noteText.trim();
    if (!body || !user?.id || savingNote) return;
    setSavingNote(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase as any)
      .from("vendor_crm_notes")
      .insert({ user_id: user.id, host_id: client.host_id, body })
      .select("id, body, created_at")
      .single();
    setSavingNote(false);
    if (err) {
      dialog.show({ icon: "alert-circle", title: "Couldn't save note", message: err.message });
      return;
    }
    setNotes((prev) => [data as NoteRow, ...prev]);
    setNoteText("");
    onChanged();
  }

  function removeNote(n: NoteRow) {
    dialog.show({
      icon: "trash-2",
      title: "Delete this note?",
      message: "It'll be gone for good.",
      confirmLabel: "Delete",
      cancelLabel: "Keep",
      destructive: true,
      onConfirm: () => {
        void (async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("vendor_crm_notes").delete().eq("id", n.id);
          setNotes((prev) => prev.filter((x) => x.id !== n.id));
          onChanged();
        })();
      },
    });
  }

  async function setFollowUp(days: number | null) {
    if (!user?.id || savingFollow) return;
    setSavingFollow(true);
    const at =
      days === null ? null : new Date(Date.now() + days * 86400_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from("vendor_crm_meta").upsert(
      {
        user_id: user.id,
        host_id: client.host_id,
        follow_up_at: at,
        follow_up_note: at ? `Follow up with ${client.host_name}.` : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,host_id" },
    );
    setSavingFollow(false);
    if (err) {
      dialog.show({ icon: "alert-circle", title: "Couldn't set reminder", message: err.message });
      return;
    }
    setFollowUpAt(at);
    onChanged();
  }

  async function openConversation() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("direct_threads")
      .select("id")
      .eq("host_id", client.host_id)
      .in("vendor_id", listingIds.length ? listingIds : ["00000000-0000-0000-0000-000000000000"])
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const threadId = (data as { id?: string } | null)?.id;
    if (!threadId) {
      dialog.show({
        icon: "message-circle",
        title: "No conversation yet",
        message:
          "You don't have a message thread with this client yet — reply to one of their inquiries from the Inbox to start one.",
      });
      return;
    }
    onClose();
    router.push(`/(vendor)/thread/${threadId}` as never);
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {client.host_avatar ? (
              <Image
                source={{ uri: client.host_avatar }}
                style={{ width: 56, height: 56, borderRadius: 999, backgroundColor: SURFACE }}
              />
            ) : (
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  backgroundColor: SURFACE,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: SERIF, fontSize: 19, fontWeight: "700", color: INK }}>
                  {initials(client.host_name)}
                </Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 13 }}>
              <Text style={{ fontFamily: SERIF, fontSize: 23, fontWeight: "700", color: INK }}>
                {client.host_name}
              </Text>
              <Text style={{ marginTop: 2, color: INK_DIM, fontSize: 12.5 }}>
                Client since {fmtDate(client.first_inquiry_at)}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="x" size={16} color={INK} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => void openConversation()}
            style={{
              marginTop: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: INK,
              borderRadius: 999,
              paddingVertical: 13,
            }}
          >
            <Feather name="message-circle" size={15} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 14.5, fontWeight: "700" }}>Message</Text>
          </Pressable>

          {/* Follow-up reminder */}
          <Text style={sectionTitleStyle}>
            Follow-up reminder <Text style={{ color: GOLD }}>✦</Text>
          </Text>
          {followUpAt ? (
            <View
              style={{
                backgroundColor: "#f3ecdd",
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                borderRadius: 16,
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Feather name="bell" size={16} color="#8a6f3e" />
              <Text style={{ flex: 1, marginLeft: 10, color: "#8a6f3e", fontSize: 13.5, fontWeight: "600" }}>
                We'll ping you on {fmtDate(followUpAt)}.
              </Text>
              <Pressable onPress={() => void setFollowUp(null)} hitSlop={8} disabled={savingFollow}>
                <Text style={{ color: INK_DIM, fontSize: 12.5, fontWeight: "700" }}>Clear</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {FOLLOW_UPS.map((f) => (
                <Pressable
                  key={f.days}
                  onPress={() => void setFollowUp(f.days)}
                  disabled={savingFollow}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: SURFACE,
                    opacity: savingFollow ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK }}>{f.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Notes */}
          <Text style={sectionTitleStyle}>
            Notes <Text style={{ color: GOLD }}>✦</Text>
          </Text>
          <View
            style={{
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 16,
              padding: 12,
            }}
          >
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Add a private note — pricing, preferences, kids' names…"
              placeholderTextColor={INK_DIM}
              multiline
              style={{ minHeight: 60, fontSize: 14, color: INK, textAlignVertical: "top" }}
            />
            <Pressable
              onPress={() => void addNote()}
              disabled={!noteText.trim() || savingNote}
              style={{
                marginTop: 8,
                alignSelf: "flex-end",
                backgroundColor: noteText.trim() ? INK : SURFACE,
                borderRadius: 999,
                paddingHorizontal: 16,
                paddingVertical: 9,
              }}
            >
              {savingNote ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: noteText.trim() ? "#fff" : INK_DIM,
                  }}
                >
                  Save note
                </Text>
              )}
            </Pressable>
          </View>
          {notes.map((n) => (
            <View
              key={n.id}
              style={{
                marginTop: 10,
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 16,
                padding: 14,
              }}
            >
              <Text style={{ color: INK, fontSize: 14, lineHeight: 20 }}>{n.body}</Text>
              <View
                style={{
                  marginTop: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: INK_DIM, fontSize: 11.5 }}>{fmtDate(n.created_at)}</Text>
                <Pressable onPress={() => removeNote(n)} hitSlop={8}>
                  <Feather name="trash-2" size={14} color={INK_DIM} />
                </Pressable>
              </View>
            </View>
          ))}

          {/* Events */}
          <Text style={sectionTitleStyle}>
            Events <Text style={{ color: GOLD }}>✦</Text>
          </Text>
          {events.length === 0 ? (
            <Text style={{ color: INK_DIM, fontSize: 13.5 }}>No inquiries on record yet.</Text>
          ) : (
            events.map((e) => {
              const booked =
                e.status === "won" || !!e.vendor_confirmed_booked_at || !!e.paid_booked_at;
              return (
                <View
                  key={e.id}
                  style={{
                    marginBottom: 10,
                    backgroundColor: CARD,
                    borderWidth: 1,
                    borderColor: BORDER,
                    borderRadius: 16,
                    padding: 14,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: SERIF,
                        fontSize: 16,
                        fontWeight: "700",
                        color: INK,
                      }}
                    >
                      {e.event_type?.trim() || "Event inquiry"}
                    </Text>
                    <View
                      style={{
                        backgroundColor: booked ? INK : SURFACE,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: booked ? "#fff" : INK_DIM,
                        }}
                      >
                        {booked ? "Booked" : "Inquiry"}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ marginTop: 4, color: INK_DIM, fontSize: 12.5 }}>
                    {[
                      e.event_date ? fmtDate(e.event_date) : null,
                      e.guest_count ? `${e.guest_count} guests` : null,
                      e.location?.trim() || null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || `Received ${fmtDate(e.created_at)}`}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
        {dialog.element}
      </SafeAreaView>
    </Modal>
  );
}

const sectionTitleStyle = {
  marginTop: 26,
  marginBottom: 10,
  fontFamily: SERIF,
  fontSize: 20,
  fontWeight: "700" as const,
  color: INK,
};
