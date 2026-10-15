// Smart Scheduling & Automations — the Premium scheduling hub, per the
// user's reference mock ("Work less. Book more.").
//
// FREE: the basic calendar stays on the Calendar tab, and this screen
// lets free vendors manage their ONE basic appointment type; everything
// else shows the upsell.
// PRO: booking flexibility — up to 5 appointment types, working hours
// per weekday (9–5 style), and booking rules (buffer, minimum notice,
// per-day limit). No automations.
// PREMIUM ('studio' tier): everything in Pro plus unlimited types and
// the automated messages (auto-reply, confirmations, reminders,
// follow-ups, review requests, alt-date suggestions) and Fill Your
// Calendar (open-date alerts where NOTHING is promoted without
// explicit approval).
//
// Data: vendor_scheduling_settings (one row per account),
// vendor_appointment_types, vendor_promo_suggestions. The sending side
// lives in Postgres triggers + an hourly cron (run_vendor_automations).

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Field, Input, useBrandDialog } from "@/components/listing/WizardKit";
import { PLANS_PAUSED } from "@/lib/plans";
import { useT } from "@/lib/i18n";
import { C, IS_DARK } from "@/lib/theme";

const PAGE = C.page;
const CARD = C.card;
const SURFACE = C.surface;
const BORDER = C.border;
const INK = C.text;
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = C.textDim;
const GOLD = C.gold;
const GOLD_MUTED = C.goldMuted;
const ON_GOLD = C.onGold;
const SELECTED = C.selected;
const ON_SELECTED = C.onSelected;
const FIELD = C.field;
const ERROR = C.error;
// Switches: ink track in light; champagne in dark, where a cream track
// would swallow the white thumb.
const TRACK_ON = IS_DARK ? C.gold : C.selected;
const TRACK_OFF = IS_DARK ? "rgba(255,255,255,0.25)" : "#d6d1c6";
const THUMB = "#ffffff";
// Plan tags and quiet counts.
const GOLD_TAG = C.pending;
// The Premium tag: a dark chip with champagne text in both themes.
const DARK_TAG = IS_DARK ? C.surface : "#14161a";
const BRONZE = C.accentText;
const MUTED = C.placeholder;
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

// Weekday name in the app's language (0 = Sun). 1 Jan 2023 was a Sunday.
function dayLabel(dow: number, locale: string): string {
  return new Date(2023, 0, 1 + dow).toLocaleDateString(locale, { weekday: "short" });
}
const DURATIONS = [15, 30, 45, 60, 90, 120];
// Labels: scheduling.rules.buffers.<key> / notices.<key>.
const BUFFERS: { key: string; v: number }[] = [
  { key: "none", v: 0 },
  { key: "min30", v: 30 },
  { key: "hour1", v: 60 },
  { key: "hours2", v: 120 },
  { key: "day1", v: 1440 },
];
const NOTICES: { key: string; v: number }[] = [
  { key: "none", v: 0 },
  { key: "h24", v: 24 },
  { key: "h48", v: 48 },
  { key: "week1", v: 168 },
];
// null = no limit (label scheduling.rules.noLimit).
const MAX_PER_DAY: (number | null)[] = [null, 1, 2, 3, 5];

