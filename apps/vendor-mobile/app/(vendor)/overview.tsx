// Overview tab (owner's call, Oct 2026): the website's vendor Overview
// (Web studio → Overview) sized for a phone. Same data and rules:
//
// - A period: quick picks (today, this week, this month, last 30 / 90
//   days, this year, last 12 months) or custom dates, grouped by day /
//   week / month, read through vendor_overview_range in the phone's
//   time zone. The choice is remembered on the phone.
// - Revenue = invoices paid through Vendora + payments the vendor records
//   (vendor_outside_payments); expenses = vendor_expenses rows
//   (account-level, user_id). Both can be recorded and deleted here.
// - Inquiries, cash flow and expenses follow the period; recent activity
//   is always the latest payments.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Wordmark } from "@/components/Wordmark";
import { useBrandDialog } from "@/components/listing/WizardKit";
import { useT } from "@/lib/i18n";
import { C } from "@/lib/theme";
import { RADIUS, BUTTON_HEIGHT } from "@/lib/ui";

const PAGE = C.page;
const CARD = C.card;
const SURFACE = C.surface;
const BORDER = C.border;
const INK = C.text;
const INK_DIM = C.textDim;
const PLACEHOLDER = C.placeholder;
const GOLD = C.gold;
const GOLD_MUTED = C.goldMuted;
const ON_GOLD = C.onGold;
const BRONZE = C.accentText;
const SELECTED = C.selected;
const ON_SELECTED = C.onSelected;
const FIELD = C.field;
const ERROR = C.error;
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

// ─── Period ─────────────────────────────────────────────────────────

const PRESETS = ["today", "this_week", "this_month", "last_30", "last_90", "this_year", "last_12m", "custom"] as const;
type Preset = (typeof PRESETS)[number];
type Bucket = "day" | "week" | "month";
interface Range {
  preset: Preset;
  from: Date;
  to: Date;
  bucket: Bucket;
}

const STORE_KEY = "vendora-overview-range";
const MAX_RANGE_DAYS = 1100;
// Daily bars stop being readable on a phone past about two months.
const MAX_DAY_BUCKETS = 62;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function daysIn(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000) + 1;
}
function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function presetDates(p: Exclude<Preset, "custom">): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "this_week":
      return { from: addDays(today, -((today.getDay() + 6) % 7)), to: today };
    case "this_month":
      return { from: new Date(y, m, 1), to: today };
    case "last_30":
      return { from: addDays(today, -29), to: today };
    case "last_90":
      return { from: addDays(today, -89), to: today };
    case "this_year":
      return { from: new Date(y, 0, 1), to: today };
    case "last_12m":
      return { from: new Date(y, m - 11, 1), to: today };
  }
}
function defaultBucket(from: Date, to: Date): Bucket {
  const n = daysIn(from, to);
  if (n <= 31) return "day";
  if (n <= 180) return "week";
  return "month";
}
function allowedBuckets(from: Date, to: Date): Bucket[] {
  return daysIn(from, to) > MAX_DAY_BUCKETS ? ["week", "month"] : ["day", "week", "month"];
}
function fromPreset(p: Exclude<Preset, "custom">): Range {
  const { from, to } = presetDates(p);
  return { preset: p, from, to, bucket: defaultBucket(from, to) };
}

// ─── Money / dates ──────────────────────────────────────────────────

// Money stays in the US format in every language (like the website).
function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function moneyShort(cents: number): string {
  const v = cents / 100;
  if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `$${Math.round(v)}`;
}
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 100_000_000) return null;
  return cents;
}

const METHODS = ["cash", "zelle", "check", "venmo", "bank_transfer", "card", "other"] as const;
const CATEGORIES = ["supplies", "rentals", "labor", "travel", "mileage", "marketing", "software", "fees", "meals", "insurance", "other"] as const;

interface Leads { new: number; active: number; won: number; lost: number; total: number }
interface Expenses { total: number; count: number; categoryCount: number; topCategories: { label: string; cents: number }[] }
interface Activity { id: string; who: string | null; label: string; cents: number; at: string; outside: boolean }

const EMPTY_LEADS: Leads = { new: 0, active: 0, won: 0, lost: 0, total: 0 };
const EMPTY_EXP: Expenses = { total: 0, count: 0, categoryCount: 0, topCategories: [] };

// ─── Screen ─────────────────────────────────────────────────────────

