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

const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const SURFACE = "#ece7db";
const BORDER = "#e6e1d5";
const INK = "#14161a";
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = "#14161a";
const GOLD = "#c9a86a";
// Plan tags and quiet counts.
const GOLD_TAG = "#eadfc6";
const BRONZE = "#8a6f3e";
const MUTED = "#7b7973";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DURATIONS = [15, 30, 45, 60, 90, 120];
const BUFFERS: { label: string; v: number }[] = [
  { label: "None", v: 0 },
  { label: "30 min", v: 30 },
  { label: "1 hour", v: 60 },
  { label: "2 hours", v: 120 },
  { label: "1 day", v: 1440 },
];
const NOTICES: { label: string; v: number }[] = [
  { label: "None", v: 0 },
  { label: "24 hours", v: 24 },
  { label: "48 hours", v: 48 },
  { label: "1 week", v: 168 },
];
const MAX_PER_DAY: { label: string; v: number | null }[] = [
  { label: "No limit", v: null },
  { label: "1", v: 1 },
  { label: "2", v: 2 },
  { label: "3", v: 3 },
  { label: "5", v: 5 },
];

// 30-minute steps, 6:00 AM – 10:00 PM — plenty for service businesses.
const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:30`);
}

function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
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

const DEFAULT_TEXTS = {
  auto_reply:
    "Thanks so much for reaching out! We got your inquiry and will reply personally within a few hours.",
  confirm: "You're booked! We're looking forward to it — details below.",
  reminder: "Friendly reminder about our upcoming appointment!",
  followup: "Just following up — any questions I can answer?",
  review:
    "It was a pleasure being part of your event! If you have a minute, we'd love a review — it helps other hosts find us.",
};

export default function SchedulingScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const dialog = useBrandDialog();

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
      dialog.show({ icon: "alert-circle", title: "Couldn't save", message: error.message });
    } else {
      dialog.show({ title: "Saved", message: "Your scheduling setup is live." });
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
        title: "Openings promoted",
        message:
          "Your open dates now show as last-minute availability on your public listing.",
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
          Scheduling
        </Text>
        <Text style={{ fontFamily: SERIF, marginTop: 2, fontSize: 13, lineHeight: 19, color: INK_DIM }}>
          What hosts can book, and when.
        </Text>

        {/* Appointment types — available on every plan (free = 1). */}
        <SectionTitle title="Appointment types" />
        <View style={{ gap: 10 }}>
          {types.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => {
                setEditingType(t);
                setTypeFormOpen(true);
              }}
              style={{
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 13,
                flexDirection: "row",
                alignItems: "center",
                opacity: t.active ? 1 : 0.55,
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
                  {t.name}
                  {!t.active ? <Text style={{ fontFamily: SERIF, fontSize: 12, color: INK_DIM }}>  · off</Text> : null}
                </Text>
                <Text style={{ fontFamily: SERIF, marginTop: 1, fontSize: 13, color: INK_DIM }}>
                  {t.duration_minutes} minutes
                </Text>
              </View>
              <Feather name="edit-2" size={15} color={INK_DIM} />
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              if (!canAddType) {
                dialog.show({
                  icon: "zap",
                  title: "More appointment types",
                  message: pro
                    ? "The Pro plan includes up to 5 appointment types. Upgrade to Premium to create as many as you need."
                    : "The Free plan includes one appointment type. Pro unlocks up to 5, and Premium has no limit.",
                  confirmLabel: "See plans",
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
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 13,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                backgroundColor: SURFACE,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="plus" size={17} color={INK} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }}>
                Add appointment type
              </Text>
              <Text numberOfLines={1} style={{ fontFamily: SERIF, marginTop: 2, fontSize: 13, color: INK_DIM }}>
                A call, a tasting, a consultation…
              </Text>
            </View>
            {/* Plan allowance, quietly, instead of "(0/1 on Free)" in
                the button label. */}
            {!premium ? (
              <Text style={{ fontFamily: SERIF, fontSize: 12, color: MUTED, marginLeft: 8 }}>
                {types.length} of {pro ? PRO_TYPE_CAP : 1}
              </Text>
            ) : null}
          </Pressable>
        </View>

        {pro ? (
          <>
            {/* Working hours — the "9 to 5" setup */}
            <SectionTitle
              title="Your working hours"
              sub="When can appointments happen? Tap a time to change it."
            />
            <View
              style={{
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 18,
                paddingHorizontal: 14,
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
                      trackColor={{ false: "#d6d1c6", true: INK }}
                      thumbColor="#ffffff"
                      style={{ transform: [{ scale: 0.85 }] }}
                    />
                    <Text
                      style={{
                        fontFamily: SERIF_BOLD,
                        width: 44,
                        marginLeft: 6,
                        fontSize: 14,
                        color: day.on ? INK : INK_DIM,
                      }}
                    >
                      {DAY_LABELS[d]}
                    </Text>
                    {day.on ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" }}>
                        <TimePill label={timeLabel(day.start)} onPress={() => setTimeTarget([key, "start"])} />
                        <Text style={{ fontFamily: SERIF, color: INK_DIM }}>–</Text>
                        <TimePill label={timeLabel(day.end)} onPress={() => setTimeTarget([key, "end"])} />
                      </View>
                    ) : (
                      <Text style={{ fontFamily: SERIF, flex: 1, textAlign: "right", fontSize: 13, color: INK_DIM }}>
                        Unavailable
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Booking rules */}
            <SectionTitle title="Booking rules" sub="Protect your time between bookings." />
            <RuleChips
              label="Buffer between appointments"
              options={BUFFERS.map((b) => b.label)}
              selected={BUFFERS.findIndex((b) => b.v === buffer)}
              onSelect={(i) => setBuffer(BUFFERS[i].v)}
            />
            <RuleChips
              label="Minimum notice"
              options={NOTICES.map((n) => n.label)}
              selected={NOTICES.findIndex((n) => n.v === notice)}
              onSelect={(i) => setNotice(NOTICES[i].v)}
            />
            <RuleChips
              label="Max appointments per day"
              options={MAX_PER_DAY.map((m) => m.label)}
              selected={MAX_PER_DAY.findIndex((m) => m.v === maxPerDay)}
              onSelect={(i) => setMaxPerDay(MAX_PER_DAY[i].v)}
            />

            {premium ? (
              <>
            {/* Automated messages */}
            <SectionTitle
              title="Automated messages"
              sub="Vendora sends these for you, in your words."
            />
            <AutoRow
              icon="message-circle"
              title="Instant inquiry reply"
              sub="Sent the moment a new inquiry lands."
              on={autoReplyOn}
              setOn={setAutoReplyOn}
              text={autoReplyText}
              setText={setAutoReplyText}
            />
            <AutoRow
              icon="check-circle"
              title="Booking confirmations"
              sub="Sent when you confirm an appointment."
              on={confirmOn}
              setOn={setConfirmOn}
              text={confirmText}
              setText={setConfirmText}
            />
            <AutoRow
              icon="bell"
              title="Reminders"
              sub="Sent before upcoming appointments."
              on={reminderOn}
              setOn={setReminderOn}
              text={reminderText}
              setText={setReminderText}
              chips={{
                label: "Send",
                options: ["24h before", "48h before"],
                selected: reminderHours === 48 ? 1 : 0,
                onSelect: (i) => setReminderHours(i === 1 ? 48 : 24),
              }}
            />
            <AutoRow
              icon="corner-up-right"
              title="Follow-ups"
              sub="Sent after an appointment passes."
              on={followupOn}
              setOn={setFollowupOn}
              text={followupText}
              setText={setFollowupText}
              chips={{
                label: "Send",
                options: ["1 day after", "3 days after", "7 days after"],
                selected: followupDays === 1 ? 0 : followupDays === 7 ? 2 : 1,
                onSelect: (i) => setFollowupDays([1, 3, 7][i]),
              }}
            />
            <AutoRow
              icon="star"
              title="Review requests"
              sub="Sent after a booked event wraps."
              on={reviewOn}
              setOn={setReviewOn}
              text={reviewText}
              setText={setReviewText}
              chips={{
                label: "Send",
                options: ["3 days after", "7 days after", "14 days after"],
                selected: reviewDays === 3 ? 0 : reviewDays === 14 ? 2 : 1,
                onSelect: (i) => setReviewDays([3, 7, 14][i]),
              }}
            />
            <ToggleCard
              icon="send"
              title="Suggest alternative dates"
              sub="When someone asks for a date you're booked, your instant reply offers your nearest open dates automatically."
              on={altDatesOn}
              setOn={setAltDatesOn}
            />

            {/* Fill your calendar */}
            <SectionTitle
              title="Fill your calendar"
              sub="We watch for upcoming open dates and alert you. Nothing is ever promoted without your approval."
            />
            <ToggleCard
              icon="bell"
              title="Open-date alerts"
              sub="Get notified when you have unbooked dates in the next two weeks."
              on={fillOn}
              setOn={setFillOn}
            />
            {suggestions.map((sug) => (
              <View
                key={sug.id}
                style={{
                  marginTop: 10,
                  backgroundColor: "#f3ecdd",
                  borderWidth: 1,
                  borderColor: GOLD,
                  borderRadius: 18,
                  padding: 16,
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 16, color: INK }}>
                  {sug.open_dates.length} open date{sug.open_dates.length === 1 ? "" : "s"} coming up
                </Text>
                <Text style={{ fontFamily: SERIF, marginTop: 4, fontSize: 13, color: INK_DIM }}>
                  {sug.open_dates
                    .slice(0, 6)
                    .map((d) =>
                      new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      }),
                    )
                    .join(" · ")}
                  {sug.open_dates.length > 6 ? ` +${sug.open_dates.length - 6} more` : ""}
                </Text>
                <Text style={{ fontFamily: SERIF, marginTop: 6, fontSize: 13, color: INK_DIM }}>
                  Approve to highlight these as last-minute availability on your public listing.
                </Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <Pressable
                    onPress={() => decideSuggestion(sug, "approved")}
                    style={{
                      flex: 1,
                      backgroundColor: GOLD,
                      borderRadius: 999,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 14}}>
                      Promote openings
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => decideSuggestion(sug, "dismissed")}
                    style={{
                      flex: 1,
                      backgroundColor: CARD,
                      borderWidth: 1,
                      borderColor: BORDER,
                      borderRadius: 999,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 14}}>Not now</Text>
                  </Pressable>
                </View>
              </View>
            ))}
              </>
            ) : (
              <PremiumTeaser onUpgrade={() => router.push("/(vendor)/subscription" as never)} />
            )}

            {/* Save */}
            <Pressable
              onPress={save}
              disabled={saving}
              style={{
                marginTop: 26,
                backgroundColor: GOLD,
                borderRadius: 999,
                height: 54,
                alignItems: "center",
                justifyContent: "center",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? (
                <ActivityIndicator color={INK} />
              ) : (
                <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 16}}>
                  Save scheduling setup
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          <Upsell onUpgrade={() => router.push("/(vendor)/subscription" as never)} />
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
              backgroundColor: PAGE,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 18,
              paddingBottom: 34,
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
              {timeTarget?.[1] === "start" ? "Start time" : "End time"}
            </Text>
            <ScrollView contentContainerStyle={{ padding: 18 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {TIME_OPTIONS.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => {
                      if (!timeTarget) return;
                      const [key, which] = timeTarget;
                      setHours((h) => ({
                        ...h,
                        [key]: { ...(h[key] ?? { on: true, start: "09:00", end: "17:00" }), [which]: t },
                      }));
                      setTimeTarget(null);
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 999,
                      backgroundColor: CARD,
                      borderWidth: 1,
                      borderColor: BORDER,
                    }}
                  >
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>
                      {timeLabel(t)}
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
    <View style={{ marginTop: 26, marginBottom: 10, paddingHorizontal: 2 }}>
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
        borderRadius: 10,
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
    <View style={{ marginBottom: 14 }}>
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
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: on ? INK : CARD,
                borderWidth: 1,
                borderColor: on ? INK : BORDER,
              }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: on ? "#ffffff" : INK }}>
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
        marginBottom: 10,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 18,
        padding: 14,
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
        trackColor={{ false: "#d6d1c6", true: INK }}
        thumbColor="#ffffff"
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
  return (
    <View
      style={{
        marginBottom: 10,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 18,
        padding: 14,
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
          trackColor={{ false: "#d6d1c6", true: INK }}
          thumbColor="#ffffff"
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
                      backgroundColor: sel ? INK : SURFACE,
                    }}
                  >
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 12, color: sel ? "#ffffff" : INK }}>
                      {o}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Input value={text} onChangeText={setText} placeholder="Your message…" multiline />
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
  const [name, setName] = useState(type?.name ?? "");
  const [duration, setDuration] = useState(type?.duration_minutes ?? 60);
  const [active, setActive] = useState(type?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (!name.trim()) {
      dialog.show({ icon: "list", title: "Name it first", message: "Give the appointment type a name — e.g., Consultation call." });
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
      dialog.show({ icon: "alert-circle", title: "Couldn't save", message: error.message });
      return;
    }
    onSaved();
  }

  async function remove() {
    if (!type) return;
    dialog.show({
      icon: "trash-2",
      title: `Delete "${type.name}"?`,
      message: "Hosts won't be able to book this type anymore.",
      confirmLabel: "Delete",
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
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="chevron-left" size={26} color={INK} />
          </Pressable>
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 20, color: INK }}>
            {type ? "Edit appointment type" : "New appointment type"}
          </Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Field label="Name" required>
            <Input value={name} onChangeText={setName} placeholder="e.g., Consultation call" />
          </Field>
          <Field label="Length">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {DURATIONS.map((d) => {
                const on = duration === d;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDuration(d)}
                    style={{
                      paddingHorizontal: 15,
                      paddingVertical: 10,
                      borderRadius: 999,
                      backgroundColor: on ? INK : CARD,
                      borderWidth: 1,
                      borderColor: on ? INK : BORDER,
                    }}
                  >
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: on ? "#ffffff" : INK }}>
                      {d >= 60 ? `${d / 60} hr${d > 60 ? "s" : ""}` : `${d} min`}
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
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }}>Bookable</Text>
            <Switch
              value={active}
              onValueChange={setActive}
              trackColor={{ false: "#d6d1c6", true: INK }}
              thumbColor="#ffffff"
            />
          </View>
          <Pressable
            onPress={save}
            disabled={saving}
            style={{
              marginTop: 14,
              backgroundColor: GOLD,
              borderRadius: 999,
              height: 52,
              alignItems: "center",
              justifyContent: "center",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color={INK} />
            ) : (
              <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 15}}>
                Save appointment type
              </Text>
            )}
          </Pressable>
          {type ? (
            <Pressable onPress={remove} style={{ alignItems: "center", paddingVertical: 16 }}>
              <Text style={{ fontFamily: SERIF_BOLD, color: "#b23a34", fontSize: 14}}>
                Delete appointment type
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
  const rows: { icon: keyof typeof Feather.glyphMap; text: string }[] = [
    { icon: "message-circle", text: "Instant inquiry replies, in your words" },
    { icon: "bell", text: "Confirmations, reminders & follow-ups on autopilot" },
    { icon: "star", text: "Review requests after every event" },
    { icon: "zap", text: "Fill Your Calendar open-date alerts" },
  ];
  return (
    <View
      style={{
        marginTop: 26,
        backgroundColor: "#f3ecdd",
        borderWidth: 1,
        borderColor: GOLD,
        borderRadius: 18,
        padding: 18,
      }}
    >
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 18, color: INK }}>
        Put it on autopilot
      </Text>
      <Text style={{ fontFamily: SERIF, marginTop: 4, fontSize: 13, lineHeight: 18, color: INK_DIM }}>
        Your hours and rules are set — Premium makes Vendora work them for
        you, automatically.
      </Text>
      <View style={{ marginTop: 14, gap: 10 }}>
        {rows.map((r) => (
          <View key={r.icon} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name={r.icon} size={15} color="#8a6f3e" />
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
          height: 48,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <MaterialCommunityIcons name="arrow-up-circle-outline" size={15} color={INK} />
        <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 15}}>
          Upgrade to Premium
        </Text>
      </Pressable>
    </View>
  );
}

// Free-plan pitch: one short card per plan, three lines each. It used
// to be a hero icon, a headline, four icon rows whose titles wrapped
// around their "— Pro" / "— Premium" suffixes, and a footnote repeating
// which plan had what.
const PLAN_CARDS: {
  title: string;
  tag: "PRO" | "PREMIUM";
  lines: string[];
}[] = [
  {
    title: "Smart availability",
    tag: "PRO",
    lines: ["Working hours and buffers", "Booking rules and daily limits", "Up to 5 appointment types"],
  },
  {
    title: "Automations",
    tag: "PREMIUM",
    lines: [
      "Confirmations, reminders, follow-ups",
      "Suggest open dates when you're booked",
      "Alerts to fill open dates",
    ],
  },
];

function Upsell({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <View>
      <SectionTitle title="Unlock more" />
      <View style={{ gap: 12 }}>
        {PLAN_CARDS.map((c) => (
          <View
            key={c.tag}
            style={{
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 18,
              paddingHorizontal: 16,
              paddingTop: 15,
              paddingBottom: 14,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 16, color: INK, flexShrink: 1 }}>
                {c.title}
              </Text>
              <View
                style={{
                  marginLeft: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: c.tag === "PRO" ? GOLD_TAG : INK,
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
              {c.lines.map((line) => (
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
          marginTop: 18,
          backgroundColor: GOLD,
          borderRadius: 27,
          height: 54,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Feather name="arrow-up-circle" size={16} color={INK} />
        <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 16 }}>See plans</Text>
      </Pressable>
    </View>
  );
}
