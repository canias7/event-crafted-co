// Host inbox — outbound side of the inquiry conversation. Mirrors the
// vendor inbox's layout (header, search, filter chips, floating cards
// with avatar + title + meta + preview) but with host semantics:
//   • Each row is keyed to a vendor (the one you reached out to)
//   • "Replied" status is what's noteworthy for the host — it means
//     a vendor responded, so it carries the red dot + NEW pill
//
// There's no "Partners" tab here since partner threads are a
// vendor-to-vendor concept that doesn't apply to hosts.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { eventTypeLabel } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useCategoryNames } from "@/lib/categoryNames";
import { Wordmark } from "@/components/Wordmark";
import { supabase } from "@/lib/supabase";
import { C, IS_DARK } from "@/lib/theme";

const PLACEHOLDER = C.placeholder;
// Grey icons (search glass): warm grey on light, lighter on dark.
const ICON_DIM = IS_DARK ? C.placeholder : "#6f6a60";
// Problem tint for the error box.
const ERROR_BG = IS_DARK ? "rgba(224,113,106,0.12)" : "#f7ece9";
const ERROR_EDGE = IS_DARK ? "rgba(224,113,106,0.4)" : "#e6c9c2";

const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";

// Page title — one treatment across both apps. Vendor sets every
// screen heading at 38/44 with a -0.5 tracking correction; host had
// drifted to three different sizes and two families.
const PAGE_TITLE = {
  fontFamily: SERIF_BOLD,
  fontSize: 38,
  lineHeight: 44,
  letterSpacing: -0.5,
  color: C.text,
  marginTop: 8,
} as const;

const SERIF_ITALIC = "LibreBaskerville-Italic";

interface InquiryRow {
  id: string;
  status: "new" | "replied" | "drafted" | "won" | "lost" | "expired";
  event_type: string | null;
  event_date: string | null;
  guest_count: number | null;
  budget_max_cents: number | null;
  special_requests: string | null;
  created_at: string;
  vendor_profiles?: { business_name: string; category: string | null }[] | null;
}

const AVATAR_COLORS = [
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#fbbf24",
  "#34d399",
  "#60a5fa",
  "#22d3ee",
  "#f87171",
];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type TFn = (key: string, vars?: Record<string, string | number | null | undefined>) => string;

