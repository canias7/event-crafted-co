// Public listing detail screen — read-only view of a vendor's
// marketplace listing. Reached from Home → Listings card tap.
// Mirrors the web /vendors/<id-or-slug> page with the bits hosts
// actually look at (photos, bio, price, packages, FAQs, policies,
// team). Inquiries / appointments are still web-only for now.

import { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

type VendorRow = {
  id: string;
  business_name: string | null;
  category: string | null;
  bio: string | null;
  location: string | null;
  base_price_cents: number | null;
  application_status: string | null;
  slug: string | null;
};

type PortfolioRow = { storage_path: string };

type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  includes: string[];
};

type FaqRow = {
  id: string;
  question: string;
  answer: string;
};

type TeamRow = {
  id: string;
  display_name: string;
  role: string | null;
  bio: string | null;
  is_owner: boolean;
};

type PolicyRow = {
  deposit_pct: number | null;
  cancellation_policy: string | null;
  reschedule_window_days: number | null;
  policy_notes: string | null;
};

const CANCELLATION_LABEL: Record<string, string> = {
  flexible: "Flexible — full refund up to 7 days before",
  moderate: "Moderate — 50% up to 30 days before",
  strict: "Strict — non-refundable",
};

export default function VendorDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [policy, setPolicy] = useState<PolicyRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      // Resolve by id first; fall back to slug if the param isn't a UUID.
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        );
      const baseQuery = supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, bio, location, base_price_cents, application_status, slug, deposit_pct, cancellation_policy, reschedule_window_days, policy_notes",
        );
      const { data: vp } = isUuid
        ? await baseQuery.eq("id", id).maybeSingle()
        : await baseQuery.eq("slug", id).maybeSingle();
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = vp as any;
      if (!row) {
        setLoading(false);
        return;
      }
      setVendor({
        id: row.id,
        business_name: row.business_name,
        category: row.category,
        bio: row.bio,
        location: row.location,
        base_price_cents: row.base_price_cents,
        application_status: row.application_status,
        slug: row.slug,
      });
      setPolicy({
        deposit_pct: row.deposit_pct,
        cancellation_policy: row.cancellation_policy,
        reschedule_window_days: row.reschedule_window_days,
        policy_notes: row.policy_notes,
      });

      const [imgsRes, packRes, faqRes, teamRes] = await Promise.all([
        supabase
          .from("vendor_portfolio_images")
          .select("storage_path")
          .eq("vendor_id", row.id)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("vendor_packages")
          .select("id, name, description, price_cents, includes")
          .eq("vendor_id", row.id)
          .eq("is_active", true)
          .order("display_order", { ascending: true })
          .order("price_cents", { ascending: true }),
        supabase
          .from("vendor_faqs")
          .select("id, question, answer")
          .eq("vendor_id", row.id)
          .order("display_order", { ascending: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_team_bios")
          .select("id, display_name, role, bio, is_owner, display_order")
          .eq("vendor_id", row.id)
          .order("is_owner", { ascending: false })
          .order("display_order", { ascending: true }),
      ]);
      if (cancelled) return;

      const urls = ((imgsRes.data ?? []) as PortfolioRow[]).map(
        (r) =>
          supabase.storage.from("vendor-portfolios").getPublicUrl(r.storage_path)
            .data.publicUrl,
      );
      setPhotos(urls);
      setPackages((packRes.data ?? []) as unknown as PackageRow[]);
      setFaqs((faqRes.data ?? []) as unknown as FaqRow[]);
      setTeam(((teamRes as { data?: TeamRow[] }).data ?? []) as TeamRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <TopBar onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-muted-foreground">Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!vendor) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <TopBar onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base text-foreground text-center">
            Listing not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const price =
    vendor.base_price_cents != null
      ? `From $${Math.round(vendor.base_price_cents / 100).toLocaleString()}`
      : null;
  const screenWidth = Dimensions.get("window").width;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TopBar onBack={() => router.back()} />
      <ScrollView contentContainerClassName="pb-12">
        {/* Photo gallery — horizontal swipe through portfolio images. */}
        {photos.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
          >
            {photos.map((url, i) => (
              <Image
                key={`${url}-${i}`}
                source={{ uri: url }}
                style={{ width: screenWidth, aspectRatio: 1 }}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <View
            style={{
              width: screenWidth,
              aspectRatio: 1,
              backgroundColor: "#f4f4f5",
            }}
            className="items-center justify-center"
          >
            <Feather name="image" size={36} color="#a1a1aa" />
            <Text className="mt-2 text-sm text-muted-foreground">
              No listing photos yet
            </Text>
          </View>
        )}

        {/* Header — name, category · location, price */}
        <View className="px-4 pt-5">
          <Text className="text-2xl font-bold text-foreground">
            {vendor.business_name ?? "Vendor"}
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {vendor.category ?? ""}
            {vendor.location ? ` · ${vendor.location}` : ""}
          </Text>
          {price ? (
            <Text className="mt-2 text-base font-semibold text-foreground">
              {price}
            </Text>
          ) : null}
        </View>

        {/* Bio */}
        {vendor.bio ? (
          <View className="px-4 pt-6">
            <Text className="text-base text-foreground/90 leading-relaxed">
              {vendor.bio}
            </Text>
          </View>
        ) : null}

        {packages.length > 0 ? (
          <Section title="Packages">
            {packages.map((p) => (
              <View
                key={p.id}
                className="rounded-lg border border-border bg-background p-3 mb-3"
              >
                <View className="flex-row items-start justify-between">
                  <Text className="flex-1 text-base font-semibold text-foreground pr-3">
                    {p.name}
                  </Text>
                  <Text className="text-base font-semibold text-foreground">
                    ${(p.price_cents / 100).toLocaleString()}
                  </Text>
                </View>
                {p.description ? (
                  <Text className="mt-1 text-sm text-foreground/80">
                    {p.description}
                  </Text>
                ) : null}
                {p.includes && p.includes.length > 0 ? (
                  <View className="mt-2 gap-1">
                    {p.includes.map((line, idx) => (
                      <Text key={idx} className="text-xs text-muted-foreground">
                        • {line}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {team.length > 0 ? (
          <Section title="Team">
            {team.map((m) => (
              <View
                key={m.id}
                className="rounded-lg border border-border bg-background p-3 mb-3"
              >
                <Text className="text-base font-semibold text-foreground">
                  {m.display_name}
                  {m.is_owner ? " · Owner" : ""}
                </Text>
                {m.role ? (
                  <Text className="text-sm text-muted-foreground">{m.role}</Text>
                ) : null}
                {m.bio ? (
                  <Text className="mt-1 text-sm text-foreground/80">
                    {m.bio}
                  </Text>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {faqs.length > 0 ? (
          <Section title="FAQ">
            {faqs.map((f) => (
              <View key={f.id} className="mb-4">
                <Text className="text-base font-semibold text-foreground">
                  {f.question}
                </Text>
                <Text className="mt-1 text-sm text-foreground/80">
                  {f.answer}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}

        {policy &&
        (policy.deposit_pct != null ||
          policy.cancellation_policy ||
          policy.reschedule_window_days != null ||
          policy.policy_notes) ? (
          <Section title="Policies">
            {policy.deposit_pct != null ? (
              <PolicyRow label="Deposit" value={`${policy.deposit_pct}%`} />
            ) : null}
            {policy.cancellation_policy ? (
              <PolicyRow
                label="Cancellation"
                value={
                  CANCELLATION_LABEL[policy.cancellation_policy] ??
                  policy.cancellation_policy
                }
              />
            ) : null}
            {policy.reschedule_window_days != null ? (
              <PolicyRow
                label="Reschedule window"
                value={`${policy.reschedule_window_days} days`}
              />
            ) : null}
            {policy.policy_notes ? (
              <View className="pt-3">
                <Text className="text-sm text-foreground/90 leading-relaxed">
                  {policy.policy_notes}
                </Text>
              </View>
            ) : null}
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View className="flex-row items-center px-4 py-3 border-b border-border">
      <Pressable onPress={onBack} hitSlop={8} className="active:opacity-60">
        <Feather name="chevron-left" size={26} color="#0a0a0a" />
      </Pressable>
      <Text className="flex-1 text-center text-base font-bold text-foreground">
        Listing
      </Text>
      <View className="w-7" />
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="px-4 pt-7">
      <Text className="text-lg font-semibold text-foreground mb-3">
        {title}
      </Text>
      {children}
    </View>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start py-2 border-b border-border">
      <Text className="w-32 text-sm text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-sm text-foreground">{value}</Text>
    </View>
  );
}
