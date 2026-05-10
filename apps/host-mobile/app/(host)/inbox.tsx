// Host inbox. Lists this host's outbound inquiries — opposite side of
// the conversation from vendor-mobile/inbox.tsx. Same data shape; the
// filter changes (host_id instead of vendor_id) and the row label
// shows the vendor business name.

import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { formatCents } from "@vendora/core";
import type { InquiryRow } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// PostgREST returns embedded relations as an array even for a single
// foreign-key join, so vendor_profiles is `[{business_name}]` shaped,
// not a single object. We pull the first row in the render.
interface RowWithVendor extends InquiryRow {
  vendor_profiles?: { business_name: string }[] | null;
}

const STATUS_COLOR: Record<InquiryRow["status"], string> = {
  new: "bg-accent",
  drafted: "bg-yellow-500",
  replied: "bg-blue-500",
  won: "bg-green-700",
  lost: "bg-neutral-400",
  expired: "bg-neutral-400",
};

export default function InboxScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<RowWithVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function openRow(inquiryId: string) {
    if (openingId) return;
    setOpeningId(inquiryId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("ensure_inquiry_thread", {
      p_inquiry_id: inquiryId,
    });
    setOpeningId(null);
    if (error || !data) return;
    router.push(`/(host)/thread/${data as string}` as never);
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("inquiries")
        .select(
          "id, vendor_id, host_id, status, event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests, quality_score, created_at, vendor_profiles(business_name)",
        )
        .eq("host_id", user.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setRows((data ?? []) as RowWithVendor[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="border-b border-border px-4 py-3">
        <Text className="text-xl font-semibold text-foreground">Inbox</Text>
        <Text className="text-xs text-muted-foreground">
          {loading
            ? "Loading…"
            : `${rows.length} ${rows.length === 1 ? "conversation" : "conversations"}`}
        </Text>
      </View>

      <ScrollView>
        {rows.length === 0 && !loading ? (
          <View className="items-center px-4 py-16">
            <Text className="text-sm text-muted-foreground">
              No conversations yet. Reach out to a vendor from Explore.
            </Text>
          </View>
        ) : (
          rows.map((row, i) => (
            <Pressable
              key={row.id}
              onPress={() => openRow(row.id)}
              className={`flex-row items-center px-4 py-4 active:bg-muted ${i > 0 ? "border-t border-border" : ""}`}
            >
              <View className={`mr-3 h-2 w-2 rounded-full ${STATUS_COLOR[row.status]}`} />
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                  {row.vendor_profiles?.[0]?.business_name ?? "Vendor"}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
                  {row.event_type}
                  {row.event_date ? ` · ${row.event_date}` : ""}
                  {row.budget_max_cents
                    ? ` · up to ${formatCents(row.budget_max_cents)}`
                    : ""}
                </Text>
                {row.special_requests ? (
                  <Text
                    className="mt-1 text-sm text-foreground/80"
                    numberOfLines={2}
                  >
                    {row.special_requests}
                  </Text>
                ) : null}
              </View>
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                {row.status}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
