// Smart Scheduling & Automations — web twin of the app's scheduling
// screen (More → Smart Scheduling). Same tiers, same vocabulary:
//   Free    — 1 appointment type, everything else shows the pitch
//   Pro     — up to 5 types + working hours + booking rules
//   Premium — unlimited types + the automated messages + Fill Your
//             Calendar (nothing promotes without approval)
// Backend is shared with the app: vendor_scheduling_settings,
// vendor_appointment_types (server-side caps), vendor_promo_suggestions,
// triggers + the hourly cron.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DURATIONS = [15, 30, 45, 60, 90, 120];
const BUFFERS = [
  { label: "None", v: 0 },
  { label: "30 min", v: 30 },
  { label: "1 hour", v: 60 },
  { label: "2 hours", v: 120 },
  { label: "1 day", v: 1440 },
];
const NOTICES = [
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

const PRO_TYPE_CAP = 5;

export default function VendorSchedulingPage() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [premium, setPremium] = useState(false);
  const [pro, setPro] = useState(false);
  const [saving, setSaving] = useState(false);

  const [hours, setHours] = useState<WorkingHours>(defaultHours());
  const [buffer, setBuffer] = useState(0);
  const [notice, setNotice] = useState(0);
  const [maxPerDay, setMaxPerDay] = useState<number | null>(null);

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

  const [types, setTypes] = useState<ApptType[]>([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDuration, setNewTypeDuration] = useState(60);
  const [addingType, setAddingType] = useState(false);

  const [suggestions, setSuggestions] = useState<PromoSuggestion[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    const [{ data: prof }, { data: settings }, { data: typeRows }, { data: promoRows }] =
      await Promise.all([
        supabase.from("profiles").select("subscription_tier, unlimited_listings").eq("id", userId).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("vendor_scheduling_settings").select("*").eq("user_id", userId).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_appointment_types")
          .select("id, name, duration_minutes, active, display_order")
          .eq("user_id", userId)
          .order("display_order", { ascending: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_promo_suggestions")
          .select("id, open_dates, status")
          .eq("user_id", userId)
          .eq("status", "suggested")
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
    const p = prof as { subscription_tier?: string; unlimited_listings?: boolean } | null;
    const tier = p?.subscription_tier ?? "free";
    const isPremium = tier === "studio" || tier === "premium" || !!p?.unlimited_listings;
    setPremium(isPremium);
    setPro(isPremium || tier === "pro");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = settings as any;
    if (s) {
      setHours(
        s.working_hours && Object.keys(s.working_hours).length > 0
          ? { ...defaultHours(), ...s.working_hours }
          : defaultHours(),
      );
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
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!userId || saving) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_scheduling_settings").upsert(
      {
        user_id: userId,
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
    if (error) toast.error(error.message);
    else toast.success("Your scheduling setup is live.");
  }

  const canAddType = premium || (pro ? types.length < PRO_TYPE_CAP : types.length < 1);

  async function addType() {
    if (!userId || addingType) return;
    if (!newTypeName.trim()) {
      toast.error("Give the appointment type a name — e.g., Consultation call.");
      return;
    }
    if (!canAddType) {
      toast.error(
        pro
          ? `Pro includes up to ${PRO_TYPE_CAP} appointment types — Premium has no limit.`
          : "Free includes one appointment type — Pro unlocks up to 5.",
      );
      return;
    }
    setAddingType(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_appointment_types").insert({
      user_id: userId,
      name: newTypeName.trim(),
      duration_minutes: newTypeDuration,
      display_order: types.length,
    });
    setAddingType(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewTypeName("");
    void load();
  }

  async function removeType(t: ApptType) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("vendor_appointment_types").delete().eq("id", t.id);
    void load();
  }

  async function decideSuggestion(sug: PromoSuggestion, status: "approved" | "dismissed") {
    setSuggestions((cur) => cur.filter((x) => x.id !== sug.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("vendor_promo_suggestions")
      .update({ status, decided_at: new Date().toISOString() })
      .eq("id", sug.id);
    if (status === "approved")
      toast.success("Openings promoted — they now show as last-minute availability on your public listing.");
  }

  return (
    <div className="min-h-screen flex relative bg-[var(--vendor-canvas)]">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main className="flex-1 min-w-0 pb-24 lg:pb-0">
        <div
          className="px-4 md:px-8 pt-8 pb-6"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <h1 className="text-3xl md:text-4xl tracking-tight">
            Smart Scheduling <span className="text-accent">✦</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Working hours, appointment types, and automations — same setup as the app.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-[1100px] space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {/* Appointment types — every plan */}
              <section className="card-soft p-6">
                <p className="font-label text-accent">Appointment types ✦</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  What can hosts book with you? Give each a name and a length.
                  {!premium ? (
                    <span>
                      {" "}
                      ({types.length}/{pro ? PRO_TYPE_CAP : 1} on {pro ? "Pro" : "Free"})
                    </span>
                  ) : null}
                </p>
                <div className="mt-4 space-y-2">
                  {types.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
                    >
                      <div>
                        <p className="m-0 text-sm font-medium">
                          {t.name}
                          {!t.active ? (
                            <span className="text-muted-foreground"> · off</span>
                          ) : null}
                        </p>
                        <p className="m-0 text-[11.5px] text-muted-foreground">
                          {t.duration_minutes} minutes
                        </p>
                      </div>
                      <button
                        onClick={() => void removeType(t)}
                        aria-label={`Delete ${t.name}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    placeholder="e.g., Consultation call"
                    className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none"
                  />
                  <select
                    value={newTypeDuration}
                    onChange={(e) => setNewTypeDuration(Number(e.target.value))}
                    className="rounded-full border border-border bg-background px-3 py-2 text-sm"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d >= 60 ? `${d / 60} hr${d > 60 ? "s" : ""}` : `${d} min`}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void addType()}
                    disabled={addingType}
                    className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> Add
                  </button>
                </div>
              </section>

              {pro ? (
                <>
                  {/* Working hours */}
                  <section className="card-soft p-6">
                    <p className="font-label text-accent">Your working hours ✦</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      When can appointments happen?
                    </p>
                    <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-background">
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                        const key = String(d);
                        const day = hours[key] ?? { on: false, start: "09:00", end: "17:00" };
                        return (
                          <div key={key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                            <label className="flex w-36 items-center gap-2.5 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={day.on}
                                onChange={(e) =>
                                  setHours((h) => ({ ...h, [key]: { ...day, on: e.target.checked } }))
                                }
                              />
                              {DAY_LABELS[d]}
                            </label>
                            {day.on ? (
                              <span className="flex items-center gap-2 text-sm">
                                <select
                                  value={day.start}
                                  onChange={(e) =>
                                    setHours((h) => ({ ...h, [key]: { ...day, start: e.target.value } }))
                                  }
                                  className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                                >
                                  {TIME_OPTIONS.map((t) => (
                                    <option key={t} value={t}>
                                      {timeLabel(t)}
                                    </option>
                                  ))}
                                </select>
                                –
                                <select
                                  value={day.end}
                                  onChange={(e) =>
                                    setHours((h) => ({ ...h, [key]: { ...day, end: e.target.value } }))
                                  }
                                  className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                                >
                                  {TIME_OPTIONS.map((t) => (
                                    <option key={t} value={t}>
                                      {timeLabel(t)}
                                    </option>
                                  ))}
                                </select>
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">Unavailable</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* Booking rules */}
                  <section className="card-soft p-6">
                    <p className="font-label text-accent">Booking rules ✦</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <RuleSelect
                        label="Buffer between appointments"
                        value={String(buffer)}
                        options={BUFFERS.map((b) => ({ label: b.label, value: String(b.v) }))}
                        onChange={(v) => setBuffer(Number(v))}
                      />
                      <RuleSelect
                        label="Minimum notice"
                        value={String(notice)}
                        options={NOTICES.map((n) => ({ label: n.label, value: String(n.v) }))}
                        onChange={(v) => setNotice(Number(v))}
                      />
                      <RuleSelect
                        label="Max appointments per day"
                        value={maxPerDay === null ? "none" : String(maxPerDay)}
                        options={MAX_PER_DAY.map((m) => ({
                          label: m.label,
                          value: m.v === null ? "none" : String(m.v),
                        }))}
                        onChange={(v) => setMaxPerDay(v === "none" ? null : Number(v))}
                      />
                    </div>
                  </section>

                  {premium ? (
                    <>
                      {/* Automated messages */}
                      <section className="card-soft p-6">
                        <p className="font-label text-accent">Automated messages ✦</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Vendora sends these for you, in your words.
                        </p>
                        <div className="mt-4 space-y-4">
                          <AutoRow
                            title="Instant inquiry reply"
                            sub="Sent the moment a new inquiry lands."
                            on={autoReplyOn}
                            setOn={setAutoReplyOn}
                            text={autoReplyText}
                            setText={setAutoReplyText}
                          />
                          <AutoRow
                            title="Booking confirmations"
                            sub="Sent when you confirm an appointment."
                            on={confirmOn}
                            setOn={setConfirmOn}
                            text={confirmText}
                            setText={setConfirmText}
                          />
                          <AutoRow
                            title="Reminders"
                            sub="Sent before upcoming appointments."
                            on={reminderOn}
                            setOn={setReminderOn}
                            text={reminderText}
                            setText={setReminderText}
                            chips={{
                              options: [
                                { label: "24h before", value: "24" },
                                { label: "48h before", value: "48" },
                              ],
                              value: String(reminderHours),
                              onChange: (v) => setReminderHours(Number(v)),
                            }}
                          />
                          <AutoRow
                            title="Follow-ups"
                            sub="Sent after an appointment passes."
                            on={followupOn}
                            setOn={setFollowupOn}
                            text={followupText}
                            setText={setFollowupText}
                            chips={{
                              options: [
                                { label: "1 day after", value: "1" },
                                { label: "3 days after", value: "3" },
                                { label: "7 days after", value: "7" },
                              ],
                              value: String(followupDays),
                              onChange: (v) => setFollowupDays(Number(v)),
                            }}
                          />
                          <AutoRow
                            title="Review requests"
                            sub="Sent after a booked event wraps."
                            on={reviewOn}
                            setOn={setReviewOn}
                            text={reviewText}
                            setText={setReviewText}
                            chips={{
                              options: [
                                { label: "3 days after", value: "3" },
                                { label: "7 days after", value: "7" },
                                { label: "14 days after", value: "14" },
                              ],
                              value: String(reviewDays),
                              onChange: (v) => setReviewDays(Number(v)),
                            }}
                          />
                          <ToggleRow
                            title="Suggest alternative dates"
                            sub="When someone asks for a date you're booked, your instant reply offers your nearest open dates."
                            on={altDatesOn}
                            setOn={setAltDatesOn}
                          />
                          <ToggleRow
                            title="Fill Your Calendar — open-date alerts"
                            sub="Get notified about unbooked upcoming dates. Nothing is ever promoted without your approval."
                            on={fillOn}
                            setOn={setFillOn}
                          />
                        </div>
                      </section>

                      {suggestions.map((sug) => (
                        <section
                          key={sug.id}
                          className="card-soft border border-accent/40 bg-accent/5 p-6"
                        >
                          <p className="font-label text-accent">Fill your calendar ✦</p>
                          <p className="mt-2 text-sm">
                            <strong>
                              {sug.open_dates.length} open date
                              {sug.open_dates.length === 1 ? "" : "s"} coming up:
                            </strong>{" "}
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
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => void decideSuggestion(sug, "approved")}
                              className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90"
                            >
                              Promote openings
                            </button>
                            <button
                              onClick={() => void decideSuggestion(sug, "dismissed")}
                              className="rounded-full border border-border bg-background px-5 py-2 text-sm font-semibold"
                            >
                              Not now
                            </button>
                          </div>
                        </section>
                      ))}
                    </>
                  ) : (
                    <section className="card-soft border border-accent/40 bg-accent/5 p-6">
                      <p className="font-label text-accent">Put it on autopilot ✦</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Your hours and rules are set — Premium makes Vendora work
                        them for you: instant inquiry replies, confirmations,
                        reminders, follow-ups, review requests, and Fill Your
                        Calendar open-date alerts.
                      </p>
                      <Link
                        to="/vendor/subscription"
                        className="mt-4 inline-block rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background hover:opacity-90"
                      >
                        ✦ Upgrade to Premium
                      </Link>
                    </section>
                  )}

                  <button
                    onClick={() => void save()}
                    disabled={saving}
                    className="w-full rounded-full bg-foreground py-3.5 text-[15px] font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save scheduling setup"}
                  </button>
                </>
              ) : (
                <section className="card-soft p-8 text-center">
                  <Zap className="mx-auto h-8 w-8 text-accent" />
                  <h2 className="font-editorial text-3xl mt-4">Work less. Book more.</h2>
                  <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
                    Pro unlocks the scheduling controls — working hours, buffers,
                    minimum notice, daily limits, and up to 5 appointment types.
                    Premium adds the automations that answer, remind, follow up,
                    and fill your calendar for you.
                  </p>
                  <Link
                    to="/vendor/subscription"
                    className="mt-6 inline-block rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background hover:opacity-90"
                  >
                    ✦ See plans
                  </Link>
                </section>
              )}
            </>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

function RuleSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleRow({
  title,
  sub,
  on,
  setOn,
}: {
  title: string;
  sub: string;
  on: boolean;
  setOn: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[12px] text-muted-foreground mt-0.5">{sub}</span>
      </span>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => setOn(e.target.checked)}
        className="mt-1 h-4 w-4"
      />
    </label>
  );
}

function AutoRow({
  title,
  sub,
  on,
  setOn,
  text,
  setText,
  chips,
}: {
  title: string;
  sub: string;
  on: boolean;
  setOn: (v: boolean) => void;
  text: string;
  setText: (v: string) => void;
  chips?: { options: { label: string; value: string }[]; value: string; onChange: (v: string) => void };
}) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-[12px] text-muted-foreground mt-0.5">{sub}</span>
        </span>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
      </label>
      {on ? (
        <div className="mt-3 space-y-2">
          {chips ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-muted-foreground">Send</span>
              {chips.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => chips.onChange(o.value)}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                    chips.value === o.value
                      ? "bg-foreground text-background"
                      : "bg-secondary hover:bg-muted"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : null}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>
      ) : null}
    </div>
  );
}
