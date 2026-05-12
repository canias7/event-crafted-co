// Vendor mobile dashboard. Pulls the same KPIs the web dashboard pulls
// (active inquiries, response rate, open packages, week's revenue) and
// stacks them in 2-column grid. Reuses formatCents / formatCount from
// @vendora/core so currency renders identically here and on the web.
//
// Reached from the Profile tab's "Dashboard" chip — not a tab itself —
// so we render a back arrow that pops back to the Profile screen.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { formatCents, formatCount } from "@vendora/core";
import type { InquiryRow } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { StatTile } from "@/components/StatTile";

interface Stats {
  activeInquiries: number;
  weekRevenueCents: number;
  views: number;
  responseRate: number;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!user) {
        // Make sure pull-to-refresh doesn't hang the spinner if we
        // re-enter while signed-out.
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
        return;
      }
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
      const vendorIds = ((vendorRows ?? []) as { id: string }[]).map((r) => r.id);
      if (vendorIds.length === 0) {
        setStats({ activeInquiries: 0, weekRevenueCents: 0, views: 0, responseRate: 0 });
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
        return;
      }
      const sinceISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: inquiries, error: iErr } = await supabase
        .from("inquiries")
        .select(
          "id, vendor_id, host_id, status, event_type, event_date, guest_count, budget_min_cents, budget_max_cents, quality_score, created_at",
        )
        .in("vendor_id", vendorIds)
        .order("created_at", { ascending: false })
        .limit(20);
      if (iErr) {
        setError(iErr.message);
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
        return;
      }
      const rows = (inquiries ?? []) as InquiryRow[];
      const active = rows.filter((r) => r.status === "new" || r.status === "drafted").length;
      const wonThisWeek = rows.filter((r) => r.status === "won" && r.created_at >= sinceISO);
      const weekCents = wonThisWeek.reduce(
        (sum, r) => sum + Math.floor(((r.budget_min_cents ?? 0) + (r.budget_max_cents ?? 0)) / 2),
        0,
      );
      const replied = rows.filter((r) => r.status !== "new").length;
      const responseRate = rows.length === 0 ? 0 : Math.round((replied / rows.length) * 100);
      setStats({ activeInquiries: active, weekRevenueCents: weekCents, views: 0, responseRate });
      setRecent(rows.slice(0, 5));
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    },
    [user],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center px-4 pt-3 pb-2">
        <Pressable
          hitSlop={10}
          onPress={() => router.replace("/(vendor)/profile")}
          className="active:opacity-60"
        >
          <Feather name="arrow-left" size={22} color="#0a0a0a" />
        </Pressable>
      </View>
      <ScrollView
        contentContainerClassName="px-4 pb-32 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor="#1a1410"
          />
        }
      >
        <Text className="mb-1 text-2xl font-semibold text-foreground">Dashboard</Text>
        <Text className="mb-6 text-sm text-muted-foreground">
          {loading ? "Loading…" : "Last 7 days"}
        </Text>
        {error ? (
          <View className="mb-4 rounded-xl bg-red-50 px-4 py-3 border border-red-200">
            <Text className="text-sm text-red-700">{error}</Text>
            <Pressable onPress={() => load(false)} className="mt-2 active:opacity-70">
              <Text className="text-sm font-semibold text-red-700">Try again</Text>
            </Pressable>
          </View>
        ) : null}
        {loading ? (
          <View className="items-center py-8">
            <ActivityIndicator color="#1a1410" />
          </View>
        ) : null}

        <View className="mb-3 flex-row gap-3">
          <StatTile
            label="Active inquiries"
            value={stats ? formatCount(stats.activeInquiries) : "—"}
          />
          <StatTile
            label="Week revenue"
            value={stats ? formatCents(stats.weekRevenueCents) : "—"}
          />
        </View>
        <View className="mb-6 flex-row gap-3">
          <StatTile
            label="Response rate"
            value={stats ? `${stats.responseRate}%` : "—"}
          />
          <StatTile
            label="Profile views"
            value={stats ? formatCount(stats.views) : "—"}
            hint="Coming soon"
          />
        </View>

        <Text className="mb-3 text-base font-semibold text-foreground">
          Recent inquiries
        </Text>
        {recent.length === 0 ? (
          <View className="rounded-xl border border-border bg-background p-4">
            <Text className="text-sm text-muted-foreground">
              {loading ? "Loading…" : "No inquiries yet."}
            </Text>
          </View>
        ) : (
          <View className="overflow-hidden rounded-xl border border-border bg-background">
            {recent.map((row, i) => (
              <View
                key={row.id}
                className={`px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <Text className="text-sm font-medium text-foreground">
                  {row.event_type}
                </Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  {row.event_date ?? "Date TBD"} · {row.status}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
