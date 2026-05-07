// Host vendor browse. Lists vendors by category. The full filter set
// (location, price, attributes) and the rich profile view stay on web
// for now — mobile gets the discovery-feed pattern: full-bleed cards,
// category chips, snap-to-section.

import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CATEGORY_GROUPS, formatCents } from "@vendora/core";
import type { CategoryGroup, VendorProfile } from "@vendora/core";
import { supabase } from "@/lib/supabase";

export default function ExploreScreen() {
  const [activeGroup, setActiveGroup] = useState<CategoryGroup>(CATEGORY_GROUPS[0]);
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, bio, base_price_cents, location, verified_at, application_status, application_review_notes, intro_video_url, weekly_digest_enabled, slug, instagram_handle, tiktok_handle",
        )
        .in("category", activeGroup.subs)
        .eq("application_status", "approved")
        .order("verified_at", { ascending: false, nullsFirst: false })
        .limit(40);
      if (cancelled) return;
      setVendors((data ?? []) as VendorProfile[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeGroup]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="border-b border-border px-4 py-3">
        <Text className="text-2xl font-semibold text-foreground">Explore</Text>
        <Text className="text-xs text-muted-foreground">{activeGroup.description}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 py-3 gap-2"
        className="flex-grow-0 border-b border-border"
      >
        {CATEGORY_GROUPS.map((g) => {
          const active = g.slug === activeGroup.slug;
          return (
            <Pressable
              key={g.slug}
              onPress={() => setActiveGroup(g)}
              className={`rounded-full px-3 py-1.5 ${
                active ? "bg-foreground" : "bg-muted"
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  active ? "text-background" : "text-foreground"
                }`}
              >
                {g.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerClassName="pb-12">
        {loading ? (
          <View className="px-4 py-8">
            <Text className="text-sm text-muted-foreground">Loading…</Text>
          </View>
        ) : vendors.length === 0 ? (
          <View className="px-4 py-8">
            <Text className="text-sm text-muted-foreground">
              No vendors in this category yet.
            </Text>
          </View>
        ) : (
          vendors.map((v, i) => (
            <Pressable
              key={v.id}
              className={`px-4 py-4 active:bg-muted ${i > 0 ? "border-t border-border" : ""}`}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                    {v.business_name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
                    {v.category}
                    {v.location ? ` · ${v.location}` : ""}
                  </Text>
                  {v.bio ? (
                    <Text className="mt-2 text-sm text-foreground" numberOfLines={2}>
                      {v.bio}
                    </Text>
                  ) : null}
                </View>
                <View className="items-end">
                  <Text className="text-sm font-semibold text-foreground">
                    {formatCents(v.base_price_cents)}
                  </Text>
                  {v.verified_at ? (
                    <Text className="mt-1 text-[10px] uppercase tracking-wide text-accent">
                      Verified
                    </Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
