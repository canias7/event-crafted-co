// Vendor inbox — two-tab hub:
//   Inquiries: leads from hosts (inquiries table)
//   Partners:  vendor-to-vendor threads (vendor_partner_threads)
//
// Layout matches the design mock: floating-card list, colored avatar
// circles, NEW pills on unread inquiry rows, online dot on active
// partner rows. Filter chips switch between subsets.

import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import type { InquiryRow } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type Tab = "inquiries" | "partners";

interface PartnerThread {
  id: string;
  other_business_name: string;
  other_category: string | null;
  last_message_at: string | null;
  last_preview?: string | null;
  unread?: boolean;
}

const AVATAR_COLORS = [
  "#a78bfa", // purple
  "#f472b6", // pink
  "#fb923c", // orange
  "#fbbf24", // yellow
  "#34d399", // green
  "#60a5fa", // blue
  "#22d3ee", // teal
  "#f87171", // red
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

export default function InboxScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("inquiries");
  const [search, setSearch] = useState("");
  const [inquiryFilter, setInquiryFilter] = useState<"all" | "new" | "replied" | "booked">("all");
  const [partnerFilter, setPartnerFilter] = useState<"all" | "unread" | "active">("all");
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [partners, setPartners] = useState<PartnerThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: vendor } = await supabase
        .from("vendor_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const vendorId = (vendor as { id?: string } | null)?.id;
      if (!vendorId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const [inqRes, partRes] = await Promise.all([
        supabase
          .from("inquiries")
          .select(
            "id, vendor_id, host_id, status, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests, quality_score, created_at",
          )
          .eq("vendor_id", vendorId)
          .order("created_at", { ascending: false }),
        // Partners — use the wide-select web pattern; columns flagged as
        // any so older codegens don't choke.
        (supabase as any)
          .from("vendor_partner_threads")
          .select(
            "id, vendor_a_id, vendor_b_id, last_message_at, vendor_a:vendor_profiles!vendor_partner_threads_vendor_a_id_fkey(business_name, category), vendor_b:vendor_profiles!vendor_partner_threads_vendor_b_id_fkey(business_name, category)",
          )
          .or(`vendor_a_id.eq.${vendorId},vendor_b_id.eq.${vendorId}`)
          .order("last_message_at", { ascending: false, nullsFirst: false }),
      ]);

      if (cancelled) return;
      setInquiries(((inqRes.data ?? []) as InquiryRow[]) || []);
      const partRows = ((partRes as { data?: any[] }).data ?? []).map((r) => {
        const isA = r.vendor_a_id === vendorId;
        const other = isA ? r.vendor_b : r.vendor_a;
        return {
          id: r.id,
          other_business_name: other?.business_name ?? "Vendor",
          other_category: other?.category ?? null,
          last_message_at: r.last_message_at ?? null,
        } as PartnerThread;
      });
      setPartners(partRows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Filter logic
  const filteredInquiries = useMemo(() => {
    let out = inquiries;
    if (inquiryFilter === "new") out = out.filter((r) => r.status === "new");
    else if (inquiryFilter === "replied")
      out = out.filter((r) => r.status === "replied" || r.status === "drafted");
    else if (inquiryFilter === "booked") out = out.filter((r) => r.status === "won");
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (r) =>
          r.event_type?.toLowerCase().includes(q) ||
          r.event_date?.toLowerCase().includes(q),
      );
    }
    return out;
  }, [inquiries, inquiryFilter, search]);

  const filteredPartners = useMemo(() => {
    let out = partners;
    if (partnerFilter === "unread") out = out.filter((p) => p.unread);
    else if (partnerFilter === "active")
      out = out.filter(
        (p) =>
          p.last_message_at &&
          Date.now() - new Date(p.last_message_at).getTime() < 14 * 24 * 3600_000,
      );
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((p) => p.other_business_name.toLowerCase().includes(q));
    }
    return out;
  }, [partners, partnerFilter, search]);

  const counts = {
    all: inquiries.length,
    new: inquiries.filter((r) => r.status === "new").length,
    replied: inquiries.filter((r) => r.status === "replied" || r.status === "drafted").length,
    booked: inquiries.filter((r) => r.status === "won").length,
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="pb-32" keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View className="px-5 pt-2 pb-4">
          <Text className="text-3xl font-semibold text-foreground">Inbox</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Inquiries and partner threads — all in one place
          </Text>
        </View>

        {/* Tab pills */}
        <View className="flex-row items-center px-5 mb-4">
          <TabPill
            active={tab === "inquiries"}
            label="Inquiries"
            onPress={() => setTab("inquiries")}
          />
          <View style={{ width: 8 }} />
          <TabPill
            active={tab === "partners"}
            label="Partners"
            onPress={() => setTab("partners")}
          />
        </View>

        {/* Search */}
        <View className="px-5 mb-3">
          <View className="flex-row items-center rounded-full bg-muted px-4 py-3">
            <Feather name="search" size={16} color="#737373" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={
                tab === "inquiries"
                  ? "Search by name, event, or message"
                  : "Search vendors or messages"
              }
              placeholderTextColor="#a3a3a3"
              className="ml-2 flex-1 text-base text-foreground"
            />
          </View>
        </View>

        {/* Filter chips */}
        {tab === "inquiries" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 px-5 pb-2"
          >
            <Chip
              active={inquiryFilter === "all"}
              label="All"
              count={counts.all}
              onPress={() => setInquiryFilter("all")}
            />
            <Chip
              active={inquiryFilter === "new"}
              label="New"
              count={counts.new}
              onPress={() => setInquiryFilter("new")}
            />
            <Chip
              active={inquiryFilter === "replied"}
              label="Replied"
              count={counts.replied}
              onPress={() => setInquiryFilter("replied")}
            />
            <Chip
              active={inquiryFilter === "booked"}
              label="Booked"
              count={counts.booked}
              onPress={() => setInquiryFilter("booked")}
            />
          </ScrollView>
        ) : (
          <View className="flex-row items-center gap-2 px-5 pb-2">
            <Chip
              active={partnerFilter === "all"}
              label="All"
              onPress={() => setPartnerFilter("all")}
            />
            <Chip
              active={partnerFilter === "unread"}
              label="Unread"
              onPress={() => setPartnerFilter("unread")}
            />
            <Chip
              active={partnerFilter === "active"}
              label="Active"
              onPress={() => setPartnerFilter("active")}
            />
          </View>
        )}

        {/* List */}
        <View className="mt-2">
          {loading ? (
            <View className="px-5 py-12 items-center">
              <Text className="text-sm text-muted-foreground">Loading…</Text>
            </View>
          ) : tab === "inquiries" ? (
            filteredInquiries.length === 0 ? (
              <Empty
                msg={
                  search || inquiryFilter !== "all"
                    ? "Nothing matches that filter."
                    : "No inquiries yet. New leads land here."
                }
              />
            ) : (
              <View className="px-5 gap-3">
                {filteredInquiries.map((r) => (
                  <InquiryCard key={r.id} row={r} />
                ))}
              </View>
            )
          ) : filteredPartners.length === 0 ? (
            <Empty
              msg={
                search || partnerFilter !== "all"
                  ? "No threads match."
                  : "No partner threads yet. Reach out to other vendors from their listing page."
              }
            />
          ) : (
            <View className="px-5">
              {filteredPartners.map((p, i) => (
                <PartnerRow key={p.id} thread={p} divider={i > 0} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TabPill({
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
      className={`px-5 py-2 rounded-full ${active ? "bg-foreground" : ""}`}
    >
      <Text
        className={`text-base font-semibold ${
          active ? "text-background" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
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
  const seed = row.event_type ?? row.id;
  const isUnread = row.status === "new";
  const previewBudget =
    row.budget_max_cents != null ? ` · up to $${Math.round(row.budget_max_cents / 100)}` : "";
  return (
    <Pressable className="rounded-2xl border border-border bg-background px-4 py-4 active:opacity-70">
      <View className="flex-row gap-3">
        <Avatar seed={seed} label={initials(row.event_type ?? "Inquiry")} />
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-shrink">
              <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                {row.event_type ?? "Inquiry"}
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
            {row.event_date ?? "Date TBD"}
            {row.guest_count ? ` · ${row.guest_count} guests` : ""}
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
                New
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function PartnerRow({ thread, divider }: { thread: PartnerThread; divider: boolean }) {
  return (
    <Pressable
      className={`flex-row items-center py-3 ${
        divider ? "border-t border-border" : ""
      } active:opacity-70`}
    >
      <View className="relative">
        <Avatar
          seed={thread.other_business_name}
          label={initials(thread.other_business_name)}
        />
      </View>
      <View className="ml-3 flex-1">
        <View className="flex-row items-center">
          <Text
            className="text-base font-semibold text-foreground"
            numberOfLines={1}
          >
            {thread.other_business_name}
          </Text>
          {thread.other_category ? (
            <View className="ml-2 rounded-full bg-muted px-2 py-0.5">
              <Text className="text-[11px] text-muted-foreground">
                {thread.other_category}
              </Text>
            </View>
          ) : null}
        </View>
        {thread.last_preview ? (
          <Text
            className="mt-0.5 text-sm text-muted-foreground"
            numberOfLines={1}
          >
            {thread.last_preview}
          </Text>
        ) : null}
      </View>
      <Text className="ml-2 text-xs text-muted-foreground">
        {relativeTime(thread.last_message_at)}
      </Text>
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
