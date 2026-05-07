// Events tab. Lists events the host has booked / is planning, derived
// from inquiries that have status = "won". Once the dedicated `events`
// table lands, this swaps over without touching the screen.

import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { InquiryRow } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function EventsScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("inquiries")
        .select(
          "id, vendor_id, host_id, status, event_type, event_date, guest_count, budget_min_cents, budget_max_cents, quality_score, created_at",
        )
        .eq("host_id", user.id)
        .eq("status", "won")
        .order("event_date", { ascending: true, nullsFirst: false });
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
        <Text className="text-xl font-semibold text-foreground">Events</Text>
        <Text className="text-xs text-muted-foreground">Your booked vendors</Text>
      </View>

      <ScrollView>
        {loading ? (
          <View className="px-4 py-8">
            <Text className="text-sm text-muted-foreground">Loading…</Text>
          </View>
        ) : rows.length === 0 ? (
          <View className="px-4 py-16 items-center">
            <Text className="text-sm text-muted-foreground">
              No bookings yet. Once a vendor confirms, they'll show up here.
            </Text>
          </View>
        ) : (
          rows.map((row, i) => (
            <View
              key={row.id}
              className={`px-4 py-4 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <Text className="text-base font-semibold text-foreground">
                {row.event_type}
              </Text>
              <Text className="mt-1 text-xs text-muted-foreground">
                {row.event_date ?? "Date TBD"}
                {row.guest_count ? ` · ${row.guest_count} guests` : ""}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
