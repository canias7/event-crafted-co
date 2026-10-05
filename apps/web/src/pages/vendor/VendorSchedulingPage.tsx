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
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

// Day names, option labels and default message texts live in
// vendorScheduling.json; `key` points at the label.
const DURATIONS = [15, 30, 45, 60, 90, 120];
const BUFFERS = [
  { key: "none", v: 0 },
  { key: "m30", v: 30 },
  { key: "h1", v: 60 },
  { key: "h2", v: 120 },
  { key: "d1", v: 1440 },
];
const NOTICES = [
  { key: "none", v: 0 },
  { key: "h24", v: 24 },
  { key: "h48", v: 48 },
  { key: "w1", v: 168 },
];
// null = no limit.
const MAX_PER_DAY: (number | null)[] = [null, 1, 2, 3, 5];
const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:30`);
}

function timeLabel(hhmm: string, am: string, pm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? pm : am;
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

const PRO_TYPE_CAP = 5;

export default function VendorSchedulingPage() {
  const { t, i18n } = useTranslation("vendorScheduling");
  // Spanish dates use US-Spanish formats; English keeps the browser default.
  const dateLocale = i18n.resolvedLanguage === "es" ? "es-US" : undefined;
  const dayLabels = t("days", { returnObjects: true }) as string[];
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

  // Message texts: null means "not set yet", so the box shows (and Save
  // stores) the default wording, in the vendor's language.
  const [autoReplyOn, setAutoReplyOn] = useState(false);
  const [autoReplyText, setAutoReplyText] = useState<string | null>(null);
  const [confirmOn, setConfirmOn] = useState(false);
  const [confirmText, setConfirmText] = useState<string | null>(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderHours, setReminderHours] = useState(24);
  const [reminderText, setReminderText] = useState<string | null>(null);
  const [followupOn, setFollowupOn] = useState(false);
  const [followupDays, setFollowupDays] = useState(3);
  const [followupText, setFollowupText] = useState<string | null>(null);
  const [reviewOn, setReviewOn] = useState(false);
  const [reviewDays, setReviewDays] = useState(7);
  const [reviewText, setReviewText] = useState<string | null>(null);
  const autoReplyValue = autoReplyText ?? t("defaults.autoReply");
  const confirmValue = confirmText ?? t("defaults.confirm");
  const reminderValue = reminderText ?? t("defaults.reminder");
  const followupValue = followupText ?? t("defaults.followup");
  const reviewValue = reviewText ?? t("defaults.review");
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
      setAutoReplyText(s.auto_reply_text ?? null);
      setConfirmOn(!!s.confirm_enabled);
      setConfirmText(s.confirm_text ?? null);
      setReminderOn(!!s.reminder_enabled);
      setReminderHours(s.reminder_hours_before ?? 24);
      setReminderText(s.reminder_text ?? null);
      setFollowupOn(!!s.followup_enabled);
      setFollowupDays(s.followup_days_after ?? 3);
      setFollowupText(s.followup_text ?? null);
      setReviewOn(!!s.review_enabled);
      setReviewDays(s.review_days_after ?? 7);
      setReviewText(s.review_text ?? null);
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
        auto_reply_text: autoReplyValue.trim() || null,
        confirm_enabled: confirmOn,
        confirm_text: confirmValue.trim() || null,
        reminder_enabled: reminderOn,
        reminder_hours_before: reminderHours,
        reminder_text: reminderValue.trim() || null,
        followup_enabled: followupOn,
        followup_days_after: followupDays,
        followup_text: followupValue.trim() || null,
        review_enabled: reviewOn,
        review_days_after: reviewDays,
        review_text: reviewValue.trim() || null,
        alt_dates_enabled: altDatesOn,
        fill_calendar_enabled: fillOn,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success(t("toasts.saved"));
  }

  const canAddType = premium || (pro ? types.length < PRO_TYPE_CAP : types.length < 1);

  async function addType() {
    if (!userId || addingType) return;
    if (!newTypeName.trim()) {
      toast.error(t("toasts.typeNameRequired"));
      return;
    }
    if (!canAddType) {
      toast.error(
        pro
          ? t("toasts.proCap", { cap: PRO_TYPE_CAP })
          : t("toasts.freeCap"),
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

  async function removeType(type: ApptType) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("vendor_appointment_types").delete().eq("id", type.id);
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
      toast.success(t("toasts.promoted"));
  }

  return (
    <div className="min-h-screen flex relative bg-[var(--vendor-canvas)]">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main className="flex-1 min-w-0 pb-24 lg:pb-0">
        <div
          className="px-5 md:px-8 pt-8 pb-6"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <h1 className="text-3xl md:text-4xl tracking-tight">
            {t("header.title")} <span className="text-accent">✦</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("header.subtitle")}
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-[1100px] space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-4">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
            </div>
          ) : (
            <>
              {/* Appointment types — every plan */}
              <section className="card-soft p-6">
                <p className="font-label text-accent">{t("types.title")} ✦</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("types.body")}
                  {!premium ? (
                    <span>
                      {" "}
                      {t(pro ? "types.usagePro" : "types.usageFree", {
                        used: types.length,
                        cap: pro ? PRO_TYPE_CAP : 1,
                      })}
                    </span>
                  ) : null}
                </p>
                <div className="mt-4 space-y-2">
                  {types.map((type) => (
                    <div
                      key={type.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
                    >
                      <div>
                        <p className="m-0 text-sm font-medium">
                          {type.name}
                          {!type.active ? (
                            <span className="text-muted-foreground"> · {t("types.off")}</span>
                          ) : null}
                        </p>
                        <p className="m-0 text-[11.5px] text-muted-foreground">
                          {t("types.minutes", { minutes: type.duration_minutes })}
                        </p>
                      </div>
                      <button
                        onClick={() => void removeType(type)}
                        aria-label={t("types.delete", { name: type.name })}
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
                    placeholder={t("types.placeholder")}
                    className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none"
                  />
                  <select
                    value={newTypeDuration}
                    onChange={(e) => setNewTypeDuration(Number(e.target.value))}
                    className="rounded-full border border-border bg-background px-3 py-2 text-sm"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d >= 60
                          ? t("duration.hours", { count: d / 60 })
                          : t("duration.minutes", { minutes: d })}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void addType()}
                    disabled={addingType}
                    className="inline-flex justify-center items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-bold text-foreground hover:bg-gold-hover transition-colors disabled:bg-gold-muted h-9"
                  >
                    <Plus className="h-4 w-4" /> {t("types.add")}
                  </button>
                </div>
              </section>

              {pro ? (
                <>
                  {/* Working hours */}
                  <section className="card-soft p-6">
                    <p className="font-label text-accent">{t("hours.title")} ✦</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("hours.body")}
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
                              {dayLabels[d]}
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
                                  {TIME_OPTIONS.map((hhmm) => (
                                    <option key={hhmm} value={hhmm}>
                                      {timeLabel(hhmm, t("time.am"), t("time.pm"))}
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
                                  {TIME_OPTIONS.map((hhmm) => (
                                    <option key={hhmm} value={hhmm}>
                                      {timeLabel(hhmm, t("time.am"), t("time.pm"))}
                                    </option>
                                  ))}
                                </select>
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">{t("hours.unavailable")}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* Booking rules */}
                  <section className="card-soft p-6">
                    <p className="font-label text-accent">{t("rules.title")} ✦</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <RuleSelect
                        label={t("rules.buffer")}
                        value={String(buffer)}
                        options={BUFFERS.map((b) => ({ label: t(`buffers.${b.key}`), value: String(b.v) }))}
                        onChange={(v) => setBuffer(Number(v))}
                      />
                      <RuleSelect
                        label={t("rules.notice")}
                        value={String(notice)}
                        options={NOTICES.map((n) => ({ label: t(`notices.${n.key}`), value: String(n.v) }))}
                        onChange={(v) => setNotice(Number(v))}
                      />
                      <RuleSelect
                        label={t("rules.maxPerDay")}
                        value={maxPerDay === null ? "none" : String(maxPerDay)}
                        options={MAX_PER_DAY.map((m) => ({
                          label: m === null ? t("noLimit") : String(m),
                          value: m === null ? "none" : String(m),
                        }))}
                        onChange={(v) => setMaxPerDay(v === "none" ? null : Number(v))}
                      />
                    </div>
                  </section>

                  {premium ? (
                    <>
                      {/* Automated messages */}
                      <section className="card-soft p-6">
                        <p className="font-label text-accent">{t("auto.title")} ✦</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("auto.body")}
                        </p>
                        <div className="mt-4 space-y-4">
                          <AutoRow
                            title={t("auto.instantReply.title")}
                            sub={t("auto.instantReply.sub")}
                            on={autoReplyOn}
                            setOn={setAutoReplyOn}
                            text={autoReplyValue}
                            setText={setAutoReplyText}
                          />
                          <AutoRow
                            title={t("auto.confirmations.title")}
                            sub={t("auto.confirmations.sub")}
                            on={confirmOn}
                            setOn={setConfirmOn}
                            text={confirmValue}
                            setText={setConfirmText}
                          />
                          <AutoRow
                            title={t("auto.reminders.title")}
                            sub={t("auto.reminders.sub")}
                            on={reminderOn}
                            setOn={setReminderOn}
                            text={reminderValue}
                            setText={setReminderText}
                            chips={{
                              options: [
                                { label: t("auto.hoursBefore", { hours: 24 }), value: "24" },
                                { label: t("auto.hoursBefore", { hours: 48 }), value: "48" },
                              ],
                              value: String(reminderHours),
                              onChange: (v) => setReminderHours(Number(v)),
                            }}
                          />
                          <AutoRow
                            title={t("auto.followups.title")}
                            sub={t("auto.followups.sub")}
                            on={followupOn}
                            setOn={setFollowupOn}
                            text={followupValue}
                            setText={setFollowupText}
                            chips={{
                              options: [
                                { label: t("auto.daysAfter", { count: 1 }), value: "1" },
                                { label: t("auto.daysAfter", { count: 3 }), value: "3" },
                                { label: t("auto.daysAfter", { count: 7 }), value: "7" },
                              ],
                              value: String(followupDays),
                              onChange: (v) => setFollowupDays(Number(v)),
                            }}
                          />
                          <AutoRow
                            title={t("auto.reviews.title")}
                            sub={t("auto.reviews.sub")}
                            on={reviewOn}
                            setOn={setReviewOn}
                            text={reviewValue}
                            setText={setReviewText}
                            chips={{
                              options: [
                                { label: t("auto.daysAfter", { count: 3 }), value: "3" },
                                { label: t("auto.daysAfter", { count: 7 }), value: "7" },
                                { label: t("auto.daysAfter", { count: 14 }), value: "14" },
                              ],
                              value: String(reviewDays),
                              onChange: (v) => setReviewDays(Number(v)),
                            }}
                          />
                          <ToggleRow
                            title={t("auto.altDates.title")}
                            sub={t("auto.altDates.sub")}
                            on={altDatesOn}
                            setOn={setAltDatesOn}
                          />
                          <ToggleRow
                            title={t("auto.fill.title")}
                            sub={t("auto.fill.sub")}
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
                          <p className="font-label text-accent">{t("fill.title")} ✦</p>
                          <p className="mt-2 text-sm">
                            <strong>
                              {t("fill.openDates", { count: sug.open_dates.length })}
                            </strong>{" "}
                            {sug.open_dates
                              .slice(0, 6)
                              .map((d) =>
                                new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale, {
                                  month: "short",
                                  day: "numeric",
                                }),
                              )
                              .join(" · ")}
                            {sug.open_dates.length > 6
                              ? ` ${t("fill.more", { more: sug.open_dates.length - 6 })}`
                              : ""}
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => void decideSuggestion(sug, "approved")}
                              className="inline-flex justify-center items-center rounded-full bg-gold px-5 text-sm font-bold text-foreground hover:bg-gold-hover h-9"
                            >
                              {t("fill.promote")}
                            </button>
                            <button
                              onClick={() => void decideSuggestion(sug, "dismissed")}
                              className="rounded-full border border-border bg-background px-5 py-2 text-sm font-semibold"
                            >
                              {t("fill.notNow")}
                            </button>
                          </div>
                        </section>
                      ))}
                    </>
                  ) : (
                    <section className="card-soft border border-accent/40 bg-accent/5 p-6">
                      <p className="font-label text-accent">{t("upsell.premiumTitle")} ✦</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("upsell.premiumBody")}
                      </p>
                      <Link
                        to="/vendor/subscription"
                        className="inline-flex justify-center items-center mt-4 rounded-full bg-gold px-6 text-sm font-bold text-foreground hover:bg-gold-hover h-11"
                      >
                        ✦ {t("upsell.upgradePremium")}
                      </Link>
                    </section>
                  )}

                  <button
                    onClick={() => void save()}
                    disabled={saving}
                    className="inline-flex justify-center items-center w-full rounded-full bg-gold text-[15px] font-bold text-foreground hover:bg-gold-hover transition-colors disabled:bg-gold-muted h-[52px]"
                  >
                    {saving ? t("saving") : t("save")}
                  </button>
                </>
              ) : (
                <section className="card-soft p-8 text-center">
                  <Zap className="mx-auto h-8 w-8 text-accent" />
                  <h2 className="font-editorial text-3xl mt-4">{t("upsell.proTitle")}</h2>
                  <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
                    {t("upsell.proBody")}
                  </p>
                  <Link
                    to="/vendor/subscription"
                    className="inline-flex justify-center items-center mt-6 rounded-full bg-gold px-6 text-sm font-bold text-foreground hover:bg-gold-hover h-11"
                  >
                    ✦ {t("upsell.seePlans")}
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
  const { t } = useTranslation("vendorScheduling");
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
              <span className="text-[12px] font-medium text-muted-foreground">{t("auto.send")}</span>
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
