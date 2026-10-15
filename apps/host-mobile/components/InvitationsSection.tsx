// "Your invitations" on the Events tab (owner's call, Oct 2026): the
// host's own events (host_events, the same ones as the website's Events
// page), each with its RSVP link. Tap one to customize it, share it and
// see replies; "New invitation" creates one with a name, date, start time
// and place.

import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { C } from "@/lib/theme";
import { DateSheet, Field, Label, SERIF, SERIF_BOLD, parseYmd } from "@/components/InviteParts";

interface Row {
  id: string;
  title: string;
  event_date: string;
  going: number;
}

// "18:30" → step through the day in 15-minute steps.
function stepTime(hhmm: string | null, delta: number): string {
  const [h, m] = (hhmm ?? "18:00").split(":").map(Number);
  const mins = (((h * 60 + m + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function InvitationsSection() {
  const { t, locale } = useT("invites");
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("host_events")
      .select("id, title, event_date")
      .eq("host_id", user.id)
      .order("event_date", { ascending: true });
    const events = (data ?? []) as Omit<Row, "going">[];
    const counts: Record<string, number> = {};
    if (events.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rs } = await (supabase as any)
        .from("host_event_rsvps")
        .select("event_id, plus_ones")
        .in("event_id", events.map((e) => e.id))
        .eq("status", "going");
      for (const r of (rs ?? []) as { event_id: string; plus_ones: number | null }[]) {
        counts[r.event_id] = (counts[r.event_id] ?? 0) + 1 + (r.plus_ones ?? 0);
      }
    }
    setRows(events.map((e) => ({ ...e, going: counts[e.id] ?? 0 })));
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ fontFamily: SERIF_BOLD, fontSize: 20, color: C.text, flexShrink: 1 }}>{t("section")}</Text>
        <Pressable
          onPress={() => setCreating(true)}
          style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.gold, flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Feather name="plus" size={15} color={C.onGold} />
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: C.onGold }}>{t("newInvite")}</Text>
        </Pressable>
      </View>
      <Text style={{ fontFamily: SERIF, fontSize: 13, color: C.textDim, marginBottom: 12 }}>{t("sectionHint")}</Text>
      {rows === null ? (
        <ActivityIndicator color={C.text} />
      ) : rows.length === 0 ? (
        <Text style={{ fontFamily: SERIF, fontSize: 14, color: C.textDim }}>{t("none")}</Text>
      ) : (
        <View style={{ gap: 12 }}>
          {rows.map((r) => {
            const d = parseYmd(r.event_date);
            return (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/(host)/invite/${r.id}` as never)}
                style={({ pressed }) => ({
                  backgroundColor: C.card,
                  borderWidth: 1,
                  borderColor: pressed ? C.text : C.border,
                  borderRadius: 20,
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                })}
              >
                <View
                  style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", marginRight: 12 }}
                >
                  <Feather name="mail" size={18} color={C.accentText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: C.text }}>{r.title}</Text>
                  <Text style={{ fontFamily: SERIF, fontSize: 13, color: C.textDim, marginTop: 2 }}>
                    {d ? d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" }) : r.event_date}
                    {" · "}
                    {t("going", { count: r.going })}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={C.textDim} />
              </Pressable>
            );
          })}
        </View>
      )}

      {creating ? (
        <NewInviteSheet
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            void load();
            router.push(`/(host)/invite/${id}` as never);
          }}
        />
      ) : null}
    </View>
  );
}

function NewInviteSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t, locale } = useT("invites");
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  async function create() {
    if (!user?.id || saving) return;
    if (!title.trim() || !date) {
      Alert.alert(t("nameDateRequired"));
      return;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("host_events")
      .insert({
        host_id: user.id,
        title: title.trim().slice(0, 120),
        event_date: date,
        start_time: time,
        location: location.trim() || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      Alert.alert(t("createFailed"), error?.message);
      return;
    }
    onCreated((data as { id: string }).id);
  }

  const timeLabel = time
    ? new Date(2000, 0, 1, Number(time.slice(0, 2)), Number(time.slice(3))).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
    : t("noTime");
  const dateLabel = date
    ? parseYmd(date)!.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : t("pickDate");

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.page }} edges={["top", "bottom"]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 }}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: C.text }}>{t("cancel")}</Text>
          </Pressable>
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 18, color: C.text }}>{t("newTitle")}</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
          <View>
            <Label text={t("name")} />
            <Field value={title} onChangeText={setTitle} placeholder={t("namePlaceholder")} maxLength={120} />
          </View>
          <View>
            <Label text={t("date")} />
            <Pressable
              onPress={() => setDateOpen(true)}
              style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.field, paddingHorizontal: 14, justifyContent: "center" }}
            >
              <Text style={{ fontFamily: SERIF, fontSize: 15, color: date ? C.text : C.placeholder }}>{dateLabel}</Text>
            </Pressable>
          </View>
          <View>
            <Label text={t("time")} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <StepBtn icon="minus" onPress={() => setTime((v) => stepTime(v, -15))} />
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: C.text, minWidth: 96, textAlign: "center" }}>{timeLabel}</Text>
              <StepBtn icon="plus" onPress={() => setTime((v) => stepTime(v, 15))} />
              {time ? (
                <Pressable onPress={() => setTime(null)} hitSlop={8}>
                  <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: C.accentText }}>{t("invite.clear")}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <View>
            <Label text={t("location")} />
            <Field value={location} onChangeText={setLocation} placeholder={t("locationPlaceholder")} maxLength={200} />
          </View>
          <Pressable
            onPress={create}
            disabled={saving}
            style={{ height: 52, borderRadius: 26, backgroundColor: saving ? C.goldMuted : C.gold, alignItems: "center", justifyContent: "center", marginTop: 8 }}
          >
            {saving ? <ActivityIndicator color={C.onGold} /> : <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: C.onGold }}>{t("create")}</Text>}
          </Pressable>
        </ScrollView>
        <DateSheet
          visible={dateOpen}
          value={date}
          min={today}
          onClose={() => setDateOpen(false)}
          onPick={(d) => {
            setDate(d);
            setDateOpen(false);
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

export function StepBtn({ icon, onPress }: { icon: "minus" | "plus"; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{ width: 40, height: 40, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}
    >
      <Feather name={icon} size={16} color={C.text} />
    </Pressable>
  );
}