export default function OverviewScreen() {
  const { user } = useAuth();
  const { t, locale } = useT("overview");
  const dialog = useBrandDialog();

  const [range, setRange] = useState<Range>(() => fromPreset("last_30"));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revenue, setRevenue] = useState(0);
  const [revenuePrev, setRevenuePrev] = useState(0);
  const [series, setSeries] = useState<{ start: string; cents: number }[]>([]);
  const [leads, setLeads] = useState<Leads>(EMPTY_LEADS);
  const [expenses, setExpenses] = useState<Expenses>(EMPTY_EXP);
  const [recent, setRecent] = useState<Activity[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  // Keeps the selected quick pick in view in its sideways row.
  const chipRow = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  useEffect(() => {
    const x = chipX.current[range.preset];
    if (x !== undefined) chipRow.current?.scrollTo({ x: Math.max(0, x - 20), animated: true });
  }, [range.preset]);

  // Restore the saved quick pick + grouping (custom dates go stale, so
  // a saved custom choice starts again from the last 30 days).
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw) as { preset?: string; bucket?: string };
        if (!s.preset || s.preset === "custom" || !(PRESETS as readonly string[]).includes(s.preset)) return;
        const r = fromPreset(s.preset as Exclude<Preset, "custom">);
        if (s.bucket && allowedBuckets(r.from, r.to).includes(s.bucket as Bucket)) r.bucket = s.bucket as Bucket;
        setRange(r);
      })
      .catch(() => {});
  }, []);

  const apply = (r: Range) => {
    setRange(r);
    setPicked(null);
    AsyncStorage.setItem(STORE_KEY, JSON.stringify({ preset: r.preset, bucket: r.bucket })).catch(() => {});
  };

  const load = useCallback(async () => {
    if (!user?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    let tz = "UTC";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      /* Intl without time zones: the server falls back to UTC */
    }
    const { data: vps } = await db.from("vendor_profiles").select("id").eq("user_id", user.id);
    const ids = ((vps ?? []) as { id: string }[]).map((v) => v.id);
    const none = Promise.resolve({ data: [] as unknown[] });
    const [{ data: a }, { data: paid }, { data: outside }] = await Promise.all([
      db.rpc("vendor_overview_range", {
        p_from: iso(range.from),
        p_to: iso(range.to),
        p_bucket: range.bucket,
        p_tz: tz,
      }),
      ids.length
        ? db
            .from("invoices")
            .select("id, invoice_number, total_cents, paid_at, bill_to_name")
            .in("vendor_id", ids)
            .eq("status", "paid")
            .order("paid_at", { ascending: false })
            .limit(5)
        : none,
      db
        .from("vendor_outside_payments")
        .select("id, amount_cents, received_on, method, client_name")
        .order("received_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    const r = (a ?? {}) as {
      revenue?: number;
      revenuePrev?: number;
      series?: { start: string; cents: number }[];
      leads?: Leads;
      expenses?: Expenses;
    };
    setRevenue(r.revenue ?? 0);
    setRevenuePrev(r.revenuePrev ?? 0);
    setSeries(Array.isArray(r.series) ? r.series : []);
    setLeads(r.leads ?? EMPTY_LEADS);
    setExpenses(r.expenses ?? EMPTY_EXP);
    const rows: Activity[] = [
      ...((paid ?? []) as { id: string; invoice_number: string; total_cents: number; paid_at: string; bill_to_name: string | null }[]).map(
        (i) => ({ id: i.id, who: i.bill_to_name, label: i.invoice_number, cents: i.total_cents, at: i.paid_at, outside: false }),
      ),
      ...((outside ?? []) as { id: string; amount_cents: number; received_on: string; method: string; client_name: string | null }[]).map(
        (o) => ({
          id: `op-${o.id}`,
          who: o.client_name,
          label: t(`methods.${o.method}`),
          cents: o.amount_cents,
          at: `${o.received_on}T12:00:00Z`,
          outside: true,
        }),
      ),
    ];
    rows.sort((x, y) => (x.at < y.at ? 1 : -1));
    setRecent(rows.slice(0, 5));
    setLoading(false);
    setRefreshing(false);
    // t only changes with the language, which restarts the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, range]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const periodLabel =
    range.preset === "custom" ? rangeText(range.from, range.to, locale) : t(`presets.${range.preset}`);
  const delta = revenuePrev > 0 ? ((revenue - revenuePrev) / revenuePrev) * 100 : null;
  const buckets = allowedBuckets(range.from, range.to);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={INK}
          />
        }
      >
        <Wordmark />
        <Text style={{ marginTop: 24, fontFamily: SERIF_BOLD, fontSize: 34, letterSpacing: -0.5, color: INK }}>
          {t("title")}
        </Text>
        <Text style={{ fontFamily: SERIF, marginTop: 6, fontSize: 14, color: INK_DIM, lineHeight: 20 }}>
          {t("subtitle")}
        </Text>

        {/* Quick picks */}
        <ScrollView
          ref={chipRow}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 18, marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {PRESETS.map((p) => {
            const on = range.preset === p;
            return (
              <Pressable
                key={p}
                onLayout={(e) => {
                  chipX.current[p] = e.nativeEvent.layout.x;
                  if (p === range.preset) chipRow.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 20), animated: false });
                }}
                onPress={() => (p === "custom" ? setCustomOpen(true) : apply(fromPreset(p)))}
                style={{
                  height: BUTTON_HEIGHT.sm,
                  paddingHorizontal: 14,
                  borderRadius: RADIUS.pill,
                  justifyContent: "center",
                  backgroundColor: on ? SELECTED : CARD,
                  borderWidth: 1,
                  borderColor: on ? SELECTED : BORDER,
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 12, color: on ? ON_SELECTED : INK }}>
                  {t(`presets.${p}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Pressable onPress={() => setCustomOpen(true)} style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
            <Feather name="calendar" size={14} color={BRONZE} />
            <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 12, color: INK, marginLeft: 6, flexShrink: 1 }}>
              {rangeText(range.from, range.to, locale)}
            </Text>
          </Pressable>
          <View style={{ flexDirection: "row", borderWidth: 1, borderColor: BORDER, borderRadius: RADIUS.pill, padding: 2, backgroundColor: CARD }}>
            {(["day", "week", "month"] as const).map((b) => {
              const ok = buckets.includes(b);
              const on = range.bucket === b;
              return (
                <Pressable
                  key={b}
                  disabled={!ok}
                  onPress={() => apply({ ...range, bucket: b })}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: on ? SELECTED : "transparent", opacity: ok ? 1 : 0.4 }}
                >
                  <Text style={{ fontFamily: SERIF_BOLD, fontSize: 11, color: on ? ON_SELECTED : INK }}>{t(`buckets.${b}`)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={INK} />
          </View>
        ) : (
          <>
            {/* Revenue */}
            <View style={[cardStyle, { marginTop: 16 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={labelStyle}>{t("revenue.label")}</Text>
                  <Text style={{ fontFamily: SERIF_BOLD, fontSize: 26, color: INK, marginTop: 4 }}>{money(revenue)}</Text>
                </View>
                {delta !== null ? (
                  <Text style={{ fontFamily: SERIF_BOLD, fontSize: 12, color: delta >= 0 ? BRONZE : ERROR }}>
                    {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
                  </Text>
                ) : null}
              </View>
              <Text style={{ fontFamily: SERIF, fontSize: 12, color: INK_DIM, marginTop: 4 }}>
                {t("revenue.sub", { period: periodLabel })}
              </Text>
              <RevenueBars
                series={series}
                bucket={range.bucket}
                locale={locale}
                picked={picked}
                onPick={setPicked}
                emptyText={t("revenue.empty")}
                weekOf={(d) => t("revenue.weekOf", { date: d })}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => setPaymentOpen(true)} style={[btn, { backgroundColor: GOLD }]}>
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: ON_GOLD }}>{t("record.payment")}</Text>
              </Pressable>
              <Pressable onPress={() => setExpenseOpen(true)} style={[btn, { backgroundColor: FIELD, borderWidth: 1, borderColor: BORDER }]}>
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>{t("record.expense")}</Text>
              </Pressable>
            </View>

            {/* Inquiries + cash flow */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <View style={[cardStyle, { flex: 1 }]}>
                <Text style={labelStyle}>{t("inquiries.label")}</Text>
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 22, color: INK, marginTop: 4 }}>{leads.total}</Text>
                {(["new", "active", "won", "lost"] as const).map((k) => (
                  <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                    <Text style={{ fontFamily: SERIF, fontSize: 12, color: INK }}>{t(`inquiries.${k}`)}</Text>
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 12, color: INK }}>{leads[k]}</Text>
                  </View>
                ))}
              </View>
              <View style={[cardStyle, { flex: 1 }]}>
                <Text style={labelStyle}>{t("cash.label")}</Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ fontFamily: SERIF_BOLD, fontSize: 22, color: revenue - expenses.total >= 0 ? BRONZE : ERROR, marginTop: 4 }}
                >
                  {money(revenue - expenses.total)}
                </Text>
                <Text style={{ fontFamily: SERIF, fontSize: 11, color: INK_DIM, marginTop: 2 }}>{t("cash.net")}</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 12, color: INK }}>{t("cash.in")}</Text>
                  <Text style={{ fontFamily: SERIF_BOLD, fontSize: 12, color: BRONZE }}>{moneyShort(revenue)}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 12, color: INK }}>{t("cash.out")}</Text>
                  <Text style={{ fontFamily: SERIF_BOLD, fontSize: 12, color: INK }}>{moneyShort(expenses.total)}</Text>
                </View>
              </View>
            </View>

            {/* Expenses */}
            <View style={[cardStyle, { marginTop: 12 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <Text style={labelStyle}>{t("expenses.label")}</Text>
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }}>{money(expenses.total)}</Text>
              </View>
              {expenses.count === 0 ? (
                <Text style={{ fontFamily: SERIF_ITALIC, fontSize: 13, color: INK_DIM, marginTop: 10 }}>{t("expenses.empty")}</Text>
              ) : (
                expenses.topCategories.map((c) => (
                  <View key={c.label} style={{ marginTop: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 13, color: INK, flex: 1, marginRight: 8 }}>
                        {c.label === "Other" ? t("expenses.other") : c.label}
                      </Text>
                      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>{money(c.cents)}</Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: SURFACE, marginTop: 5, overflow: "hidden" }}>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: GOLD, width: `${expenses.total > 0 ? Math.max(3, (c.cents / expenses.total) * 100) : 0}%` }} />
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Recent activity */}
            <Text style={[labelStyle, { marginTop: 24, marginBottom: 8 }]}>{t("recent.label")}</Text>
            <View style={[cardStyle, { paddingVertical: 4 }]}>
              {recent.length === 0 ? (
                <Text style={{ fontFamily: SERIF_ITALIC, fontSize: 13, color: INK_DIM, paddingVertical: 12 }}>{t("recent.empty")}</Text>
              ) : (
                recent.map((r, i) => (
                  <View
                    key={r.id}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: BORDER }}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text numberOfLines={1} style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>
                        {r.who || "—"} · <Text style={{ fontFamily: SERIF }}>{r.label}</Text>
                      </Text>
                      <Text style={{ fontFamily: SERIF, fontSize: 11, color: INK_DIM, marginTop: 2 }}>
                        {fmtDay(r.outside ? parseIso(r.at.slice(0, 10)) : new Date(r.at), locale)}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: BRONZE }}>{money(r.cents)}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      {customOpen ? (
        <CalendarSheet
          mode="range"
          initialFrom={range.from}
          initialTo={range.to}
          locale={locale}
          onClose={() => setCustomOpen(false)}
          onApply={(from, to) => {
            if (daysIn(from, to) > MAX_RANGE_DAYS) {
              dialog.show({ title: t("range.tooLong") });
              return;
            }
            apply({ preset: "custom", from, to, bucket: defaultBucket(from, to) });
            setCustomOpen(false);
          }}
        />
      ) : null}
      {paymentOpen ? (
        <PaymentSheet onClose={() => setPaymentOpen(false)} onChanged={() => void load()} />
      ) : null}
      {expenseOpen ? (
        <ExpenseSheet onClose={() => setExpenseOpen(false)} onChanged={() => void load()} />
      ) : null}
      {dialog.element}
    </SafeAreaView>
  );
}

const cardStyle = {
  backgroundColor: CARD,
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: RADIUS.card,
  padding: 16,
} as const;
const labelStyle = { fontFamily: SERIF_BOLD, fontSize: 10, letterSpacing: 1.4, color: BRONZE, textTransform: "uppercase" } as const;
const btn = {
  flex: 1,
  height: BUTTON_HEIGHT.md,
  borderRadius: RADIUS.pill,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 8,
} as const;

function fmtDay(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}
function rangeText(from: Date, to: Date, locale: string): string {
  if (iso(from) === iso(to)) return fmtDay(to, locale);
  const sameYear = from.getFullYear() === to.getFullYear();
  const a = from.toLocaleDateString(locale, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  return `${a} – ${fmtDay(to, locale)}`;
}

// ─── Chart ──────────────────────────────────────────────────────────

function RevenueBars({
  series,
  bucket,
  locale,
  picked,
  onPick,
  emptyText,
  weekOf,
}: {
  series: { start: string; cents: number }[];
  bucket: Bucket;
  locale: string;
  picked: number | null;
  onPick: (i: number | null) => void;
  emptyText: string;
  weekOf: (date: string) => string;
}) {
  const H = 120;
  const max = series.reduce((m, p) => Math.max(m, p.cents), 0);
  const hasData = max > 0;
  const n = Math.max(1, series.length);
  const axis = (s: string) => {
    const d = parseIso(s);
    return bucket === "month"
      ? d.toLocaleDateString(locale, { month: "short" })
      : d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  };
  const long = (s: string) => {
    const d = parseIso(s);
    if (bucket === "month") return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
    const day = fmtDay(d, locale);
    return bucket === "week" ? weekOf(day) : day;
  };
  const p = picked !== null && series[picked] ? series[picked] : null;
  const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ height: 18 }}>
        {p ? (
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 12, color: INK }}>
            {money(p.cents)} <Text style={{ fontFamily: SERIF, color: INK_DIM }}>· {long(p.start)}</Text>
          </Text>
        ) : null}
      </View>
      <View style={{ height: H, flexDirection: "row", alignItems: "flex-end", gap: n > 40 ? 1 : n > 20 ? 2 : 4 }}>
        {(series.length ? series : [{ start: "", cents: 0 }]).map((s, i) => {
          const h = hasData ? Math.max(s.cents > 0 ? 3 : 1, (s.cents / max) * H) : 18 + 14 * Math.abs(Math.sin(i * 0.9));
          const on = picked === i;
          return (
            <Pressable
              key={s.start || i}
              onPress={() => onPick(on || !hasData ? null : i)}
              style={{ flex: 1, height: H, justifyContent: "flex-end" }}
            >
              <View
                style={{
                  height: h,
                  borderTopLeftRadius: 3,
                  borderTopRightRadius: 3,
                  backgroundColor: hasData ? (on ? BRONZE : GOLD) : SURFACE,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={{ height: 1, backgroundColor: BORDER }} />
      {hasData && series.length ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          {labelIdx.map((i, k) => (
            <Text key={k} style={{ fontFamily: SERIF, fontSize: 10, color: INK_DIM }}>
              {axis(series[i].start)}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={{ fontFamily: SERIF_ITALIC, fontSize: 12, color: INK_DIM, marginTop: 8, textAlign: "center" }}>{emptyText}</Text>
      )}
    </View>
  );
}

// ─── Calendar sheet (custom range or one day) ───────────────────────

function CalendarSheet({
  mode,
  initialFrom,
  initialTo,
  locale,
  onClose,
  onApply,
}: {
  mode: "range" | "single";
  initialFrom: Date;
  initialTo: Date;
  locale: string;
  onClose: () => void;
  onApply: (from: Date, to: Date) => void;
}) {
  const { t } = useT("overview");
  const today = startOfDay(new Date());
  const [from, setFrom] = useState<Date | null>(initialFrom);
  const [to, setTo] = useState<Date | null>(mode === "single" ? initialFrom : initialTo);
  const [month, setMonth] = useState(new Date((initialTo ?? today).getFullYear(), (initialTo ?? today).getMonth(), 1));

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= count; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [month]);
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "narrow" })),
    [locale],
  );

  const tap = (d: Date) => {
    if (mode === "single") {
      setFrom(d);
      setTo(d);
      return;
    }
    if (!from || (from && to)) {
      setFrom(d);
      setTo(null);
    } else if (d < from) {
      setTo(from);
      setFrom(d);
    } else {
      setTo(d);
    }
  };

  const inRange = (d: Date) => from && to && d >= from && d <= to;
  const canNext = new Date(month.getFullYear(), month.getMonth() + 1, 1) <= today;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(20,22,26,0.45)", justifyContent: "center", padding: 20 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: CARD, borderRadius: RADIUS.sheet, padding: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable hitSlop={10} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <Feather name="chevron-left" size={20} color={INK} />
            </Pressable>
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 15, color: INK }}>
              {month.toLocaleDateString(locale, { month: "long", year: "numeric" })}
            </Text>
            <Pressable hitSlop={10} disabled={!canNext} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <Feather name="chevron-right" size={20} color={canNext ? INK : BORDER} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", marginTop: 12 }}>
            {weekdays.map((w, i) => (
              <Text key={i} style={{ flex: 1, textAlign: "center", fontFamily: SERIF, fontSize: 11, color: INK_DIM }}>
                {w}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
            {days.map((d, i) => {
              if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 40 }} />;
              const future = d > today;
              const isEnd = (from && iso(d) === iso(from)) || (to && iso(d) === iso(to));
              const mid = !isEnd && inRange(d);
              return (
                <Pressable
                  key={i}
                  disabled={future}
                  onPress={() => tap(d)}
                  style={{ width: `${100 / 7}%`, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: mid ? C.pending : "transparent" }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isEnd ? SELECTED : "transparent",
                    }}
                  >
                    <Text style={{ fontFamily: isEnd ? SERIF_BOLD : SERIF, fontSize: 13, color: isEnd ? ON_SELECTED : future ? BORDER : INK }}>
                      {d.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontFamily: SERIF, fontSize: 12, color: INK_DIM, marginTop: 10 }}>
            {from ? rangeText(from, to ?? from, locale) : t("range.pickStart")}
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Pressable onPress={onClose} style={[btn, { backgroundColor: FIELD, borderWidth: 1, borderColor: BORDER }]}>
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>{t("range.cancel")}</Text>
            </Pressable>
            <Pressable
              disabled={!from}
              onPress={() => from && onApply(from, to ?? from)}
              style={[btn, { backgroundColor: from ? GOLD : GOLD_MUTED }]}
            >
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: ON_GOLD }}>{t("range.apply")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Record a payment / an expense ──────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}
const inputStyle = {
  fontFamily: SERIF,
  fontSize: 15,
  color: INK,
  backgroundColor: FIELD,
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: RADIUS.input,
  paddingHorizontal: 14,
  height: 44,
} as const;

function Chips<T extends string>({ values, value, onChange, label }: { values: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {values.map((v) => {
        const on = v === value;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            style={{ paddingHorizontal: 12, height: BUTTON_HEIGHT.sm, borderRadius: RADIUS.pill, justifyContent: "center", backgroundColor: on ? SELECTED : FIELD, borderWidth: 1, borderColor: on ? SELECTED : BORDER }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 12, color: on ? ON_SELECTED : INK }}>{label(v)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SheetShell({ title, intro, onClose, children }: { title: string; intro: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: SERIF_BOLD, fontSize: 26, color: INK, flex: 1 }}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={10} style={{ marginTop: 6 }}>
                <Feather name="x" size={22} color={INK} />
              </Pressable>
            </View>
            <Text style={{ fontFamily: SERIF, fontSize: 13, color: INK_DIM, marginTop: 6, lineHeight: 19 }}>{intro}</Text>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function DateField({ value, onChange, locale }: { value: Date; onChange: (d: Date) => void; locale: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[inputStyle, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
        <Text style={{ fontFamily: SERIF, fontSize: 15, color: INK }}>{fmtDay(value, locale)}</Text>
        <Feather name="calendar" size={16} color={BRONZE} />
      </Pressable>
      {open ? (
        <CalendarSheet
          mode="single"
          initialFrom={value}
          initialTo={value}
          locale={locale}
          onClose={() => setOpen(false)}
          onApply={(d) => {
            onChange(d);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function SavedList({ title, rows, onDelete, emptyText }: { title: string; rows: { id: string; top: string; bottom: string }[]; onDelete: (id: string) => void; emptyText: string }) {
  return (
    <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 16 }}>
      <Text style={labelStyle}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={{ fontFamily: SERIF_ITALIC, fontSize: 13, color: INK_DIM, marginTop: 8 }}>{emptyText}</Text>
      ) : (
        rows.map((r, i) => (
          <View key={r.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: BORDER }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text numberOfLines={1} style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>{r.top}</Text>
              <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 11, color: INK_DIM, marginTop: 2 }}>{r.bottom}</Text>
            </View>
            <Pressable hitSlop={10} onPress={() => onDelete(r.id)}>
              <Feather name="trash-2" size={17} color={INK_DIM} />
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

function PaymentSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { t, locale } = useT("overview");
  const dialog = useBrandDialog();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(startOfDay(new Date()));
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [client, setClient] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [bad, setBad] = useState(false);
  const [rows, setRows] = useState<{ id: string; amount_cents: number; received_on: string; method: string; client_name: string | null }[]>([]);

  const loadRows = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_outside_payments")
      .select("id, amount_cents, received_on, method, client_name")
      .order("received_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);
    setRows(data ?? []);
  }, []);
  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const save = async () => {
    const cents = parseAmount(amount);
    if (cents === null) {
      setBad(true);
      return;
    }
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_outside_payments").insert({
      amount_cents: cents,
      received_on: iso(date),
      method,
      client_name: client.trim() || null,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      dialog.show({ title: t("payment.saveFailed") });
      return;
    }
    setAmount("");
    setClient("");
    setNote("");
    void loadRows();
    onChanged();
    dialog.show({ title: t("payment.saved", { amount: money(cents) }) });
  };

  const remove = (id: string) =>
    dialog.show({
      title: t("payment.deleteConfirm"),
      confirmLabel: t("delete"),
      destructive: true,
      onConfirm: async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("vendor_outside_payments").delete().eq("id", id);
        if (error) {
          dialog.show({ title: t("deleteFailed") });
          return;
        }
        setRows((r) => r.filter((x) => x.id !== id));
        onChanged();
      },
    });

  return (
    <SheetShell title={t("payment.title")} intro={t("payment.intro")} onClose={onClose}>
      <Field label={t("payment.amount")}>
        <TextInput
          value={amount}
          onChangeText={(v) => {
            setAmount(v);
            setBad(false);
          }}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={PLACEHOLDER}
          style={[inputStyle, bad ? { borderColor: ERROR } : null]}
        />
        {bad ? <Text style={{ fontFamily: SERIF, fontSize: 12, color: ERROR, marginTop: 4 }}>{t("amountInvalid")}</Text> : null}
      </Field>
      <Field label={t("payment.date")}>
        <DateField value={date} onChange={setDate} locale={locale} />
      </Field>
      <Field label={t("payment.method")}>
        <Chips values={METHODS} value={method} onChange={setMethod} label={(m) => t(`methods.${m}`)} />
      </Field>
      <Field label={t("payment.client")}>
        <TextInput value={client} onChangeText={setClient} maxLength={120} placeholder={t("payment.clientPlaceholder")} placeholderTextColor={PLACEHOLDER} style={inputStyle} />
      </Field>
      <Field label={t("note")}>
        <TextInput value={note} onChangeText={setNote} maxLength={500} multiline placeholder={t("payment.notePlaceholder")} placeholderTextColor={PLACEHOLDER} style={[inputStyle, { height: 72, paddingTop: 12, textAlignVertical: "top" }]} />
      </Field>
      <Pressable disabled={saving} onPress={() => void save()} style={{ marginTop: 20, height: BUTTON_HEIGHT.lg, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", backgroundColor: saving ? GOLD_MUTED : GOLD }}>
        {saving ? <ActivityIndicator color={ON_GOLD} /> : <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: ON_GOLD }}>{t("payment.save")}</Text>}
      </Pressable>
      <SavedList
        title={t("payment.recorded")}
        emptyText={t("none")}
        onDelete={remove}
        rows={rows.map((r) => ({
          id: r.id,
          top: `${money(r.amount_cents)} · ${t(`methods.${r.method}`)}`,
          bottom: `${fmtDay(parseIso(r.received_on), locale)}${r.client_name ? ` · ${r.client_name}` : ""}`,
        }))}
      />
      {dialog.element}
    </SheetShell>
  );
}

function ExpenseSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { t, locale } = useT("overview");
  const { user } = useAuth();
  const dialog = useBrandDialog();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(startOfDay(new Date()));
  const [what, setWhat] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("supplies");
  const [paidTo, setPaidTo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [badAmount, setBadAmount] = useState(false);
  const [badWhat, setBadWhat] = useState(false);
  const [rows, setRows] = useState<{ id: string; amount_cents: number; occurred_on: string; category: string; description: string; paid_to: string | null }[]>([]);

  const loadRows = useCallback(async () => {
    if (!user?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_expenses")
      .select("id, amount_cents, occurred_on, category, description, paid_to")
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);
    setRows(data ?? []);
  }, [user?.id]);
  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const catLabel = (c: string) => ((CATEGORIES as readonly string[]).includes(c) ? t(`categories.${c}`) : c);

  const save = async () => {
    if (!user?.id) return;
    const cents = parseAmount(amount);
    const desc = what.trim();
    setBadAmount(cents === null);
    setBadWhat(!desc);
    if (cents === null || !desc) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_expenses").insert({
      user_id: user.id,
      created_by: user.id,
      amount_cents: cents,
      occurred_on: iso(date),
      category,
      description: desc.slice(0, 120),
      paid_to: paidTo.trim() || null,
      notes: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      dialog.show({ title: t("expense.saveFailed") });
      return;
    }
    setAmount("");
    setWhat("");
    setPaidTo("");
    setNote("");
    void loadRows();
    onChanged();
    dialog.show({ title: t("expense.saved", { amount: money(cents) }) });
  };

  const remove = (id: string) =>
    dialog.show({
      title: t("expense.deleteConfirm"),
      confirmLabel: t("delete"),
      destructive: true,
      onConfirm: async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("vendor_expenses").delete().eq("id", id);
        if (error) {
          dialog.show({ title: t("deleteFailed") });
          return;
        }
        setRows((r) => r.filter((x) => x.id !== id));
        onChanged();
      },
    });

  return (
    <SheetShell title={t("expense.title")} intro={t("expense.intro")} onClose={onClose}>
      <Field label={t("expense.amount")}>
        <TextInput
          value={amount}
          onChangeText={(v) => {
            setAmount(v);
            setBadAmount(false);
          }}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={PLACEHOLDER}
          style={[inputStyle, badAmount ? { borderColor: ERROR } : null]}
        />
        {badAmount ? <Text style={{ fontFamily: SERIF, fontSize: 12, color: ERROR, marginTop: 4 }}>{t("amountInvalid")}</Text> : null}
      </Field>
      <Field label={t("expense.date")}>
        <DateField value={date} onChange={setDate} locale={locale} />
      </Field>
      <Field label={t("expense.what")}>
        <TextInput
          value={what}
          onChangeText={(v) => {
            setWhat(v);
            setBadWhat(false);
          }}
          maxLength={120}
          placeholder={t("expense.whatPlaceholder")}
          placeholderTextColor={PLACEHOLDER}
          style={[inputStyle, badWhat ? { borderColor: ERROR } : null]}
        />
        {badWhat ? <Text style={{ fontFamily: SERIF, fontSize: 12, color: ERROR, marginTop: 4 }}>{t("expense.whatRequired")}</Text> : null}
      </Field>
      <Field label={t("expense.category")}>
        <Chips values={CATEGORIES} value={category} onChange={setCategory} label={catLabel} />
      </Field>
      <Field label={t("expense.paidTo")}>
        <TextInput value={paidTo} onChangeText={setPaidTo} maxLength={120} placeholder={t("expense.paidToPlaceholder")} placeholderTextColor={PLACEHOLDER} style={inputStyle} />
      </Field>
      <Field label={t("note")}>
        <TextInput value={note} onChangeText={setNote} maxLength={500} multiline placeholderTextColor={PLACEHOLDER} style={[inputStyle, { height: 72, paddingTop: 12, textAlignVertical: "top" }]} />
      </Field>
      <Pressable disabled={saving} onPress={() => void save()} style={{ marginTop: 20, height: BUTTON_HEIGHT.lg, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", backgroundColor: saving ? GOLD_MUTED : GOLD }}>
        {saving ? <ActivityIndicator color={ON_GOLD} /> : <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: ON_GOLD }}>{t("expense.save")}</Text>}
      </Pressable>
      <SavedList
        title={t("expense.recorded")}
        emptyText={t("none")}
        onDelete={remove}
        rows={rows.map((r) => ({
          id: r.id,
          top: `${money(r.amount_cents)} · ${r.description}`,
          bottom: `${fmtDay(parseIso(r.occurred_on), locale)} · ${catLabel(r.category)}${r.paid_to ? ` · ${r.paid_to}` : ""}`,
        }))}
      />
      {dialog.element}
    </SheetShell>
  );
}
