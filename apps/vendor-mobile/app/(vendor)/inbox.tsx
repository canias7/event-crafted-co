// Vendor inbox. Lists inquiries assigned to this vendor, newest first,
// in the same Instagram-feed pattern the web mobile inbox uses —
// hairline-divided rows, larger tap targets, status pill on the right.

import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatCents } from "@vendora/core";
import type { InquiryRow } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

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
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: vendor } = await supabase
        .from("vendor_profiles")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();
      const vendorId = (vendor as { id?: string } | null)?.id;
      if (!vendorId) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("inquiries")
        .select("id, vendor_id, host_id, status, event_type, event_date, guest_count, budget_min_cents, budget_max_cents, quality_score, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setRows((data ?? []) as InquiryRow[]);
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
          {loading ? "Loading…" : `${rows.length} ${rows.length === 1 ? "inquiry" : "inquiries"}`}
        </Text>
      </View>

      <ScrollView>
        {rows.length === 0 && !loading ? (
          <View className="items-center px-4 py-16">
            <Text className="text-sm text-muted-foreground">
              No inquiries yet. New leads land here.
            </Text>
          </View>
        ) : (
          rows.map((row, i) => (
            <Pressable
              key={row.id}
              className={`flex-row items-center px-4 py-4 active:bg-muted ${i > 0 ? "border-t border-border" : ""}`}
            >
              <View className={`mr-3 h-2 w-2 rounded-full ${STATUS_COLOR[row.status]}`} />
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                  {row.event_type}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
                  {row.event_date ?? "Date TBD"}
                  {row.guest_count ? ` · ${row.guest_count} guests` : ""}
                  {row.budget_max_cents
                    ? ` · up to ${formatCents(row.budget_max_cents)}`
                    : ""}
                </Text>
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
