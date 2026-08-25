// Public listing detail screen — Airbnb-style read-only view of a
// vendor's marketplace listing. Reached from Home → Listings card
// tap. Mirrors the web /vendors/<id-or-slug> page with the bits
// hosts actually look at (photos, headline, bio, price,
// FAQs, policies). Inquiries / appointments are still web-only
// for now.
//
// Layout: full-bleed photo gallery at the top with circular
// back / share / heart overlays, page indicator pill (1 / N) at the
// bottom-right of the image. The white content card has rounded top
// corners that sit over the bottom of the gallery. Sticky bottom
// action bar with "From $X" and an Inquire CTA.

import { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { formatListingPrice, pricingModelsLabel } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type VendorRow = {
  id: string;
  business_name: string | null;
  category: string | null;
  bio: string | null;
  location: string | null;
  base_price_cents: number | null;
  pricing_models: string[] | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  custom_pricing: boolean | null;
  application_status: string | null;
  slug: string | null;
  verified_at: string | null;
};

type PortfolioRow = { storage_path: string };

type FaqRow = {
  id: string;
  question: string;
  answer: string;
};

export default function VendorDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [savingHeart, setSavingHeart] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        );
      const baseQuery = supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, bio, location, base_price_cents, pricing_models, price_min_cents, price_max_cents, custom_pricing, application_status, slug, verified_at",
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
        pricing_models: row.pricing_models,
        price_min_cents: row.price_min_cents,
        price_max_cents: row.price_max_cents,
        custom_pricing: row.custom_pricing,
        application_status: row.application_status,
        slug: row.slug,
        verified_at: row.verified_at,
      });
      const [imgsRes, faqRes] = await Promise.all([
        supabase
          .from("vendor_portfolio_images")
          .select("storage_path")
          .eq("vendor_id", row.id)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("vendor_faqs")
          .select("id, question, answer")
          .eq("vendor_id", row.id)
          .order("display_order", { ascending: true }),
      ]);
      if (cancelled) return;

      const urls = ((imgsRes.data ?? []) as PortfolioRow[]).map(
        (r) =>
          supabase.storage.from("vendor-portfolios").getPublicUrl(r.storage_path)
            .data.publicUrl,
      );
      setPhotos(urls);
      setFaqs((faqRes.data ?? []) as unknown as FaqRow[]);
      // Seed the heart from saved_vendors. saved_vendors.host_id points
      // at the profiles row (any role), so a vendor can save another
      // vendor — RLS only enforces auth.uid() = host_id.
      if (user?.id) {
        const { data: savedRow } = await supabase
          .from("saved_vendors")
          .select("vendor_id")
          .eq("host_id", user.id)
          .eq("vendor_id", row.id)
          .maybeSingle();
        if (!cancelled) setSaved(savedRow != null);
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  const toggleSaved = useCallback(async () => {
    if (!user?.id || !vendor?.id || savingHeart) return;
    setSavingHeart(true);
    const next = !saved;
    setSaved(next);
    if (next) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("saved_vendors")
        .upsert(
          { host_id: user.id, vendor_id: vendor.id },
          { onConflict: "host_id,vendor_id" },
        );
      if (error) setSaved(false);
    } else {
      const { error } = await supabase
        .from("saved_vendors")
        .delete()
        .eq("host_id", user.id)
        .eq("vendor_id", vendor.id);
      if (error) setSaved(true);
    }
    setSavingHeart(false);
  }, [user?.id, vendor?.id, saved, savingHeart]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!vendor) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="active:opacity-70"
          >
            <Feather name="chevron-left" size={26} color="#14161a" />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base text-foreground text-center" style={{ fontFamily: "LibreBaskerville" }}>
            Listing not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const screenWidth = Dimensions.get("window").width;
  const galleryHeight = Math.round(screenWidth * 0.95);
  const price =
    formatListingPrice(vendor.price_min_cents, vendor.price_max_cents) || null;
  const models = pricingModelsLabel(vendor.pricing_models);

  async function shareListing() {
    if (!vendor) return;
    const url = vendor.slug
      ? `https://eventvendora.com/vendors/${vendor.slug}`
      : `https://eventvendora.com/vendors/${vendor.id}`;
    await Share.share({
      message: `${vendor.business_name ?? "This vendor"} on Vendora — ${url}`,
      url,
    }).catch(() => {});
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo gallery — full-bleed, swipeable. */}
        <View
          style={{ width: screenWidth, height: galleryHeight }}
          className="bg-muted"
        >
          {photos.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                setPhotoIndex(Math.round(x / screenWidth));
              }}
            >
              {photos.map((url, i) => (
                <Image
                  key={`${url}-${i}`}
                  source={{ uri: url }}
                  style={{ width: screenWidth, height: galleryHeight }}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : (
            <View
              style={{ width: screenWidth, height: galleryHeight }}
              className="items-center justify-center"
            >
              <Feather name="image" size={36} color="#a1a1aa" />
              <Text className="mt-2 text-sm text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
                No listing photos yet
              </Text>
            </View>
          )}
        </View>

        {/* Floating overlay buttons + page indicator. SafeArea-aware. */}
        <SafeAreaView
          edges={["top"]}
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          <View
            pointerEvents="box-none"
            className="flex-row items-center justify-between px-4 pt-2"
          >
            <RoundButton onPress={() => router.back()} icon="chevron-left" />
            <View className="flex-row gap-2">
              <RoundButton onPress={shareListing} icon="share" />
              <RoundButton
                onPress={toggleSaved}
                icon="heart"
                iconColor={saved ? "#dc2828" : "#14161a"}
                fillHeart={saved}
              />
            </View>
          </View>
        </SafeAreaView>

        {photos.length > 1 ? (
          <View
            style={{
              position: "absolute",
              top: galleryHeight - 36,
              right: 16,
            }}
          >
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: "rgba(0,0,0,0.55)",
              }}
            >
              <Text className="text-xs text-white" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                {photoIndex + 1} / {photos.length}
              </Text>
            </View>
          </View>
        ) : null}

        {/* White content card — overlaps the bottom of the gallery. */}
        <View
          style={{
            backgroundColor: "#fbf9f4",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            marginTop: -22,
            paddingTop: 20,
            paddingBottom: 8,
          }}
        >
          {/* Title */}
          <View className="px-5">
            <Text
              className="text-3xl text-foreground leading-9"
              style={{ fontFamily: "LibreBaskerville-Bold" }}
            >
              {vendor.business_name ?? "Vendor"}
            </Text>
            <Text className="mt-2 text-base text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
              {vendor.category ?? ""}
              {vendor.location ? ` · ${vendor.location}` : ""}
            </Text>
          </View>

          {/* Stats row — 3 cells separated by vertical lines. */}
          <View className="mx-5 mt-5 rounded-2xl border border-border">
            <View className="flex-row">
              <StatCell
                top={
                  <View className="flex-row items-center gap-1">
                    <Text className="text-base text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                      {vendor.verified_at ? "Verified" : "New"}
                    </Text>
                  </View>
                }
                bottom={vendor.verified_at ? "Vendora-checked" : "Just listed"}
              />
              <Divider />
              <StatCell
                top={
                  <Text className="text-base text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                    {faqs.length}
                  </Text>
                }
                bottom={faqs.length === 1 ? "FAQ" : "FAQs"}
              />
            </View>
          </View>

          {/* Host / owner section removed — vendor_team_bios retired. */}

          {/* Bio */}
          {vendor.bio ? (
            <View className="px-5 pt-6">
              <Text className="text-base text-foreground leading-relaxed" style={{ fontFamily: "LibreBaskerville" }}>
                {vendor.bio}
              </Text>
            </View>
          ) : null}

        </View>
      </ScrollView>

      {/* Sticky bottom action bar — Reserve-style. */}
      <SafeAreaView
        edges={["bottom"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#fbf9f4",
          borderTopWidth: 1,
          borderTopColor: "#e6e1d5",
        }}
      >
        <View className="flex-row items-center justify-between px-5 py-3">
          <View className="flex-1 pr-3">
            {price ? (
              <>
                <Text
                  className="text-xl text-foreground"
                  style={{ fontFamily: "LibreBaskerville", textDecorationLine: "underline" }}
                >
                  {price}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
                  {vendor.category ?? "Marketplace listing"}
                </Text>
                {models ? (
                  <Text className="mt-0.5 text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
                    {models}
                  </Text>
                ) : null}
                {vendor.custom_pricing ? (
                  <Text className="mt-0.5 text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
                    Pricing varies by event details.
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text className="text-xl text-foreground" style={{ fontFamily: "LibreBaskerville-Bold" }}>
                  Pricing on request
                </Text>
                {models ? (
                  <Text className="mt-0.5 text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
                    {models}
                  </Text>
                ) : null}
                {vendor.custom_pricing ? (
                  <Text className="mt-0.5 text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>
                    Pricing varies by event details.
                  </Text>
                ) : null}
              </>
            )}
          </View>
          {/* Vendors browsing other vendors don't "inquire" — this
              is the marketplace's own listing page, useful for
              comparing your listing against a peer's. We label it
              honestly as "View on web" since that's exactly what the
              tap does. Hosts use a separate Inquire CTA in
              host-mobile. */}
          <Pressable
            onPress={() => {
              const url = vendor.slug
                ? `https://eventvendora.com/vendors/${vendor.slug}`
                : `https://eventvendora.com/vendors/${vendor.id}`;
              Linking.openURL(url).catch(() => {});
            }}
            className="rounded-full active:opacity-80"
            style={{
              // INK — the app-wide primary button fill.
              backgroundColor: "#14161a",
              paddingHorizontal: 22,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Feather name="external-link" size={16} color="#ffffff" />
            <Text className="ml-2 text-base text-white" style={{ fontFamily: "LibreBaskerville-Bold" }}>
              View on web
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function RoundButton({
  onPress,
  icon,
  iconColor,
  fillHeart,
}: {
  onPress: () => void;
  icon: keyof typeof Feather.glyphMap;
  iconColor?: string;
  fillHeart?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.92)",
        alignItems: "center",
        justifyContent: "center",
      }}
      className="active:opacity-80"
    >
      <Feather
        name={icon}
        size={18}
        color={iconColor ?? "#14161a"}
        // expo's Feather doesn't support fill; render filled heart by
        // overlaying a colored circle inside on save.
      />
      {fillHeart ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: iconColor ?? "#dc2828",
          }}
        />
      ) : null}
    </Pressable>
  );
}

function StatCell({
  top,
  bottom,
}: {
  top: React.ReactNode;
  bottom: string;
}) {
  return (
    <View className="flex-1 items-center px-2 py-3">
      {top}
      <Text className="mt-1 text-xs text-muted-foreground" style={{ fontFamily: "LibreBaskerville" }}>{bottom}</Text>
    </View>
  );
}

function Divider() {
  return <View style={{ width: 1, backgroundColor: "#e6e1d5" }} />;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="px-5 pt-7">
      <Text className="text-xl text-foreground mb-3" style={{ fontFamily: "LibreBaskerville-Bold" }}>
        {title}
      </Text>
      {children}
    </View>
  );
}