function relativeTime(iso: string | null, t: TFn, locale: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return t("time.now");
  if (m < 60) return t("time.minutes", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("time.hours", { count: h });
  const d = Math.floor(h / 24);
  if (d === 1) return t("time.yesterday");
  if (d < 7) return t("time.days", { count: d });
  return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

// Event type in the app's language; unknown values fall back to the
// shared English formatter.
function eventTypeText(type: string | null, t: TFn): string {
  const v = type?.trim();
  if (!v) return t("eventTypes.fallback");
  const label = t(`eventTypes.${v}`);
  return label === `inbox.eventTypes.${v}` ? eventTypeLabel(v) : label;
}

type Filter = "all" | "awaiting" | "replied" | "booked";

export default function InboxScreen() {
  const { t } = useT("inbox");
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!user) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const { data, error: e } = await supabase
        .from("inquiries")
        .select(
          "id, status, event_type, event_date, guest_count, budget_max_cents, special_requests, created_at, vendor_profiles(business_name, category)",
        )
        .eq("host_id", user.id)
        .order("created_at", { ascending: false });
      if (e) setError(e.message);
      else setRows((data ?? []) as InquiryRow[]);
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    },
    [user],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      awaiting: rows.filter((r) => r.status === "new").length,
      replied: rows.filter((r) => r.status === "replied" || r.status === "drafted").length,
      booked: rows.filter((r) => r.status === "won").length,
    }),
    [rows],
  );

  const filteredRows = useMemo(() => {
    let out = rows;
    if (filter === "awaiting") out = out.filter((r) => r.status === "new");
    else if (filter === "replied")
      out = out.filter((r) => r.status === "replied" || r.status === "drafted");
    else if (filter === "booked") out = out.filter((r) => r.status === "won");
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (r) =>
          r.vendor_profiles?.[0]?.business_name?.toLowerCase().includes(q) ||
          r.event_type?.toLowerCase().includes(q) ||
          r.event_date?.toLowerCase().includes(q),
      );
    }
    return out;
  }, [rows, filter, search]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.page }}>
      <ScrollView
        contentContainerClassName="pb-32"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={C.text}
          />
        }
      >
        <View className="px-5 pt-2 pb-4">
          <Wordmark />
          <Text style={PAGE_TITLE}>{t("title")}</Text>
          <Text style={{ fontFamily: SERIF, color: C.textDim }} className="mt-1 text-sm">
            {t("subtitle")}
          </Text>
        </View>

        <View className="px-5 mb-3">
          <View className="flex-row items-center rounded-full px-4 py-3" style={{ backgroundColor: C.surface }}>
            <Feather name="search" size={16} color={ICON_DIM} />
            <TextInput style={{ fontFamily: SERIF, color: C.text }}
              value={search}
              onChangeText={setSearch}
              placeholder={t("searchPlaceholder")}
              placeholderTextColor={PLACEHOLDER}
              keyboardAppearance={IS_DARK ? "dark" : "light"}
              className="ml-2 flex-1 text-base"
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-5 pb-2"
        >
          <Chip
            active={filter === "all"}
            label={t("filters.all")}
            onPress={() => setFilter("all")}
          />
          <Chip
            active={filter === "awaiting"}
            label={t("filters.awaiting")}
            onPress={() => setFilter("awaiting")}
          />
          <Chip
            active={filter === "replied"}
            label={t("filters.replied")}
            onPress={() => setFilter("replied")}
          />
          <Chip
            active={filter === "booked"}
            label={t("filters.booked")}
            onPress={() => setFilter("booked")}
          />
        </ScrollView>

        {error ? (
          <View
            className="mx-5 mb-3 rounded-xl px-4 py-3 border"
            style={{ backgroundColor: ERROR_BG, borderColor: ERROR_EDGE }}
          >
            <Text style={{ fontFamily: SERIF, color: C.error }} className="text-sm">{error}</Text>
            <Pressable
              onPress={() => load(false)}
              className="mt-2 active:opacity-70"
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: C.error }} className="text-sm">
                {t("retry")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="mt-2">
          {loading ? (
            <View className="items-center pt-16">
              <ActivityIndicator color={C.text} />
            </View>
          ) : filteredRows.length === 0 ? (
            <Empty
              msg={
                search || filter !== "all"
                  ? t("emptyFiltered")
                  : t("empty")
              }
            />
          ) : (
            <View className="px-5 gap-3">
              {filteredRows.map((r) => (
                <InquiryCard key={r.id} row={r} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Label only, no count badge. With four filters the badges pushed the
// row past the viewport so "Booked" was unreachable without scrolling —
// the same call made on the vendor inbox.
function Chip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-2 rounded-full"
      style={{ backgroundColor: active ? C.selected : C.surface }}
    >
      <Text
        style={{ fontFamily: SERIF_BOLD, color: active ? C.onSelected : C.text }}
        className="text-sm"
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Avatar({ seed, label }: { seed: string; label: string }) {
  return (
    <View
      className="h-12 w-12 rounded-full items-center justify-center"
      style={{ backgroundColor: avatarColor(seed) }}
    >
      <Text style={{ fontFamily: SERIF_BOLD, color: "#ffffff" }} className="text-sm">{label}</Text>
    </View>
  );
}

function InquiryCard({ row }: { row: InquiryRow }) {
  const router = useRouter();
  const { t, locale } = useT("inbox");
  const cat = useCategoryNames();
  const [opening, setOpening] = useState(false);
  const vendorName = row.vendor_profiles?.[0]?.business_name ?? t("vendorFallback");
  const category = row.vendor_profiles?.[0]?.category ?? null;
  // Host-side "noteworthy" = vendor has replied and the host hasn't
  // opened it yet. There's no per-thread unread bit on inquiries, so we
  // use the inquiry status as a proxy. "drafted" also counts because
  // it means the vendor has at least typed something.
  const isUnread = row.status === "replied" || row.status === "drafted";
  const previewBudget =
    row.budget_max_cents != null
      ? ` · ${t("budgetUpTo", { amount: `$${Math.round(row.budget_max_cents / 100)}` })}`
      : "";

  async function open() {
    if (opening) return;
    setOpening(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("ensure_inquiry_thread", {
      p_inquiry_id: row.id,
    });
    setOpening(false);
    if (error || !data) return;
    router.push(`/(host)/thread/${data as string}` as never);
  }

  return (
    <Pressable
      onPress={open}
      className="rounded-[20px] border px-4 py-4 active:opacity-70"
      style={{ borderColor: C.border, backgroundColor: C.card }}
    >
      <View className="flex-row gap-3">
        <Avatar seed={vendorName} label={initials(vendorName)} />
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-shrink">
              <Text style={{ fontFamily: SERIF_BOLD, color: C.text }}
                className="text-base"
                numberOfLines={1}
              >
                {vendorName}
              </Text>
              {isUnread ? (
                <View className="ml-2 h-2 w-2 rounded-full" style={{ backgroundColor: C.gold }} />
              ) : null}
            </View>
            <Text style={{ fontFamily: SERIF, color: C.textDim }} className="text-xs">
              {relativeTime(row.created_at, t, locale)}
            </Text>
          </View>
          <Text style={{ fontFamily: SERIF, color: C.textDim }} className="mt-0.5 text-xs" numberOfLines={1}>
            {category ? `${cat.sub(category)} · ` : ""}
            {eventTypeText(row.event_type, t)}
            {row.event_date ? ` · ${row.event_date}` : ""}
            {previewBudget}
          </Text>
          {row.special_requests ? (
            <Text style={{ fontFamily: SERIF, color: C.text }}
              className="mt-1.5 text-sm"
              numberOfLines={2}
            >
              {row.special_requests}
            </Text>
          ) : null}
          {isUnread ? (
            <View
              className="mt-2 self-start rounded-full px-2 py-0.5"
              style={{ backgroundColor: C.pending }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: C.pendingText }} className="text-[10px] uppercase tracking-wide">
                {t("badges.replied")}
              </Text>
            </View>
          ) : row.status === "won" ? (
            <View
              className="mt-2 self-start rounded-full px-2 py-0.5"
              style={{ backgroundColor: C.selected }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: C.page }} className="text-[10px] uppercase tracking-wide">
                {t("badges.booked")}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <View className="px-5 py-16 items-center">
      <Text style={{ fontFamily: SERIF, color: C.textDim }} className="text-sm text-center">{msg}</Text>
    </View>
  );
}
