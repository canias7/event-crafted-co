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
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { eventTypeLabel } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Wordmark } from "@/components/Wordmark";
import { useBrandDialog } from "@/components/listing/WizardKit";
import { PLANS_PAUSED } from "@/lib/plans";
import { intlLocale, useT } from "@/lib/i18n";

const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const SURFACE = "#ece7db";
const BORDER = "#e6e1d5";
const INK = "#14161a";
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = "#14161a";
const PLACEHOLDER = "#746a58";
const GOLD = "#c9a86a";
const GOLD_SOFT = "#f2e7cb";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

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
  return d.toLocaleDateString(intlLocale(), { month: "short", day: "numeric", year: "numeric" });
}

function fmtShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(intlLocale(), { month: "short", day: "numeric" });
}

// Follow-up quick picks (days from now); labels are crm.followUps.<key>.
const FOLLOW_UPS: { key: string; days: number }[] = [
  { key: "tomorrow", days: 1 },
  { key: "in3Days", days: 3 },
  { key: "nextWeek", days: 7 },
  { key: "in2Weeks", days: 14 },
  { key: "inAMonth", days: 30 },
];

// Event types are stored in English ("holiday_dinner"); show the known
// ones in the app's language and fall back to the core label.
const KNOWN_EVENT_TYPES = ["wedding", "birthday", "holiday_dinner", "other"];

