// Vendor inbox — two-tab hub:
//   Inquiries: leads from hosts (inquiries table)
//   Partners:  vendor-to-vendor threads (vendor_partner_threads)
//
// Restyled to the cream Vendora mock: wordmark header with search /
// filter rounds, serif Inbox title, dark segmented toggle with icons,
// white rounded search, icon chips with count badges, framed empty
// state with a Tips action, and the "Stand out" improve-profile banner.
//
// No function-form style props anywhere (device interop drops them).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { InquiryRow } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useBrandDialog } from "@/components/listing/WizardKit";
import { Wordmark } from "@/components/Wordmark";

type Tab = "inquiries" | "partners";

// Cream editorial palette — matches the reference mock (warmer than the
// wizards' near-white CREAM).
const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const TRACK = "#ebe6db";
const BORDER = "#e6e1d5";
const INK = "#14161a";
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = "#14161a";
const GOLD = "#c9a86a";
// Libre Baskerville, like every other screen. This used to fall back to
// the platform system serif (Times on iOS), which is why the inbox read
// as a different typeface from the rest of the app. Android won't
// synthesise a bold weight for a custom family, so bold text has to
// name the bold face explicitly — every serif run here is 600/700.
const SERIF_BOLD = "LibreBaskerville-Bold";

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
  const router = useRouter();
  const dialog = useBrandDialog();
  const searchRef = useRef<TextInput>(null);
  const [tab, setTab] = useState<Tab>("inquiries");
  const [search, setSearch] = useState("");
  const [inquiryFilter, setInquiryFilter] = useState<"all" | "new" | "replied" | "booked">("all");
  const [partnerFilter, setPartnerFilter] = useState<"all" | "unread" | "active">("all");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [partners, setPartners] = useState<PartnerThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!user) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const { data: vendorRows, error: vErr } = await supabase
        .from("vendor_profiles")
        .select("id")
        .eq("user_id", user.id);
      if (vErr) {
        setError(vErr.message);
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
        return;
      }
      const vendorIds = ((vendorRows ?? []) as { id: string }[]).map(
        (r) => r.id,
      );
      if (vendorIds.length === 0) {
        setInquiries([]);
        setPartners([]);
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
        return;
      }
      const [inqRes, partRes] = await Promise.all([
        supabase
          .from("inquiries")
          .select(
            "id, vendor_id, host_id, status, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests, quality_score, created_at",
          )
          .in("vendor_id", vendorIds)
          .order("created_at", { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_partner_threads")
          .select(
            "id, vendor_a_id, vendor_b_id, last_message_at, vendor_a:vendor_profiles!vendor_partner_threads_vendor_a_id_fkey(business_name, category), vendor_b:vendor_profiles!vendor_partner_threads_vendor_b_id_fkey(business_name, category)",
          )
          .or(
            `vendor_a_id.in.(${vendorIds.join(",")}),vendor_b_id.in.(${vendorIds.join(",")})`,
          )
          .order("last_message_at", { ascending: false, nullsFirst: false }),
      ]);
      if (inqRes.error) setError(inqRes.error.message);
      else setInquiries(((inqRes.data ?? []) as InquiryRow[]) || []);
      const vendorIdSet = new Set(vendorIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const partRows = (((partRes as { data?: any[] }).data ?? []) as any[]).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => {
          const isA = vendorIdSet.has(r.vendor_a_id);
          const other = isA ? r.vendor_b : r.vendor_a;
          return {
            id: r.id,
            other_business_name: other?.business_name ?? "Vendor",
            other_category: other?.category ?? null,
            last_message_at: r.last_message_at ?? null,
          } as PartnerThread;
        },
      );
      setPartners(partRows);
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    },
    [user],
  );

  useEffect(() => {
    load(false);
  }, [load]);

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

  const filterActive =
    tab === "inquiries" ? inquiryFilter !== "all" : partnerFilter !== "all";

  function showTips() {
    dialog.show({
      icon: "zap",
      title: "Get more inquiries",
      message:
        "• Add photos — listings with 5+ photos get far more inquiries.\n\n• Fill in your description and a starting price so hosts can reach out with confidence.\n\n• Reply fast — hosts book vendors who answer within a day.",
      buttonLabel: "Got it",
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={INK}
          />
        }
      >
        {/* Wordmark header + search / filter rounds */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Wordmark />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <HeaderRound
              icon="search"
              label="Search"
              onPress={() => searchRef.current?.focus()}
            />
            <View>
              <HeaderRound
                icon="sliders"
                label="Toggle filters"
                onPress={() => setFiltersOpen((v) => !v)}
              />
              {filterActive ? (
                <View
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: INK,
                  }}
                />
              ) : null}
            </View>
          </View>
        </View>

        {/* Title */}
        <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18 }}>
          <Text
            style={{
              fontFamily: SERIF_BOLD,
              fontSize: 38,
              lineHeight: 44,
              letterSpacing: -0.5,
              color: INK,
            }}
          >
            Inbox
          </Text>
          <Text style={{ fontFamily: "LibreBaskerville", marginTop: 6, fontSize: 13.5, lineHeight: 19, color: INK_DIM }}>
            Inquiries and partner threads — all in one place.
          </Text>
        </View>

        {/* Segmented toggle */}
        <View
          style={{
            marginHorizontal: 20,
            marginBottom: 16,
            flexDirection: "row",
            backgroundColor: TRACK,
            borderRadius: 18,
            padding: 4,
          }}
        >
          <Segment
            active={tab === "inquiries"}
            icon="message-circle"
            label="Inquiries"
            onPress={() => setTab("inquiries")}
          />
          <Segment
            active={tab === "partners"}
            icon="users"
            label="Partners"
            onPress={() => setTab("partners")}
          />
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 999,
              paddingHorizontal: 18,
              height: 54,
            }}
          >
            <Feather name="search" size={17} color={INK_DIM} />
            <TextInput
              ref={searchRef}
              value={search}
              onChangeText={setSearch}
              placeholder={
                tab === "inquiries"
                  ? "Search by name, event, or message"
                  : "Search vendors or messages"
              }
              placeholderTextColor="#a49f93"
              style={{ marginLeft: 10, flex: 1, fontSize: 15.5, color: INK }}
            />
          </View>
        </View>

        {/* Filter chips */}
        {filtersOpen ? (
          tab === "inquiries" ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingBottom: 8 }}
            >
              <Chip
                active={inquiryFilter === "all"}
                icon="inbox"
                label="All"
                count={counts.all}
                onPress={() => setInquiryFilter("all")}
              />
              <Chip
                active={inquiryFilter === "new"}
                iconNode={
                  <MaterialCommunityIcons
                    name="email-outline"
                    size={15}
                    color={inquiryFilter === "new" ? "#ffffff" : INK}
                  />
                }
                label="New"
                count={counts.new}
                onPress={() => setInquiryFilter("new")}
              />
              <Chip
                active={inquiryFilter === "replied"}
                icon="corner-up-left"
                label="Replied"
                count={counts.replied}
                onPress={() => setInquiryFilter("replied")}
              />
              <Chip
                active={inquiryFilter === "booked"}
                icon="calendar"
                label="Booked"
                count={counts.booked}
                onPress={() => setInquiryFilter("booked")}
              />
            </ScrollView>
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 20,
                paddingBottom: 8,
              }}
            >
              <View style={{ flexDirection: "row", gap: 10, flex: 1 }}>
                <Chip
                  active={partnerFilter === "all"}
                  icon="inbox"
                  label="All"
                  onPress={() => setPartnerFilter("all")}
                />
                <Chip
                  active={partnerFilter === "unread"}
                  icon="mail"
                  label="Unread"
                  onPress={() => setPartnerFilter("unread")}
                />
                <Chip
                  active={partnerFilter === "active"}
                  icon="zap"
                  label="Active"
                  onPress={() => setPartnerFilter("active")}
                />
              </View>
              {/* Discovery entry point. The search field above only filters
                  threads you already have; this is how you reach vendors you
                  haven't messaged yet. */}
              <TouchableOpacity
                onPress={() => router.push("/(vendor)/find-vendor")}
                hitSlop={8}
                activeOpacity={0.7}
                style={{
                  marginLeft: 10,
                  height: 38,
                  width: 38,
                  borderRadius: 999,
                  backgroundColor: INK,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Find a vendor to message"
              >
                <Feather name="plus" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
          )
        ) : null}

        {error ? (
          <View
            style={{
              marginHorizontal: 20,
              marginBottom: 12,
              borderRadius: 14,
              backgroundColor: "#fdf0ee",
              borderWidth: 1,
              borderColor: "#f3cdc6",
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Text style={{ fontFamily: "LibreBaskerville", fontSize: 14, color: "#b3352b" }}>{error}</Text>
            <Pressable onPress={() => load(false)} hitSlop={6}>
              <Text style={{ fontFamily: SERIF_BOLD, marginTop: 8, fontSize: 14, color: "#b3352b" }}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* List */}
        <View style={{ marginTop: 6 }}>
          {loading ? (
            <View style={{ paddingHorizontal: 20, paddingVertical: 48, alignItems: "center" }}>
              <ActivityIndicator color={INK} />
            </View>
          ) : tab === "inquiries" ? (
            filteredInquiries.length === 0 ? (
              <EmptyState
                filtered={!!search || inquiryFilter !== "all"}
                onTips={showTips}
              />
            ) : (
              <View style={{ paddingHorizontal: 20, gap: 12 }}>
                {filteredInquiries.map((r) => (
                  <InquiryCard key={r.id} row={r} />
                ))}
              </View>
            )
          ) : filteredPartners.length === 0 ? (
            /* Name the actual reason the list is empty. */
            <View style={{ paddingHorizontal: 20, paddingVertical: 40, alignItems: "center" }}>
              <Text style={{ fontFamily: "LibreBaskerville", textAlign: "center", fontSize: 14, color: INK_DIM }}>
                {search
                  ? `No conversations match “${search}”. This searches your existing threads only.`
                  : partnerFilter !== "all"
                    ? "No conversations match that filter."
                    : "No partner conversations yet. Find another vendor to start one."}
              </Text>
              {search ? (
                <TouchableOpacity
                  onPress={() => setSearch("")}
                  activeOpacity={0.7}
                  style={{
                    marginTop: 12,
                    borderRadius: 999,
                    backgroundColor: TRACK,
                    paddingHorizontal: 18,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: INK }}>
                    Clear search
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => router.push("/(vendor)/find-vendor")}
                activeOpacity={0.8}
                style={{
                  marginTop: 12,
                  borderRadius: 999,
                  backgroundColor: INK,
                  paddingHorizontal: 22,
                  paddingVertical: 11,
                }}
              >
                <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: "#ffffff" }}>
                  Find a vendor
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 20 }}>
              {filteredPartners.map((p, i) => (
                <PartnerRow key={p.id} thread={p} divider={i > 0} />
              ))}
            </View>
          )}
        </View>

        {/* Stand out banner */}
        <TouchableOpacity
          onPress={() => router.push("/(vendor)/setup")}
          activeOpacity={0.85}
          style={{
            marginHorizontal: 20,
            marginTop: 18,
            backgroundColor: "#efe9dc",
            borderRadius: 20,
            padding: 16,
          }}
        >
          {/* Icon + copy on one row, CTA on its own line below. All
              three side by side squeezed the title onto three lines. */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              backgroundColor: "#f7f3e9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialCommunityIcons name="bullhorn-outline" size={24} color={GOLD} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text
              style={{
                fontFamily: SERIF_BOLD,
                fontSize: 16.5,
                color: INK,
              }}
            >
              Stand out. Get more booked.
            </Text>
            <Text style={{ fontFamily: "LibreBaskerville", marginTop: 2, fontSize: 13, color: INK_DIM }}>
              Complete your profile and get discovered.
            </Text>
          </View>
          </View>
          <View
            style={{
              alignSelf: "flex-start",
              marginTop: 12,
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 9,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, fontSize: 13, color: INK }}>
              Improve profile
            </Text>
            <Feather name="arrow-right" size={13} color={INK} />
          </View>
        </TouchableOpacity>
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

function HeaderRound({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={6}
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: "center",
        justifyContent: "center",
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name={icon} size={17} color={INK} />
    </TouchableOpacity>
  );
}

function Segment({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flex: 1,
        height: 52,
        borderRadius: 15,
        backgroundColor: active ? INK : "transparent",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <Feather name={icon} size={17} color={active ? "#ffffff" : INK} />
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: 17,
          color: active ? "#ffffff" : INK,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Chip({
  active,
  icon,
  iconNode,
  label,
  count,
  onPress,
}: {
  active: boolean;
  icon?: keyof typeof Feather.glyphMap;
  iconNode?: React.ReactNode;
  label: string;
  count?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingHorizontal: 15,
        height: 42,
        borderRadius: 999,
        backgroundColor: active ? INK : CARD,
        borderWidth: 1,
        borderColor: active ? INK : BORDER,
      }}
    >
      {iconNode ??
        (icon ? (
          <Feather name={icon} size={15} color={active ? "#ffffff" : INK} />
        ) : null)}
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: 15,
          color: active ? "#ffffff" : INK,
        }}
      >
        {label}
      </Text>
      {count !== undefined ? (
        <View
          style={{
            minWidth: 22,
            height: 22,
            borderRadius: 999,
            paddingHorizontal: 5,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: active ? "#f4f1ea" : TRACK,
          }}
        >
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 12, color: INK }}>
            {count}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function EmptyState({
  filtered,
  onTips,
}: {
  filtered: boolean;
  onTips: () => void;
}) {
  return (
    <View
      style={{
        marginHorizontal: 20,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: CARD,
        paddingVertical: 44,
        paddingHorizontal: 24,
        alignItems: "center",
      }}
    >
      <View style={{ alignItems: "center" }}>
        <MaterialCommunityIcons
          name="email-open-outline"
          size={64}
          color="#d9c9a6"
        />
      </View>
      <Text
        style={{
          marginTop: 18,
          fontFamily: SERIF_BOLD,
          fontSize: 23,
          color: INK,
          textAlign: "center",
        }}
      >
        {filtered ? "Nothing here." : "No inquiries yet."}
      </Text>
      <Text style={{ fontFamily: "LibreBaskerville", marginTop: 6, fontSize: 15, color: INK_DIM, textAlign: "center" }}>
        {filtered ? "Nothing matches that filter." : "New leads land here."}
      </Text>
      {!filtered ? (
        <TouchableOpacity
          onPress={onTips}
          activeOpacity={0.85}
          style={{
            marginTop: 22,
            backgroundColor: INK,
            borderRadius: 999,
            paddingHorizontal: 22,
            height: 50,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <MaterialCommunityIcons name="lightbulb-outline" size={15} color={GOLD} />
          <Text style={{ fontFamily: SERIF_BOLD, color: "#ffffff", fontSize: 15}}>
            Tips to get more inquiries
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Avatar({ seed, label }: { seed: string; label: string }) {
  return (
    <View
      style={{
        height: 48,
        width: 48,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: avatarColor(seed),
      }}
    >
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 14, color: "#ffffff" }}>
        {label}
      </Text>
    </View>
  );
}

function InquiryCard({ row }: { row: InquiryRow }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const seed = row.event_type ?? row.id;
  const isUnread = row.status === "new";
  const previewBudget =
    row.budget_max_cents != null ? ` · up to $${Math.round(row.budget_max_cents / 100)}` : "";

  async function open() {
    if (opening) return;
    setOpening(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("ensure_inquiry_thread", {
      p_inquiry_id: row.id,
    });
    setOpening(false);
    if (error || !data) {
      Alert.alert("Couldn't open conversation", error?.message ?? "Please try again.");
      return;
    }
    router.push(`/(vendor)/thread/${data as string}` as never);
  }

  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.75}
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: CARD,
        paddingHorizontal: 16,
        paddingVertical: 16,
      }}
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Avatar seed={seed} label={initials(row.event_type ?? "Inquiry")} />
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: SERIF_BOLD,
                  fontSize: 17,
                  color: INK,
                }}
              >
                {row.event_type ?? "Inquiry"}
              </Text>
              {isUnread ? (
                <View
                  style={{
                    marginLeft: 8,
                    height: 8,
                    width: 8,
                    borderRadius: 999,
                    backgroundColor: GOLD,
                  }}
                />
              ) : null}
            </View>
            <Text style={{ fontFamily: "LibreBaskerville", fontSize: 12, color: INK_DIM }}>
              {relativeTime(row.created_at)}
            </Text>
          </View>
          <Text numberOfLines={1} style={{ fontFamily: "LibreBaskerville", marginTop: 2, fontSize: 12.5, color: INK_DIM }}>
            {row.event_date ?? "Date TBD"}
            {row.guest_count ? ` · ${row.guest_count} guests` : ""}
            {previewBudget}
          </Text>
          {row.special_requests ? (
            <Text
              numberOfLines={2}
              style={{ fontFamily: "LibreBaskerville", marginTop: 6, fontSize: 14, color: "#3c3f45" }}
            >
              {row.special_requests}
            </Text>
          ) : null}
          {isUnread ? (
            <View
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                borderRadius: 999,
                backgroundColor: "rgba(201,168,106,0.18)",
                borderWidth: 1,
                borderColor: GOLD,
                paddingHorizontal: 9,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  fontFamily: SERIF_BOLD,
                  fontSize: 10,
                  letterSpacing: 1,
                  color: "#8a6f3e",
                }}
              >
                NEW
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PartnerRow({ thread, divider }: { thread: PartnerThread; divider: boolean }) {
  // Partner-to-partner chat now has a native screen.
  const router = useRouter();
  function open() {
    router.push(`/(vendor)/partner-thread/${thread.id}` as never);
  }

  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.75}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: BORDER,
      }}
    >
      <Avatar
        seed={thread.other_business_name}
        label={initials(thread.other_business_name)}
      />
      <View style={{ marginLeft: 12, flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: SERIF_BOLD,
              fontSize: 16.5,
              color: INK,
              flexShrink: 1,
            }}
          >
            {thread.other_business_name}
          </Text>
          {thread.other_category ? (
            <View
              style={{
                marginLeft: 8,
                borderRadius: 999,
                backgroundColor: TRACK,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text style={{ fontFamily: "LibreBaskerville", fontSize: 11, color: INK_DIM }}>
                {thread.other_category}
              </Text>
            </View>
          ) : null}
        </View>
        {thread.last_preview ? (
          <Text numberOfLines={1} style={{ fontFamily: "LibreBaskerville", marginTop: 2, fontSize: 14, color: INK_DIM }}>
            {thread.last_preview}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontFamily: "LibreBaskerville", marginLeft: 8, fontSize: 12, color: INK_DIM }}>
        {relativeTime(thread.last_message_at)}
      </Text>
    </TouchableOpacity>
  );
}
