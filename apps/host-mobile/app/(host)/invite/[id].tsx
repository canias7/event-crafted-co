// One invitation (owner's call, Oct 2026), the app twin of the website's
// Invitation and Replies windows. Five tabs:
//   Design    — a ready-made design for the occasion, or colours, lettering,
//               decoration and a frame (lib/inviteDesign.ts); "Save and
//               preview" opens the real guest page
//   Look      — event name, date and place; card or photo layout;
//               welcome message (cover photos are added on the website:
//               the app has no photo picker yet)
//   Questions — plus-ones, meal choices, dietary needs, song request,
//               up to 5 questions of the host's own
//   Rules     — reply-by date, guest limit, whether guests see the counts
//   Replies   — totals, meal tally and every reply with its answers
// "Share invite" sends the /rsvp link through the phone's share sheet.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/i18n";
import { C } from "@/lib/theme";
import { Chip, DateSheet, Field, Label, SERIF, SERIF_BOLD, SwitchRow, parseYmd } from "@/components/InviteParts";
import { StepBtn } from "@/components/InvitationsSection";
import {
  FONT_KEYS,
  OCCASION_KEYS,
  OCCASIONS,
  ORNAMENT_KEYS,
  PALETTE_KEYS,
  PALETTES,
  isDarkDesign,
  readDesign,
  swatch,
  type InviteDesign,
} from "@/lib/inviteDesign";

type Style = "classic" | "evening" | "photo";
interface Question {
  id: string;
  label: string;
}
interface EventRow {
  id: string;
  title: string;
  event_date: string;
  location: string | null;
  share_token: string;
  invite_style: Style;
  invite_cover_url: string | null;
  invite_message: string | null;
  invite_design: InviteDesign;
  rsvp_deadline: string | null;
  rsvp_guest_limit: number | null;
  rsvp_show_counts: boolean;
  rsvp_plus_ones_max: number;
  rsvp_meal_options: string[];
  rsvp_ask_dietary: boolean;
  rsvp_ask_song: boolean;
  rsvp_questions: Question[];
}
interface Reply {
  id: string;
  name: string;
  email: string | null;
  status: "going" | "maybe" | "not_going";
  plus_ones: number;
  meal_choice: string | null;
  dietary: string | null;
  song_request: string | null;
  answers: Record<string, string>;
}

const COLUMNS =
  "id, title, event_date, location, share_token, invite_style, invite_cover_url, invite_message, invite_design, rsvp_deadline, rsvp_guest_limit, rsvp_show_counts, rsvp_plus_ones_max, rsvp_meal_options, rsvp_ask_dietary, rsvp_ask_song, rsvp_questions";
