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
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

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

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Filter = "all" | "awaiting" | "replied" | "booked";

export default function InboxScreen() {
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
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="pb-32"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor="#1a1410"
          />
        }
      >
        <View className="px-5 pt-2 pb-4">
          <Text className="text-3xl font-semibold text-foreground">Inbox</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Your inquiries to vendors — all in one place
          </Text>
        </View>

        <View className="px-5 mb-3">
          <View className="flex-row items-center rounded-full bg-muted px-4 py-3">
            <Feather name="search" size={16} color="#776c5f" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by vendor, event, or message"
              placeholderTextColor="#a89b8a"
              className="ml-2 flex-1 text-base text-foreground"
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
            label="All"
            count={counts.all}
            onPress={() => setFilter("all")}
          />
          <Chip
            active={filter === "awaiting"}
            label="Awaiting"
            count={counts.awaiting}
            onPress={() => setFilter("awaiting")}
          />
          <Chip
            active={filter === "replied"}
            label="Replied"
            count={counts.replied}
            onPress={() => setFilter("replied")}
          />
          <Chip
            active={filter === "booked"}
            label="Booked"
            count={counts.booked}
            onPress={() => setFilter("booked")}
          />
        </ScrollView>

        {error ? (
          <View className="mx-5 mb-3 rounded-xl bg-red-50 px-4 py-3 border border-red-200">
            <Text className="text-sm text-red-700">{error}</Text>
            <Pressable
              onPress={() => load(false)}
              className="mt-2 active:opacity-70"
            >
              <Text className="text-sm font-semibold text-red-700">
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="mt-2">
          {loading ? (
            <View className="items-center pt-16">
              <ActivityIndicator color="#1a1410" />
            </View>
          ) : filteredRows.length === 0 ? (
            <Empty
              msg={
                search || filter !== "all"
                  ? "Nothing matches that filter."
                  : "No conversations yet. Reach out to a vendor from Explore."
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

function Chip({
  active,
  label,
  count,
  onPress,
}: {
  active: boolean;
  label: string;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center px-4 py-2 rounded-full ${
        active ? "bg-foreground" : "bg-muted"
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          active ? "text-background" : "text-foreground"
        }`}
      >
        {label}
      </Text>
      {count !== undefined ? (
        <View
          className={`ml-2 min-w-[20px] px-1.5 rounded-full items-center ${
            active ? "bg-background/20" : "bg-foreground/10"
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              active ? "text-background" : "text-foreground"
            }`}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Avatar({ seed, label }: { seed: string; label: string }) {
  return (
    <View
      className="h-12 w-12 rounded-full items-center justify-center"
      style={{ backgroundColor: avatarColor(seed) }}
    >
      <Text className="text-sm font-semibold text-white">{label}</Text>
    </View>
  );
}

function InquiryCard({ row }: { row: InquiryRow }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const vendorName = row.vendor_profiles?.[0]?.business_name ?? "Vendor";
  const category = row.vendor_profiles?.[0]?.category ?? null;
  // Host-side "noteworthy" = vendor has replied and the host hasn't
  // opened it yet. There's no per-thread unread bit on inquiries, so we
  // use the inquiry status as a proxy. "drafted" also counts because
  // it means the vendor has at least typed something.
  const isUnread = row.status === "replied" || row.status === "drafted";
  const previewBudget =
    row.budget_max_cents != null
      ? ` · up to $${Math.round(row.budget_max_cents / 100)}`
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
      className="rounded-2xl border border-border bg-background px-4 py-4 active:opacity-70"
    >
      <View className="flex-row gap-3">
        <Avatar seed={vendorName} label={initials(vendorName)} />
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-shrink">
              <Text
                className="text-base font-semibold text-foreground"
                numberOfLines={1}
              >
                {vendorName}
              </Text>
              {isUnread ? (
                <View className="ml-2 h-2 w-2 rounded-full bg-red-500" />
              ) : null}
            </View>
            <Text className="text-xs text-muted-foreground">
              {relativeTime(row.created_at)}
            </Text>
          </View>
          <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
            {category ? `${category} · ` : ""}
            {row.event_type ?? "Event"}
            {row.event_date ? ` · ${row.event_date}` : ""}
            {previewBudget}
          </Text>
          {row.special_requests ? (
            <Text
              className="mt-1.5 text-sm text-foreground/80"
              numberOfLines={2}
            >
              {row.special_requests}
            </Text>
          ) : null}
          {isUnread ? (
            <View className="mt-2 self-start rounded-full bg-red-100 px-2 py-0.5">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-red-600">
                Replied
              </Text>
            </View>
          ) : row.status === "won" ? (
            <View className="mt-2 self-start rounded-full bg-green-100 px-2 py-0.5">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-green-700">
                Booked
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
      <Text className="text-sm text-muted-foreground text-center">{msg}</Text>
    </View>
  );
}