// 30-minute steps, 6:00 AM – 10:00 PM — plenty for service businesses.
const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:30`);
}

// "9:00 AM" in English, "9:00 a.m." in Spanish, "09:00" in Russian.
function timeLabel(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

interface DayHours {
  on: boolean;
  start: string;
  end: string;
}
type WorkingHours = Record<string, DayHours>;

function defaultHours(): WorkingHours {
  const wh: WorkingHours = {};
  for (let d = 0; d <= 6; d++) {
    wh[String(d)] = { on: d >= 1 && d <= 5, start: "09:00", end: "17:00" };
  }
  return wh;
}

interface ApptType {
  id: string;
  name: string;
  duration_minutes: number;
  active: boolean;
  display_order: number;
}

interface PromoSuggestion {
  id: string;
  open_dates: string[];
  status: string;
  created_at: string;
}

export default function SchedulingScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const dialog = useBrandDialog();
  const { t, locale } = useT("scheduling");
  // Starting text for each automated message, in the vendor's language
  // (as on the website). Once saved it's the vendor's own words.
  const DEFAULT_TEXTS = {
    auto_reply: t("defaults.autoReply"),
    confirm: t("defaults.confirm"),
    reminder: t("defaults.reminder"),
    followup: t("defaults.followup"),
    review: t("defaults.review"),
  };

  const [loading, setLoading] = useState(true);
  const [premium, setPremium] = useState(false);
  // Pro OR Premium — unlocks the manual scheduling controls (working
  // hours, booking rules, multiple appointment types).
  const [pro, setPro] = useState(false);
  const [saving, setSaving] = useState(false);

  // working hours + rules
  const [hours, setHours] = useState<WorkingHours>(defaultHours());
  const [buffer, setBuffer] = useState(0);
  const [notice, setNotice] = useState(0);
  const [maxPerDay, setMaxPerDay] = useState<number | null>(null);

  // automations
  const [autoReplyOn, setAutoReplyOn] = useState(false);
  const [autoReplyText, setAutoReplyText] = useState(DEFAULT_TEXTS.auto_reply);
  const [confirmOn, setConfirmOn] = useState(false);
  const [confirmText, setConfirmText] = useState(DEFAULT_TEXTS.confirm);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderHours, setReminderHours] = useState(24);
  const [reminderText, setReminderText] = useState(DEFAULT_TEXTS.reminder);
  const [followupOn, setFollowupOn] = useState(false);
  const [followupDays, setFollowupDays] = useState(3);
  const [followupText, setFollowupText] = useState(DEFAULT_TEXTS.followup);
  const [reviewOn, setReviewOn] = useState(false);
  const [reviewDays, setReviewDays] = useState(7);
  const [reviewText, setReviewText] = useState(DEFAULT_TEXTS.review);
  const [altDatesOn, setAltDatesOn] = useState(false);
  const [fillOn, setFillOn] = useState(false);

  // appointment types
  const [types, setTypes] = useState<ApptType[]>([]);
  const [typeFormOpen, setTypeFormOpen] = useState(false);
  const [editingType, setEditingType] = useState<ApptType | null>(null);

  // fill-your-calendar suggestions
  const [suggestions, setSuggestions] = useState<PromoSuggestion[]>([]);

  // time picker modal target: [dow, "start" | "end"]
  const [timeTarget, setTimeTarget] = useState<[string, "start" | "end"] | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [{ data: prof }, { data: settings }, { data: typeRows }, { data: promoRows }] =
      await Promise.all([
        supabase.from("profiles").select("subscription_tier").eq("id", user.id).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_scheduling_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_appointment_types")
          .select("id, name, duration_minutes, active, display_order")
          .eq("user_id", user.id)
          .order("display_order", { ascending: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_promo_suggestions")
          .select("id, open_dates, status, created_at")
          .eq("user_id", user.id)
          .eq("status", "suggested")
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
    const tier = (prof as { subscription_tier?: string } | null)?.subscription_tier ?? "free";
    const isPremium = tier === "studio" || tier === "premium";
    setPremium(isPremium);
    setPro(isPremium || tier === "pro");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = settings as any;
    if (s) {
      const wh = s.working_hours && Object.keys(s.working_hours).length > 0
        ? { ...defaultHours(), ...s.working_hours }
        : defaultHours();
      setHours(wh);
      setBuffer(s.buffer_minutes ?? 0);
      setNotice(s.min_notice_hours ?? 0);
      setMaxPerDay(s.max_per_day ?? null);
      setAutoReplyOn(!!s.auto_reply_enabled);
      setAutoReplyText(s.auto_reply_text ?? DEFAULT_TEXTS.auto_reply);
      setConfirmOn(!!s.confirm_enabled);
      setConfirmText(s.confirm_text ?? DEFAULT_TEXTS.confirm);
      setReminderOn(!!s.reminder_enabled);
      setReminderHours(s.reminder_hours_before ?? 24);
      setReminderText(s.reminder_text ?? DEFAULT_TEXTS.reminder);
      setFollowupOn(!!s.followup_enabled);
      setFollowupDays(s.followup_days_after ?? 3);
      setFollowupText(s.followup_text ?? DEFAULT_TEXTS.followup);
      setReviewOn(!!s.review_enabled);
      setReviewDays(s.review_days_after ?? 7);
      setReviewText(s.review_text ?? DEFAULT_TEXTS.review);
      setAltDatesOn(!!s.alt_dates_enabled);
      setFillOn(!!s.fill_calendar_enabled);
    }
    setTypes((typeRows ?? []) as ApptType[]);
    setSuggestions((promoRows ?? []) as PromoSuggestion[]);
    setLoading(false);
    // DEFAULT_TEXTS only fills empty fields; a language switch needn't reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!user?.id || saving) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_scheduling_settings").upsert(
      {
        user_id: user.id,
        working_hours: hours,
        buffer_minutes: buffer,
        min_notice_hours: notice,
        max_per_day: maxPerDay,
        auto_reply_enabled: autoReplyOn,
        auto_reply_text: autoReplyText.trim() || null,
        confirm_enabled: confirmOn,
        confirm_text: confirmText.trim() || null,
        reminder_enabled: reminderOn,
        reminder_hours_before: reminderHours,
        reminder_text: reminderText.trim() || null,
        followup_enabled: followupOn,
        followup_days_after: followupDays,
        followup_text: followupText.trim() || null,
        review_enabled: reviewOn,
        review_days_after: reviewDays,
        review_text: reviewText.trim() || null,
        alt_dates_enabled: altDatesOn,
        fill_calendar_enabled: fillOn,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) {
      dialog.show({ icon: "alert-circle", title: t("dialogs.saveFailed"), message: error.message });
    } else {
      dialog.show({ title: t("dialogs.saved"), message: t("dialogs.savedBody") });
    }
  }

  async function decideSuggestion(sug: PromoSuggestion, status: "approved" | "dismissed") {
    setSuggestions((cur) => cur.filter((x) => x.id !== sug.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("vendor_promo_suggestions")
      .update({ status, decided_at: new Date().toISOString() })
      .eq("id", sug.id);
    if (status === "approved") {
      dialog.show({
        icon: "zap",
        title: t("dialogs.promotedTitle"),
        message: t("dialogs.promotedBody"),
      });
    }
  }

  // Type caps by plan: Free 1 · Pro 5 · Premium unlimited.
  const PRO_TYPE_CAP = 5;
  const canAddType = premium || (pro ? types.length < PRO_TYPE_CAP : types.length < 1);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={INK} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header: back, then the same big serif title the tabs use. */}
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ alignSelf: "flex-start", marginTop: 4 }}>
          <Feather name="chevron-left" size={26} color={INK} />
        </Pressable>
        <Text
          style={{
            marginTop: 10,
            fontFamily: SERIF_BOLD,
            fontSize: 38,
            lineHeight: 46,
            letterSpacing: -0.5,
            color: INK,
          }}
        >
          {t("title")}
        </Text>
        <Text style={{ fontFamily: SERIF, marginTop: 2, fontSize: 13, lineHeight: 19, color: INK_DIM }}>
          {t("subtitle")}
        </Text>

        {/* Appointment types — available on every plan (free = 1). */}
        <SectionTitle title={t("sections.types")} />
        <View style={{ gap: 12 }}>
          {types.map((type) => (
            <Pressable
              key={type.id}
              onPress={() => {
                setEditingType(type);
                setTypeFormOpen(true);
              }}
              style={{
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 16,
                flexDirection: "row",
                alignItems: "center",
                opacity: type.active ? 1 : 0.55,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: SURFACE,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="clock" size={16} color={INK} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 16, color: INK }}>
                  {type.name}
                  {!type.active ? <Text style={{ fontFamily: SERIF, fontSize: 12, color: INK_DIM }}>{t("types.off")}</Text> : null}
                </Text>
                <Text style={{ fontFamily: SERIF, marginTop: 1, fontSize: 13, color: INK_DIM }}>
                  {t("types.minutes", { count: type.duration_minutes })}
                </Text>
              </View>
              <Feather name="edit-2" size={15} color={INK_DIM} />
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              if (!canAddType) {
                // Plans paused (lib/plans.ts): explain the limit, no "See plans".
                if (PLANS_PAUSED) {
                  dialog.show({
                    icon: "zap",
                    title: t("limit.title"),
                    message: pro ? t("limit.proPaused") : t("limit.freePaused"),
                  });
                  return;
                }
                dialog.show({
                  icon: "zap",
                  title: t("limit.title"),
                  message: pro ? t("limit.proUpsell") : t("limit.freeUpsell"),
                  confirmLabel: t("limit.seePlans"),
                  onConfirm: () => router.push("/(vendor)/subscription" as never),
                });
                return;
              }
              setEditingType(null);
              setTypeFormOpen(true);
            }}
            style={{
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 16,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: SURFACE,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="plus" size={17} color={INK} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }}>
                {t("types.add")}
              </Text>
              <Text numberOfLines={1} style={{ fontFamily: SERIF, marginTop: 2, fontSize: 13, color: INK_DIM }}>
                {t("types.addSub")}
              </Text>
            </View>
            {/* Plan allowance, quietly, instead of "(0/1 on Free)" in
                the button label. */}
            {!premium ? (
              <Text style={{ fontFamily: SERIF, fontSize: 12, color: MUTED, marginLeft: 8 }}>
                {t("types.allowance", { used: types.length, cap: pro ? PRO_TYPE_CAP : 1 })}
              </Text>
            ) : null}
          </Pressable>
        </View>

        {pro ? (
          <>
            {/* Working hours — the "9 to 5" setup */}
            <SectionTitle
              title={t("sections.hours")}
              sub={t("sections.hoursSub")}
            />
            <View
              style={{
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 4,
              }}
            >
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const key = String(d);
                const day = hours[key] ?? { on: false, start: "09:00", end: "17:00" };
                return (
                  <View
                    key={key}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 9,
                      borderTopWidth: d === 1 ? 0 : 1,
                      borderTopColor: BORDER,
                    }}
                  >
                    <Switch
                      value={day.on}
                      onValueChange={(v) =>
                        setHours((h) => ({ ...h, [key]: { ...day, on: v } }))
                      }
                      trackColor={{ false: TRACK_OFF, true: TRACK_ON }}
                      thumbColor={THUMB}
                      style={{ transform: [{ scale: 0.85 }] }}
                    />
                    <Text
                      style={{
                        fontFamily: SERIF_BOLD,
                        minWidth: 44,
                        marginLeft: 6,
                        fontSize: 14,
                        color: day.on ? INK : INK_DIM,
                      }}
                    >
                      {dayLabel(d, locale)}
                    </Text>
                    {day.on ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" }}>
                        <TimePill label={timeLabel(day.start, locale)} onPress={() => setTimeTarget([key, "start"])} />
                        <Text style={{ fontFamily: SERIF, color: INK_DIM }}>–</Text>
                        <TimePill label={timeLabel(day.end, locale)} onPress={() => setTimeTarget([key, "end"])} />
                      </View>
                    ) : (
                      <Text style={{ fontFamily: SERIF, flex: 1, textAlign: "right", fontSize: 13, color: INK_DIM }}>
                        {t("hours.unavailable")}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Booking rules */}
            <SectionTitle title={t("sections.rules")} sub={t("sections.rulesSub")} />
            <RuleChips
              label={t("rules.buffer")}
              options={BUFFERS.map((b) => t(`rules.buffers.${b.key}`))}
              selected={BUFFERS.findIndex((b) => b.v === buffer)}
              onSelect={(i) => setBuffer(BUFFERS[i].v)}
            />
            <RuleChips
              label={t("rules.notice")}
              options={NOTICES.map((n) => t(`rules.notices.${n.key}`))}
              selected={NOTICES.findIndex((n) => n.v === notice)}
              onSelect={(i) => setNotice(NOTICES[i].v)}
            />
            <RuleChips
              label={t("rules.maxPerDay")}
              options={MAX_PER_DAY.map((m) => (m === null ? t("rules.noLimit") : String(m)))}
              selected={MAX_PER_DAY.findIndex((m) => m === maxPerDay)}
              onSelect={(i) => setMaxPerDay(MAX_PER_DAY[i])}
            />

            {premium ? (
              <>
            {/* Automated messages */}
            <SectionTitle
              title={t("sections.auto")}
              sub={t("sections.autoSub")}
            />
            <AutoRow
              icon="message-circle"
              title={t("auto.autoReplyTitle")}
              sub={t("auto.autoReplySub")}
              on={autoReplyOn}
              setOn={setAutoReplyOn}
              text={autoReplyText}
              setText={setAutoReplyText}
            />
            <AutoRow
              icon="check-circle"
              title={t("auto.confirmTitle")}
              sub={t("auto.confirmSub")}
              on={confirmOn}
              setOn={setConfirmOn}
              text={confirmText}
              setText={setConfirmText}
            />
            <AutoRow
              icon="bell"
              title={t("auto.reminderTitle")}
              sub={t("auto.reminderSub")}
              on={reminderOn}
              setOn={setReminderOn}
              text={reminderText}
              setText={setReminderText}
              chips={{
                label: t("auto.send"),
                options: [t("auto.hoursBefore", { n: 24 }), t("auto.hoursBefore", { n: 48 })],
                selected: reminderHours === 48 ? 1 : 0,
                onSelect: (i) => setReminderHours(i === 1 ? 48 : 24),
              }}
            />
            <AutoRow
              icon="corner-up-right"
              title={t("auto.followupTitle")}
              sub={t("auto.followupSub")}
              on={followupOn}
              setOn={setFollowupOn}
              text={followupText}
              setText={setFollowupText}
              chips={{
                label: t("auto.send"),
                options: [1, 3, 7].map((n) => t("auto.daysAfter", { count: n })),
                selected: followupDays === 1 ? 0 : followupDays === 7 ? 2 : 1,
                onSelect: (i) => setFollowupDays([1, 3, 7][i]),
              }}
            />
            <AutoRow
              icon="star"
              title={t("auto.reviewTitle")}
              sub={t("auto.reviewSub")}
              on={reviewOn}
              setOn={setReviewOn}
              text={reviewText}
              setText={setReviewText}
              chips={{
                label: t("auto.send"),
                options: [3, 7, 14].map((n) => t("auto.daysAfter", { count: n })),
                selected: reviewDays === 3 ? 0 : reviewDays === 14 ? 2 : 1,
                onSelect: (i) => setReviewDays([3, 7, 14][i]),
              }}
            />
            <ToggleCard
              icon="send"
              title={t("auto.altDatesTitle")}
              sub={t("auto.altDatesSub")}
              on={altDatesOn}
              setOn={setAltDatesOn}
            />

            {/* Fill your calendar */}
            <SectionTitle
              title={t("sections.fill")}
              sub={t("sections.fillSub")}
            />
            <ToggleCard
              icon="bell"
              title={t("fill.alertsTitle")}
              sub={t("fill.alertsSub")}
              on={fillOn}
              setOn={setFillOn}
            />
            {suggestions.map((sug) => (
              <View
                key={sug.id}
                style={{
                  marginTop: 12,
                  backgroundColor: GOLD_TAG,
                  borderWidth: 1,
                  borderColor: GOLD,
                  borderRadius: 20,
                  padding: 16,
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 16, color: INK }}>
                  {t("fill.openDates", { count: sug.open_dates.length })}
                </Text>
                <Text style={{ fontFamily: SERIF, marginTop: 4, fontSize: 13, color: INK_DIM }}>
                  {sug.open_dates
                    .slice(0, 6)
                    .map((d) =>
                      new Date(`${d}T12:00:00`).toLocaleDateString(locale, {
                        month: "short",
                        day: "numeric",
                      }),
                    )
                    .join(" · ")}
                  {sug.open_dates.length > 6 ? t("fill.more", { count: sug.open_dates.length - 6 }) : ""}
                </Text>
                <Text style={{ fontFamily: SERIF, marginTop: 6, fontSize: 13, color: INK_DIM }}>
                  {t("fill.approveNote")}
                </Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <Pressable
                    onPress={() => decideSuggestion(sug, "approved")}
                    style={{
                      flex: 1,
                      backgroundColor: GOLD,
                      borderRadius: 999,
                      minHeight: 44,
                      paddingHorizontal: 12,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontFamily: SERIF_BOLD, color: ON_GOLD, fontSize: 14, textAlign: "center" }}>
                      {t("fill.promote")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => decideSuggestion(sug, "dismissed")}
                    style={{
                      flex: 1,
                      backgroundColor: FIELD,
                      borderWidth: 1,
                      borderColor: BORDER,
                      borderRadius: 999,
                      minHeight: 44,
                      paddingHorizontal: 12,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 14, textAlign: "center" }}>{t("fill.notNow")}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
              </>
            ) : PLANS_PAUSED ? null : (
              <PremiumTeaser onUpgrade={() => router.push("/(vendor)/subscription" as never)} />
            )}

            {/* Save */}
            <Pressable
              onPress={save}
              disabled={saving}
              style={{
                marginTop: 28,
                backgroundColor: saving ? GOLD_MUTED : GOLD,
                borderRadius: 999,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {saving ? (
                <ActivityIndicator color={ON_GOLD} />
              ) : (
                <Text style={{ fontFamily: SERIF_BOLD, color: ON_GOLD, fontSize: 16}}>
                  {t("save")}
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          PLANS_PAUSED ? (
            <LockedNote />
          ) : (
            <Upsell onUpgrade={() => router.push("/(vendor)/subscription" as never)} />
          )
        )}
      </ScrollView>

      {/* Time picker */}
      <Modal
        visible={timeTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTimeTarget(null)}
      >
        <Pressable
          onPress={() => setTimeTarget(null)}
          style={{
            flex: 1,
            backgroundColor: "rgba(13,15,19,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: CARD,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 24,
              paddingBottom: 36,
              maxHeight: "60%",
            }}
          >
            <Text
              style={{
                textAlign: "center",
                fontFamily: SERIF_BOLD,
                fontSize: 18,
                color: INK,
              }}
            >
              {timeTarget?.[1] === "start" ? t("timePicker.start") : t("timePicker.end")}
            </Text>
            <ScrollView contentContainerStyle={{ padding: 24 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {TIME_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      if (!timeTarget) return;
                      const [key, which] = timeTarget;
                      setHours((h) => ({
                        ...h,
                        [key]: { ...(h[key] ?? { on: true, start: "09:00", end: "17:00" }), [which]: opt },
                      }));
                      setTimeTarget(null);
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 999,
                      backgroundColor: CARD,
                      borderWidth: 1,
                      borderColor: BORDER,
                    }}
                  >
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>
                      {timeLabel(opt, locale)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Appointment type form */}
      {typeFormOpen ? (
        <TypeForm
          userId={user?.id ?? ""}
          type={editingType}
          nextOrder={types.length}
          onClose={() => setTypeFormOpen(false)}
          onSaved={() => {
            setTypeFormOpen(false);
            load();
          }}
        />
      ) : null}

      {dialog.element}
    </SafeAreaView>
  );
}

// ---------- pieces ----------

// Section label: small caps over the cards, like the More page's groups.
// A 20pt heading per section made a long settings page read as a stack of
// headlines.
function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginTop: 24, marginBottom: 10, paddingHorizontal: 2 }}>
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 10, letterSpacing: 1.2, color: INK }}>
        {title.toUpperCase()}
      </Text>
      {sub ? (
        <Text style={{ fontFamily: SERIF, marginTop: 5, fontSize: 13, lineHeight: 19, color: INK_DIM }}>{sub}</Text>
      ) : null}
    </View>
  );
}

function TimePill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: SURFACE,
        borderRadius: 8,
        paddingHorizontal: 11,
        paddingVertical: 7,
      }}
    >
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>{label}</Text>
    </Pressable>
  );
}

function RuleChips({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK, marginBottom: 8 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o, i) => {
          const on = i === selected;
          return (
            <Pressable
              key={o}
              onPress={() => onSelect(i)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: on ? SELECTED : CARD,
                borderWidth: 1,
                borderColor: on ? SELECTED : BORDER,
              }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: on ? ON_SELECTED : INK }}>
                {o}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ToggleCard({
  icon,
  title,
  sub,
  on,
  setOn,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  sub: string;
  on: boolean;
  setOn: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        marginBottom: 12,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 20,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          backgroundColor: SURFACE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={17} color={INK} />
      </View>
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }}>
          {title}
        </Text>
        <Text style={{ fontFamily: SERIF, marginTop: 2, fontSize: 13, lineHeight: 17, color: INK_DIM }}>{sub}</Text>
      </View>
      <Switch
        value={on}
        onValueChange={setOn}
        trackColor={{ false: TRACK_OFF, true: TRACK_ON }}
        thumbColor={THUMB}
      />
    </View>
  );
}

function AutoRow({
  icon,
  title,
  sub,
  on,
  setOn,
  text,
  setText,
  chips,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  sub: string;
  on: boolean;
  setOn: (v: boolean) => void;
  text: string;
  setText: (v: string) => void;
  chips?: {
    label: string;
    options: string[];
    selected: number;
    onSelect: (i: number) => void;
  };
}) {
  const { t } = useT("scheduling");
  return (
    <View
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
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            backgroundColor: SURFACE,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={icon} size={17} color={INK} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }}>
            {title}
          </Text>
          <Text style={{ fontFamily: SERIF, marginTop: 2, fontSize: 13, color: INK_DIM }}>{sub}</Text>
        </View>
        <Switch
          value={on}
          onValueChange={setOn}
          trackColor={{ false: TRACK_OFF, true: TRACK_ON }}
          thumbColor={THUMB}
        />
      </View>
      {on ? (
        <View style={{ marginTop: 12 }}>
          {chips ? (
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK_DIM }}>
                {chips.label}
              </Text>
              {chips.options.map((o, i) => {
                const sel = i === chips.selected;
                return (
                  <Pressable
                    key={o}
                    onPress={() => chips.onSelect(i)}
                    style={{
                      paddingHorizontal: 11,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: sel ? SELECTED : SURFACE,
                    }}
                  >
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 12, color: sel ? ON_SELECTED : INK }}>
                      {o}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Input value={text} onChangeText={setText} placeholder={t("auto.placeholder")} multiline />
        </View>
      ) : null}
    </View>
  );
}

// Add / edit an appointment type.
function TypeForm({
  userId,
  type,
  nextOrder,
  onClose,
  onSaved,
}: {
  userId: string;
  type: ApptType | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useBrandDialog();
  const { t, locale } = useT("scheduling");
  const [name, setName] = useState(type?.name ?? "");
  const [duration, setDuration] = useState(type?.duration_minutes ?? 60);
  const [active, setActive] = useState(type?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (!name.trim()) {
      dialog.show({ icon: "list", title: t("typeForm.nameFirstTitle"), message: t("typeForm.nameFirstBody") });
      return;
    }
    setSaving(true);
    const payload = { name: name.trim(), duration_minutes: duration, active };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = type
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("vendor_appointment_types").update(payload).eq("id", type.id)
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_appointment_types")
          .insert({ ...payload, user_id: userId, display_order: nextOrder });
    const { error } = await q;
    setSaving(false);
    if (error) {
      dialog.show({ icon: "alert-circle", title: t("dialogs.saveFailed"), message: error.message });
      return;
    }
    onSaved();
  }

  async function remove() {
    if (!type) return;
    dialog.show({
      icon: "trash-2",
      title: t("typeForm.deleteTitle", { name: type.name }),
      message: t("typeForm.deleteBody"),
      confirmLabel: t("typeForm.delete"),
      destructive: true,
      onConfirm: async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("vendor_appointment_types").delete().eq("id", type.id);
        onSaved();
      },
    });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top", "bottom"]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="chevron-left" size={26} color={INK} />
          </Pressable>
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 20, color: INK, flexShrink: 1, textAlign: "center", marginHorizontal: 8 }}>
            {type ? t("typeForm.editTitle") : t("typeForm.newTitle")}
          </Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Field label={t("typeForm.name")} required>
            <Input value={name} onChangeText={setName} placeholder={t("typeForm.namePlaceholder")} />
          </Field>
          <Field label={t("typeForm.length")}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {DURATIONS.map((d) => {
                const on = duration === d;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDuration(d)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 999,
                      backgroundColor: on ? SELECTED : CARD,
                      borderWidth: 1,
                      borderColor: on ? SELECTED : BORDER,
                    }}
                  >
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: on ? ON_SELECTED : INK }}>
                      {d >= 60
                        ? t("typeForm.durHr", { count: d / 60, n: new Intl.NumberFormat(locale).format(d / 60) })
                        : t("typeForm.durMin", { n: d })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK, flexShrink: 1, marginRight: 8 }}>{t("typeForm.bookable")}</Text>
            <Switch
              value={active}
              onValueChange={setActive}
              trackColor={{ false: TRACK_OFF, true: TRACK_ON }}
              thumbColor={THUMB}
            />
          </View>
          <Pressable
            onPress={save}
            disabled={saving}
            style={{
              marginTop: 16,
              backgroundColor: saving ? GOLD_MUTED : GOLD,
              borderRadius: 999,
              height: 52,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {saving ? (
              <ActivityIndicator color={ON_GOLD} />
            ) : (
              <Text style={{ fontFamily: SERIF_BOLD, color: ON_GOLD, fontSize: 15}}>
                {t("typeForm.save")}
              </Text>
            )}
          </Pressable>
          {type ? (
            <Pressable onPress={remove} style={{ alignItems: "center", paddingVertical: 16 }}>
              <Text style={{ fontFamily: SERIF_BOLD, color: ERROR, fontSize: 14}}>
                {t("typeForm.deleteType")}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
        {dialog.element}
      </SafeAreaView>
    </Modal>
  );
}

// Shown to Pro vendors below their scheduling controls: the automation
// half of Smart Scheduling is the Premium step up.
function PremiumTeaser({ onUpgrade }: { onUpgrade: () => void }) {
  const { t } = useT("scheduling");
  const rows: { icon: keyof typeof Feather.glyphMap; text: string }[] = [
    { icon: "message-circle", text: t("teaser.replies") },
    { icon: "bell", text: t("teaser.autopilot") },
    { icon: "star", text: t("teaser.reviews") },
    { icon: "zap", text: t("teaser.fill") },
  ];
  return (
    <View
      style={{
        marginTop: 28,
        backgroundColor: GOLD_TAG,
        borderWidth: 1,
        borderColor: GOLD,
        borderRadius: 20,
        padding: 16,
      }}
    >
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 18, color: INK }}>
        {t("teaser.title")}
      </Text>
      <Text style={{ fontFamily: SERIF, marginTop: 4, fontSize: 13, lineHeight: 18, color: INK_DIM }}>
        {t("teaser.body")}
      </Text>
      <View style={{ marginTop: 16, gap: 10 }}>
        {rows.map((r) => (
          <View key={r.icon} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name={r.icon} size={15} color={BRONZE} />
            <Text style={{ fontFamily: SERIF, flex: 1, fontSize: 13, color: INK }}>{r.text}</Text>
          </View>
        ))}
      </View>
      <Pressable
        onPress={onUpgrade}
        style={{
          marginTop: 16,
          backgroundColor: GOLD,
          borderRadius: 999,
          height: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <MaterialCommunityIcons name="arrow-up-circle-outline" size={15} color={ON_GOLD} />
        <Text style={{ fontFamily: SERIF_BOLD, color: ON_GOLD, fontSize: 15}}>
          {t("teaser.upgrade")}
        </Text>
      </Pressable>
    </View>
  );
}

// Free-plan pitch: one short card per plan, three lines each. It used
// to be a hero icon, a headline, four icon rows whose titles wrapped
// around their "— Pro" / "— Premium" suffixes, and a footnote repeating
// which plan had what.
// Text: scheduling.plans.<titleKey> / <linesKey>. The tags stay Latin.
const PLAN_CARDS: {
  titleKey: string;
  linesKey: string;
  tag: "PRO" | "PREMIUM";
}[] = [
  { titleKey: "smartTitle", linesKey: "smartLines", tag: "PRO" },
  { titleKey: "autoTitle", linesKey: "autoLines", tag: "PREMIUM" },
];

// Plans paused (lib/plans.ts): a plain note in place of the Upsell,
// so a Free vendor knows why the controls aren't here.
function LockedNote() {
  const { t } = useT("scheduling");
  return (
    <View
      style={{
        marginTop: 28,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 20,
        padding: 16,
      }}
    >
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 16, color: INK }}>
        {t("locked.title")}
      </Text>
      <Text style={{ fontFamily: SERIF, marginTop: 4, fontSize: 13, lineHeight: 18, color: INK_DIM }}>
        {t("locked.body")}
      </Text>
    </View>
  );
}

function Upsell({ onUpgrade }: { onUpgrade: () => void }) {
  const { t, tObject } = useT("scheduling");
  return (
    <View>
      <SectionTitle title={t("sections.unlock")} />
      <View style={{ gap: 12 }}>
        {PLAN_CARDS.map((c) => (
          <View
            key={c.tag}
            style={{
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 16, color: INK, flexShrink: 1 }}>
                {t(`plans.${c.titleKey}`)}
              </Text>
              <View
                style={{
                  marginLeft: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 8,
                  backgroundColor: c.tag === "PRO" ? GOLD_TAG : DARK_TAG,
                }}
              >
                <Text
                  style={{
                    fontFamily: SERIF_BOLD,
                    fontSize: 9.5,
                    letterSpacing: 1,
                    color: c.tag === "PRO" ? BRONZE : GOLD,
                  }}
                >
                  {c.tag}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 8, gap: 7 }}>
              {(tObject<string[]>(`plans.${c.linesKey}`) ?? []).map((line) => (
                <View key={line} style={{ flexDirection: "row", alignItems: "center" }}>
                  <Feather name="check" size={14} color={BRONZE} style={{ marginRight: 9 }} />
                  <Text style={{ fontFamily: SERIF, flex: 1, fontSize: 13, lineHeight: 18, color: INK }}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
      <Pressable
        onPress={onUpgrade}
        style={{
          marginTop: 20,
          backgroundColor: GOLD,
          borderRadius: 999,
          height: 52,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Feather name="arrow-up-circle" size={16} color={ON_GOLD} />
        <Text style={{ fontFamily: SERIF_BOLD, color: ON_GOLD, fontSize: 16 }}>{t("plans.seePlans")}</Text>
      </Pressable>
    </View>
  );
}