const TABS = ["design", "look", "questions", "rules", "replies"] as const;
type Tab = (typeof TABS)[number];

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useT("invites");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Sits just above the floating tab bar (64 tall, max(inset, 12) up).
  const saveBottom = Math.max(insets.bottom, 12) + 64 + 12;
  const [ev, setEv] = useState<EventRow | null>(null);
  const [tab, setTab] = useState<Tab>("design");
  const [limitText, setLimitText] = useState("");
  const [newMeal, setNewMeal] = useState("");
  const [dateOpen, setDateOpen] = useState<null | "event" | "deadline">(null);
  const [saving, setSaving] = useState(false);
  const [replies, setReplies] = useState<Reply[] | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("host_events").select(COLUMNS).eq("id", id).maybeSingle();
    if (data) {
      const row = data as EventRow;
      setEv({
        ...row,
        invite_design: readDesign(row.invite_design, row.invite_style),
        rsvp_meal_options: row.rsvp_meal_options ?? [],
        rsvp_questions: row.rsvp_questions ?? [],
      });
      setLimitText(row.rsvp_guest_limit ? String(row.rsvp_guest_limit) : "");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== "replies" || !id) return;
    setReplies(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any)
      .from("host_event_rsvps")
      .select("id, name, email, status, plus_ones, meal_choice, dietary, song_request, answers")
      .eq("event_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }: { data: Reply[] | null }) => setReplies(data ?? []));
  }, [tab, id]);

  const set = <K extends keyof EventRow>(k: K, v: EventRow[K]) => setEv((p) => (p ? { ...p, [k]: v } : p));

  // Returns whether it saved; "Save and preview" opens the page after.
  async function save(quiet = false): Promise<boolean> {
    if (!ev || saving) return false;
    const limit = limitText.trim() ? parseInt(limitText, 10) : null;
    if (limit !== null && (!Number.isFinite(limit) || limit < 1 || limit > 5000)) {
      Alert.alert(t("invite.limitInvalid"));
      return false;
    }
    if (!ev.title.trim()) {
      Alert.alert(t("nameDateRequired"));
      return false;
    }
    setSaving(true);
    const patch = {
      title: ev.title.trim().slice(0, 120),
      event_date: ev.event_date,
      location: ev.location?.trim() || null,
      // invite_style keeps the layout, plus light or dark for older screens.
      invite_style:
        ev.invite_style === "photo" && ev.invite_cover_url ? "photo" : isDarkDesign(ev.invite_design) ? "evening" : "classic",
      invite_design: ev.invite_design,
      invite_message: ev.invite_message?.trim() ? ev.invite_message.trim().slice(0, 1000) : null,
      rsvp_deadline: ev.rsvp_deadline,
      rsvp_guest_limit: limit,
      rsvp_show_counts: ev.rsvp_show_counts,
      rsvp_plus_ones_max: ev.rsvp_plus_ones_max,
      rsvp_meal_options: ev.rsvp_meal_options,
      rsvp_ask_dietary: ev.rsvp_ask_dietary,
      rsvp_ask_song: ev.rsvp_ask_song,
      rsvp_questions: ev.rsvp_questions
        .map((q) => ({ id: q.id, label: q.label.trim().slice(0, 200) }))
        .filter((q) => q.label),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("host_events").update(patch).eq("id", ev.id);
    setSaving(false);
    if (error) {
      Alert.alert(t("invite.saveFailed"), error.message);
      return false;
    }
    if (!quiet) Alert.alert(t("invite.saved"));
    return true;
  }

  async function saveAndPreview() {
    if (!ev) return;
    if (await save(true)) void Linking.openURL(`https://eventvendora.com/rsvp/${ev.share_token}`);
  }

  const setDesign = (patch: Partial<InviteDesign>) =>
    setEv((p) => (p ? { ...p, invite_design: { ...p.invite_design, ...patch } } : p));

  async function share() {
    if (!ev) return;
    const url = `https://eventvendora.com/rsvp/${ev.share_token}`;
    await Share.share({ message: t("shareMessage", { title: ev.title, url }), url }).catch(() => {});
  }

  const totals = useMemo(() => {
    const r = replies ?? [];
    const going = r.filter((x) => x.status === "going");
    const meals: Record<string, number> = {};
    for (const x of going) if (x.meal_choice) meals[x.meal_choice] = (meals[x.meal_choice] ?? 0) + 1;
    return {
      people: going.reduce((n, x) => n + 1 + (x.plus_ones ?? 0), 0),
      maybe: r.filter((x) => x.status === "maybe").length,
      no: r.filter((x) => x.status === "not_going").length,
      meals,
    };
  }, [replies]);

  if (!ev) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.page, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.text} />
      </SafeAreaView>
    );
  }

  const fmtDate = (s: string | null) =>
    s ? parseYmd(s)!.toLocaleDateString(locale, { weekday: "short", month: "long", day: "numeric", year: "numeric" }) : "";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.page }} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Feather name="chevron-left" size={26} color={C.text} />
          </Pressable>
          <Text numberOfLines={1} style={{ flex: 1, marginHorizontal: 8, fontFamily: SERIF_BOLD, fontSize: 18, color: C.text }}>
            {ev.title}
          </Text>
          <Pressable
            onPress={share}
            style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Feather name="share" size={14} color={C.text} />
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: C.text }}>{t("share")}</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 8 }}>
          {TABS.map((k) => (
            <Chip key={k} label={t(`tabs.${k}`)} on={tab === k} onPress={() => setTab(k)} />
          ))}
        </ScrollView>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: saveBottom + 72, gap: 20 }} keyboardShouldPersistTaps="handled">
          {tab === "design" ? (
            <>
              <View>
                <Label text={t("invite.occasion")} hint={t("invite.occasionHint")} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {OCCASION_KEYS.map((k) => {
                    const o = OCCASIONS[k];
                    const d = ev.invite_design;
                    const on = d.palette === o.palette && d.font === o.font && d.ornament === o.ornament && d.frame === o.frame;
                    const sw = PALETTES[o.palette as keyof typeof PALETTES];
                    return (
                      <Pressable
                        key={k}
                        onPress={() => setDesign({ ...o, bg: undefined, accent: undefined })}
                        style={{ width: "48%", flexGrow: 1, borderRadius: 12, borderWidth: 1, borderColor: on ? C.text : C.border, backgroundColor: C.card, padding: 8 }}
                      >
                        <View style={{ height: 36, borderRadius: 8, backgroundColor: sw.bg, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" }}>
                          <View style={{ width: 8, height: 8, backgroundColor: sw.accent, transform: [{ rotate: "45deg" }] }} />
                        </View>
                        <Text style={{ fontFamily: SERIF_BOLD, fontSize: 12, color: C.text, marginTop: 6 }}>{t(`invite.occasions.${k}`)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View>
                <Label text={t("invite.colours")} hint={ev.invite_design.palette === "custom" ? t("customOnWeb") : undefined} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 12 }}>
                  {[...PALETTE_KEYS, ...(ev.invite_design.palette === "custom" ? (["custom"] as const) : [])].map((k) => {
                    const on = ev.invite_design.palette === k;
                    const sw = k === "custom" ? swatch(ev.invite_design) : PALETTES[k];
                    return (
                      <Pressable key={k} onPress={() => setDesign({ palette: k })} style={{ width: "25%", alignItems: "center" }}>
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: sw.bg,
                            borderWidth: on ? 2 : 1,
                            borderColor: on ? C.text : C.border,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: sw.accent }} />
                        </View>
                        <Text
                          numberOfLines={2}
                          style={{ fontFamily: on ? SERIF_BOLD : SERIF, fontSize: 11, color: C.text, marginTop: 4, textAlign: "center" }}
                        >
                          {t(`invite.palettes.${k}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View>
                <Label text={t("invite.lettering")} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {FONT_KEYS.map((k) => (
                    <Chip key={k} label={t(`invite.fonts.${k}`)} on={ev.invite_design.font === k} onPress={() => setDesign({ font: k })} />
                  ))}
                </View>
              </View>

              <View>
                <Label text={t("invite.decoration")} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {ORNAMENT_KEYS.map((k) => (
                    <Chip
                      key={k}
                      label={t(`invite.ornaments.${k}`)}
                      on={ev.invite_design.ornament === k}
                      onPress={() => setDesign({ ornament: k })}
                    />
                  ))}
                </View>
              </View>

              <SwitchRow
                label={t("invite.frame")}
                hint={t("invite.frameHint")}
                value={ev.invite_design.frame}
                onChange={(v) => setDesign({ frame: v })}
              />

              <Pressable
                onPress={() => void saveAndPreview()}
                disabled={saving}
                style={{
                  height: 44,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: C.border,
                  backgroundColor: C.card,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Feather name="external-link" size={15} color={C.text} />
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: C.text }}>{t("savePreview")}</Text>
              </Pressable>
            </>
          ) : null}

          {tab === "look" ? (
            <>
              <View>
                <Label text={t("details")} />
                <View style={{ gap: 10 }}>
                  <Field value={ev.title} onChangeText={(v) => set("title", v)} maxLength={120} placeholder={t("namePlaceholder")} />
                  <Pressable
                    onPress={() => setDateOpen("event")}
                    style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.field, paddingHorizontal: 14, justifyContent: "center" }}
                  >
                    <Text style={{ fontFamily: SERIF, fontSize: 15, color: C.text }}>{fmtDate(ev.event_date)}</Text>
                  </Pressable>
                  <Field value={ev.location ?? ""} onChangeText={(v) => set("location", v)} maxLength={200} placeholder={t("locationPlaceholder")} />
                </View>
              </View>
              <View>
                <Label text={t("invite.layout")} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["card", "photo"] as const).map((l) => {
                    const on = l === "photo" ? ev.invite_style === "photo" : ev.invite_style !== "photo";
                    return (
                      <Pressable
                        key={l}
                        onPress={() => set("invite_style", l === "photo" ? "photo" : "classic")}
                        style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: on ? C.text : C.border, backgroundColor: C.card, padding: 12 }}
                      >
                        <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: C.text }}>{t(`invite.layouts.${l}`)}</Text>
                        <Text style={{ fontFamily: SERIF, fontSize: 11, color: C.textDim, marginTop: 2 }}>{t(`invite.layoutHints.${l}`)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View>
                <Label text={t("invite.cover")} hint={t("coverOnWeb")} />
                {ev.invite_cover_url ? (
                  <Image source={{ uri: ev.invite_cover_url }} style={{ width: "100%", aspectRatio: 3 / 2, borderRadius: 12 }} />
                ) : (
                  <Text style={{ fontFamily: SERIF, fontSize: 13, color: C.textDim }}>{t("noCover")}</Text>
                )}
                {ev.invite_style === "photo" && !ev.invite_cover_url ? (
                  <Text style={{ fontFamily: SERIF, fontSize: 12, color: C.accentText, marginTop: 6 }}>{t("invite.photoNeedsCover")}</Text>
                ) : null}
              </View>
              <View>
                <Label text={t("invite.message")} />
                <Field
                  value={ev.invite_message ?? ""}
                  onChangeText={(v) => set("invite_message", v)}
                  multiline
                  maxLength={1000}
                  placeholder={t("invite.messagePlaceholder")}
                />
              </View>
            </>
          ) : null}

          {tab === "questions" ? (
            <>
              <Text style={{ fontFamily: SERIF, fontSize: 13, lineHeight: 19, color: C.textDim }}>{t("invite.alwaysAsked")}</Text>
              <View>
                <Label text={t("invite.plusOnes")} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <Chip
                      key={n}
                      label={n === 0 ? t("invite.plusOff") : `+${n}`}
                      on={ev.rsvp_plus_ones_max === n}
                      onPress={() => set("rsvp_plus_ones_max", n)}
                    />
                  ))}
                </View>
              </View>
              <View>
                <Label text={t("invite.meals")} hint={t("invite.mealsHint")} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  {ev.rsvp_meal_options.map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => set("rsvp_meal_options", ev.rsvp_meal_options.filter((x) => x !== m))}
                      accessibilityLabel={t("invite.removeOption", { name: m })}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.surface }}
                    >
                      <Text style={{ fontFamily: SERIF, fontSize: 13, color: C.text }}>{m}</Text>
                      <Feather name="x" size={13} color={C.text} />
                    </Pressable>
                  ))}
                </View>
                {ev.rsvp_meal_options.length < 8 ? (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Field
                      style={{ flex: 1 }}
                      value={newMeal}
                      onChangeText={setNewMeal}
                      maxLength={60}
                      placeholder={t("invite.mealPlaceholder")}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        const v = newMeal.trim();
                        if (v && !ev.rsvp_meal_options.includes(v)) set("rsvp_meal_options", [...ev.rsvp_meal_options, v]);
                        setNewMeal("");
                      }}
                    />
                    <Pressable
                      onPress={() => {
                        const v = newMeal.trim();
                        if (v && !ev.rsvp_meal_options.includes(v)) set("rsvp_meal_options", [...ev.rsvp_meal_options, v]);
                        setNewMeal("");
                      }}
                      style={{ height: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, justifyContent: "center" }}
                    >
                      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: C.text }}>{t("invite.add")}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              <SwitchRow label={t("invite.askDietary")} value={ev.rsvp_ask_dietary} onChange={(v) => set("rsvp_ask_dietary", v)} />
              <SwitchRow label={t("invite.askSong")} value={ev.rsvp_ask_song} onChange={(v) => set("rsvp_ask_song", v)} />
              <View>
                <Label text={t("invite.ownQuestions")} hint={t("invite.ownQuestionsHint", { count: 5 })} />
                <View style={{ gap: 8 }}>
                  {ev.rsvp_questions.map((q) => (
                    <View key={q.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Field
                        style={{ flex: 1 }}
                        value={q.label}
                        maxLength={200}
                        placeholder={t("invite.questionPlaceholder")}
                        onChangeText={(v) =>
                          set("rsvp_questions", ev.rsvp_questions.map((x) => (x.id === q.id ? { ...x, label: v } : x)))
                        }
                      />
                      <Pressable
                        onPress={() => set("rsvp_questions", ev.rsvp_questions.filter((x) => x.id !== q.id))}
                        hitSlop={8}
                        accessibilityLabel={t("invite.removeQuestion")}
                      >
                        <Feather name="trash-2" size={17} color={C.error} />
                      </Pressable>
                    </View>
                  ))}
                </View>
                {ev.rsvp_questions.length < 5 ? (
                  <Pressable
                    onPress={() => set("rsvp_questions", [...ev.rsvp_questions, { id: newId(), label: "" }])}
                    style={{ marginTop: 10, alignSelf: "flex-start", height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <Feather name="plus" size={14} color={C.text} />
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: C.text }}>{t("invite.addQuestion")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}

          {tab === "rules" ? (
            <>
              <View>
                <Label text={t("invite.deadline")} hint={t("invite.deadlineHint")} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Pressable
                    onPress={() => setDateOpen("deadline")}
                    style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.field, paddingHorizontal: 14, justifyContent: "center" }}
                  >
                    <Text style={{ fontFamily: SERIF, fontSize: 15, color: ev.rsvp_deadline ? C.text : C.placeholder }}>
                      {ev.rsvp_deadline ? fmtDate(ev.rsvp_deadline) : t("noDeadline")}
                    </Text>
                  </Pressable>
                  {ev.rsvp_deadline ? (
                    <Pressable onPress={() => set("rsvp_deadline", null)} hitSlop={8}>
                      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: C.accentText }}>{t("invite.clear")}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <View>
                <Label text={t("invite.limit")} hint={t("invite.limitHint")} />
                <Field
                  value={limitText}
                  onChangeText={(v) => setLimitText(v.replace(/[^0-9]/g, "").slice(0, 4))}
                  keyboardType="number-pad"
                  placeholder={t("invite.limitPlaceholder")}
                />
              </View>
              <SwitchRow
                label={t("invite.showCounts")}
                hint={t("invite.showCountsHint")}
                value={ev.rsvp_show_counts}
                onChange={(v) => set("rsvp_show_counts", v)}
              />
            </>
          ) : null}

          {tab === "replies" ? (
            replies === null ? (
              <ActivityIndicator color={C.text} />
            ) : (
              <>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    [totals.people, t("replies.coming", { count: totals.people })],
                    [totals.maybe, t("replies.maybe", { count: totals.maybe })],
                    [totals.no, t("replies.no", { count: totals.no })],
                  ].map(([n, label], i) => (
                    <View key={i} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 12, alignItems: "center" }}>
                      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 22, color: C.text }}>{n}</Text>
                      <Text style={{ fontFamily: SERIF, fontSize: 12, color: C.textDim, textAlign: "center" }}>{label}</Text>
                    </View>
                  ))}
                </View>
                {Object.keys(totals.meals).length ? (
                  <Text style={{ fontFamily: SERIF, fontSize: 13, color: C.text }}>
                    <Text style={{ fontFamily: SERIF_BOLD }}>{t("replies.meals")}: </Text>
                    {Object.entries(totals.meals).map(([m, n]) => `${m} ${n}`).join(" · ")}
                  </Text>
                ) : null}
                {replies.length === 0 ? (
                  <Text style={{ fontFamily: SERIF, fontSize: 14, color: C.textDim }}>{t("replies.none")}</Text>
                ) : (
                  replies.map((r) => (
                    <View key={r.id} style={{ borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 16 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: C.text }}>
                            {r.name}
                            {r.status === "going" && r.plus_ones > 0 ? ` +${r.plus_ones}` : ""}
                          </Text>
                          {r.email ? <Text style={{ fontFamily: SERIF, fontSize: 12, color: C.textDim }}>{r.email}</Text> : null}
                        </View>
                        <View
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            backgroundColor: r.status === "going" ? C.selected : r.status === "maybe" ? C.pending : C.surface,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: SERIF_BOLD,
                              fontSize: 12,
                              color: r.status === "going" ? C.onSelected : r.status === "maybe" ? C.pendingText : C.text,
                            }}
                          >
                            {t(`replies.status.${r.status}`)}
                          </Text>
                        </View>
                      </View>
                      {[
                        [t("replies.csv.meal"), r.meal_choice],
                        [t("replies.csv.dietary"), r.dietary],
                        [t("replies.csv.song"), r.song_request],
                        ...ev.rsvp_questions.map((q) => [q.label, r.answers?.[q.id] ?? null] as [string, string | null]),
                      ]
                        .filter(([, v]) => !!v)
                        .map(([k, v]) => (
                          <Text key={String(k)} style={{ fontFamily: SERIF, fontSize: 13, color: C.text, marginTop: 6 }}>
                            <Text style={{ fontFamily: SERIF_BOLD }}>{/[?:]$/.test(String(k)) ? `${k} ` : `${k}: `}</Text>
                            {v}
                          </Text>
                        ))}
                    </View>
                  ))
                )}
              </>
            )
          ) : null}
        </ScrollView>

        {tab !== "replies" ? (
          <View style={{ position: "absolute", left: 20, right: 20, bottom: saveBottom }}>
            <Pressable
              onPress={() => void save()}
              disabled={saving}
              style={{ height: 52, borderRadius: 26, backgroundColor: saving ? C.goldMuted : C.gold, alignItems: "center", justifyContent: "center" }}
            >
              {saving ? (
                <ActivityIndicator color={C.onGold} />
              ) : (
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: C.onGold }}>{t("invite.save")}</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <DateSheet
        visible={dateOpen !== null}
        value={dateOpen === "deadline" ? ev.rsvp_deadline : ev.event_date}
        min={(() => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          return d;
        })()}
        onClose={() => setDateOpen(null)}
        onPick={(d) => {
          if (dateOpen === "deadline") set("rsvp_deadline", d);
          else set("event_date", d);
          setDateOpen(null);
        }}
      />
    </SafeAreaView>
  );
}