export default function CrmScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const dialog = useBrandDialog();
  const { t } = useT("crm");

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
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 132 }}
          showsVerticalScrollIndicator={false}
        >
          <Wordmark />
          <Text
            style={{
              marginTop: 28,
              fontFamily: SERIF_BOLD,
              fontSize: 38,
              letterSpacing: -0.5,
              color: INK,
            }}
          >
            {t("gate.title")}
          </Text>
          <Text style={{ fontFamily: SERIF, marginTop: 8, fontSize: 15, color: INK_DIM, lineHeight: 22 }}>
            {t("gate.body")}
          </Text>
          <View style={{ marginTop: 24, gap: 12 }}>
            {[
              { icon: "users", text: t("gate.features.clients") },
              { icon: "file-text", text: t("gate.features.notes") },
              { icon: "bell", text: t("gate.features.reminders") },
              { icon: "calendar", text: t("gate.features.events") },
            ].map((row) => (
              <View
                key={row.icon}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: 16,
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
                <Text style={{ fontFamily: SERIF, flex: 1, marginLeft: 12, color: INK, fontSize: 14, lineHeight: 19 }}>
                  {row.text}
                </Text>
              </View>
            ))}
          </View>
          {/* Plans paused (lib/plans.ts): no upgrade button. */}
          {!PLANS_PAUSED ? (
          <Pressable
            onPress={() => router.push("/(vendor)/subscription" as never)}
            style={{
              marginTop: 28,
              backgroundColor: GOLD,
              borderRadius: 999,
              height: 52,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 15}}>
              {t("gate.upgrade")}
            </Text>
          </Pressable>
          ) : null}
          <Text
            style={{
              fontFamily: SERIF,
              marginTop: PLANS_PAUSED ? 24 : 10,
              textAlign: "center",
              color: INK_DIM,
              fontSize: PLANS_PAUSED ? 14 : 12,
            }}
          >
            {PLANS_PAUSED
              ? t("gate.paused")
              : t("gate.included")}
          </Text>
        </ScrollView>
        {dialog.element}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 132 }}
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
            marginTop: 16,
            fontFamily: SERIF_BOLD,
            fontSize: 38,
            letterSpacing: -0.5,
            color: INK,
          }}
        >
          {t("title")}
        </Text>
        <Text style={{ fontFamily: SERIF, marginTop: 4, fontSize: 13, lineHeight: 19, color: INK_DIM }}>
          {t("subtitle")}
        </Text>

        {/* Search */}
        <View
          style={{
            marginTop: 20,
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
            placeholder={t("searchPlaceholder")}
            placeholderTextColor={PLACEHOLDER}
            style={{ fontFamily: SERIF, flex: 1, marginLeft: 9, paddingVertical: 12, fontSize: 15, color: INK }}
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
              marginTop: 24,
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
                fontFamily: SERIF_BOLD,
                fontSize: 20,
                color: INK,
                textAlign: "center",
              }}
            >
              {query ? t("empty.noMatchTitle") : t("empty.title")}
            </Text>
            <Text style={{ fontFamily: SERIF, marginTop: 6, color: INK_DIM, fontSize: 13, textAlign: "center", lineHeight: 19 }}>
              {query
                ? t("empty.noMatchBody")
                : t("empty.body")}
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 20, gap: 12 }}>
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
                      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 16, color: INK }}>
                        {initials(c.host_name)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 16, color: INK }}>
                      {c.host_name}
                    </Text>
                    <Text style={{ fontFamily: SERIF, marginTop: 2, color: INK_DIM, fontSize: 13 }}>
                      {t("row.inquiries", { count: c.inquiries_count })}
                      {c.booked_count > 0 ? ` · ${t("row.booked", { count: c.booked_count })}` : ""}
                      {c.notes_count > 0 ? ` · ${t("row.notes", { count: c.notes_count })}` : ""}
                    </Text>
                    {c.next_event_date ? (
                      <Text style={{ fontFamily: SERIF_BOLD, marginTop: 3, color: "#8a6f3e", fontSize: 12}}>
                        {t("row.nextEvent", { date: fmtShort(c.next_event_date) })}
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
                      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 11, color: "#8a6f3e" }}>
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
  const { t } = useT("crm");
  const eventLabel = (type: string | null) => {
    const k = type?.trim();
    if (k && KNOWN_EVENT_TYPES.includes(k)) return t(`eventTypes.${k}`);
    return eventTypeLabel(type, t("sheet.eventInquiry"));
  };

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
      dialog.show({ icon: "alert-circle", title: t("sheet.noteFailed"), message: err.message });
      return;
    }
    setNotes((prev) => [data as NoteRow, ...prev]);
    setNoteText("");
    onChanged();
  }

  function removeNote(n: NoteRow) {
    dialog.show({
      icon: "trash-2",
      title: t("sheet.deleteNote.title"),
      message: t("sheet.deleteNote.body"),
      confirmLabel: t("sheet.deleteNote.confirm"),
      cancelLabel: t("sheet.deleteNote.keep"),
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
      dialog.show({ icon: "alert-circle", title: t("sheet.reminderFailed"), message: err.message });
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
        title: t("sheet.noThread.title"),
        message: t("sheet.noThread.body"),
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
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 18, color: INK }}>
                  {initials(client.host_name)}
                </Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 24, color: INK }}>
                {client.host_name}
              </Text>
              <Text style={{ fontFamily: SERIF, marginTop: 2, color: INK_DIM, fontSize: 13 }}>
                {t("sheet.clientSince", { date: fmtDate(client.first_inquiry_at) })}
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
              backgroundColor: GOLD,
              borderRadius: 999,
              height: 44,
            }}
          >
            <Feather name="message-circle" size={15} color={INK} />
            <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 14}}>{t("sheet.message")}</Text>
          </Pressable>

          {/* Follow-up reminder */}
          <Text style={sectionTitleStyle}>
            {t("sheet.followUpTitle")}
          </Text>
          {followUpAt ? (
            <View
              style={{
                backgroundColor: "#f2e7cb",
                borderWidth: 1,
                borderColor: GOLD,
                borderRadius: 20,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Feather name="bell" size={16} color="#8a6f3e" />
              <Text style={{ fontFamily: SERIF_BOLD, flex: 1, marginLeft: 10, color: "#8a6f3e", fontSize: 13}}>
                {t("sheet.followUpSet", { date: fmtDate(followUpAt) })}
              </Text>
              <Pressable onPress={() => void setFollowUp(null)} hitSlop={8} disabled={savingFollow}>
                <Text style={{ fontFamily: SERIF_BOLD, color: INK_DIM, fontSize: 13}}>{t("sheet.clear")}</Text>
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
                    paddingHorizontal: 16,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: SURFACE,
                    opacity: savingFollow ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>{t(`followUps.${f.key}`)}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Notes */}
          <Text style={sectionTitleStyle}>
            {t("sheet.notesTitle")}
          </Text>
          <View
            style={{
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 20,
              padding: 16,
            }}
          >
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder={t("sheet.notePlaceholder")}
              placeholderTextColor={PLACEHOLDER}
              multiline
              style={{ fontFamily: SERIF, minHeight: 60, fontSize: 14, color: INK, textAlignVertical: "top" }}
            />
            <Pressable
              onPress={() => void addNote()}
              disabled={!noteText.trim() || savingNote}
              style={{
                marginTop: 8,
                alignSelf: "flex-end",
                backgroundColor: noteText.trim() ? GOLD : "#e0d2b0",
                borderRadius: 999,
                paddingHorizontal: 16,
                height: 36,
                justifyContent: "center",
              }}
            >
              {savingNote ? (
                <ActivityIndicator size="small" color={INK} />
              ) : (
                <Text
                  style={{
                    fontFamily: SERIF_BOLD,
                    fontSize: 13,
                    color: INK_DIM,
                  }}
                >
                  {t("sheet.saveNote")}
                </Text>
              )}
            </Pressable>
          </View>
          {notes.map((n) => (
            <View
              key={n.id}
              style={{
                marginTop: 12,
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 20,
                padding: 16,
              }}
            >
              <Text style={{ fontFamily: SERIF, color: INK, fontSize: 14, lineHeight: 20 }}>{n.body}</Text>
              <View
                style={{
                  marginTop: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 12 }}>{fmtDate(n.created_at)}</Text>
                <Pressable onPress={() => removeNote(n)} hitSlop={8}>
                  <Feather name="trash-2" size={14} color={INK_DIM} />
                </Pressable>
              </View>
            </View>
          ))}

          {/* Events */}
          <Text style={sectionTitleStyle}>
            {t("sheet.eventsTitle")}
          </Text>
          {events.length === 0 ? (
            <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 13 }}>{t("sheet.noEvents")}</Text>
          ) : (
            events.map((e) => {
              const booked =
                e.status === "won" || !!e.vendor_confirmed_booked_at || !!e.paid_booked_at;
              return (
                <View
                  key={e.id}
                  style={{
                    marginBottom: 12,
                    backgroundColor: CARD,
                    borderWidth: 1,
                    borderColor: BORDER,
                    borderRadius: 20,
                    padding: 16,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: SERIF_BOLD,
                        fontSize: 16,
                        color: INK,
                      }}
                    >
                      {eventLabel(e.event_type)}
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
                          fontFamily: SERIF_BOLD,
                          fontSize: 11,
                          color: booked ? "#fff" : INK_DIM,
                        }}
                      >
                        {booked ? t("sheet.status.booked") : t("sheet.status.inquiry")}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: SERIF, marginTop: 4, color: INK_DIM, fontSize: 13 }}>
                    {[
                      e.event_date ? fmtDate(e.event_date) : null,
                      e.guest_count ? t("sheet.guests", { count: e.guest_count }) : null,
                      e.location?.trim() || null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || t("sheet.received", { date: fmtDate(e.created_at) })}
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
  marginTop: 24,
  marginBottom: 10,
  fontFamily: SERIF_BOLD,
  fontSize: 20,
  color: INK,
};
