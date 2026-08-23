// Find a vendor — search every approved vendor by business name and open a
// partner thread with them.
//
// Mobile port of the web FindVendorPanel (apps/web/.../VendorPartnersPage).
// Before this screen existed, the Inbox search only filtered threads you
// ALREADY had, so there was no way to discover another vendor from the phone
// — the web app could do it and mobile couldn't.
//
// Uses the same find_or_create_partner_thread RPC the web panel and the
// public vendor profile's "Message vendor" button use, so an existing thread
// is reused instead of duplicated.
//
// Tier gate: starting a vendor-to-vendor conversation is Pro-and-up. The RPC
// raises 'v2v_requires_pro' for Free vendors; replying inside existing
// threads stays open to everyone. We surface that as an upgrade prompt
// rather than a raw error.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
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

interface VendorResult {
  id: string;
  user_id: string | null;
  business_name: string | null;
  category: string | null;
  location: string | null;
}

// Same palette + hashing as the Inbox avatars so a vendor keeps the same
// colour across screens.
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

const MIN_QUERY = 2;

export default function FindVendorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VendorResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  // Guards against an in-flight response for an older query overwriting a
  // newer one when the user keeps typing.
  const reqIdRef = useRef(0);

  // 200ms debounce, matching web — feels live without a query per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setSearching(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    setSearching(true);
    const t = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_profiles")
        .select("id, user_id, business_name, category, location")
        .eq("application_status", "approved")
        .ilike("business_name", `%${q}%`)
        .order("business_name", { ascending: true })
        .limit(15);
      if (reqId !== reqIdRef.current) return; // a newer search superseded this
      const rows = ((data ?? []) as VendorResult[]).filter(
        (r) => r.user_id && r.user_id !== user?.id,
      );
      setResults(rows);
      setSearching(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query, user?.id]);

  async function startThread(r: VendorResult) {
    if (!r.user_id || starting) return;
    Keyboard.dismiss();
    setStarting(r.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "find_or_create_partner_thread",
      { p_other_user_id: r.user_id },
    );
    setStarting(null);

    if (error || !data) {
      if (error?.message?.includes("v2v_requires_pro")) {
        Alert.alert(
          "Pro feature",
          "Vendor-to-vendor messaging is available on Pro and Premium. Replying to existing conversations stays free.",
          [
            { text: "Not now", style: "cancel" },
            {
              text: "See plans",
              onPress: () => router.push("/(vendor)/subscription"),
            },
          ],
        );
        return;
      }
      Alert.alert(
        "Couldn't start the conversation",
        error?.message ?? "Please try again in a moment.",
      );
      return;
    }

    router.push(`/(vendor)/partner-thread/${data}`);
  }

  const trimmed = query.trim();
  const showHint = trimmed.length > 0 && trimmed.length < MIN_QUERY;
  const showEmpty =
    trimmed.length >= MIN_QUERY && !searching && results.length === 0;

  const subtitle = useMemo(
    () => "Search any approved vendor by business name to start a chat.",
    [],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header with back — this screen is pushed, not a tab. */}
      <View className="flex-row items-center px-5 pt-2 pb-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="mr-3 active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={26} color="#14161a" />
        </Pressable>
        <Text className="text-3xl font-semibold text-foreground">
          Find a vendor
        </Text>
      </View>
      <Text className="px-5 pb-4 text-[13.5px] leading-[19px] text-muted-foreground">{subtitle}</Text>

      {/* Search */}
      <View className="px-5 mb-3">
        <View className="flex-row items-center rounded-full bg-muted px-4 py-3">
          <Feather name="search" size={16} color="#737373" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search vendors by business name"
            placeholderTextColor="#a3a3a3"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            className="ml-2 flex-1 text-base text-foreground"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery("")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={16} color="#737373" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerClassName="pb-32"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {searching ? (
          <View className="px-5 py-12 items-center">
            <ActivityIndicator color="#14161a" />
          </View>
        ) : showHint ? (
          <Text className="px-5 py-10 text-center text-sm text-muted-foreground">
            Keep typing — enter at least {MIN_QUERY} characters.
          </Text>
        ) : showEmpty ? (
          <Text className="px-5 py-10 text-center text-sm text-muted-foreground">
            No approved vendors match “{trimmed}”.
          </Text>
        ) : results.length === 0 ? (
          <Text className="px-5 py-10 text-center text-sm text-muted-foreground">
            Start typing a business name to find other vendors.
          </Text>
        ) : (
          <View className="px-5">
            {results.map((r, i) => {
              const name = r.business_name ?? "Unnamed vendor";
              const meta = [r.category, r.location].filter(Boolean).join(" · ");
              const isStarting = starting === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => void startThread(r)}
                  disabled={starting !== null}
                  className={`flex-row items-center py-3 active:opacity-60 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                  style={{ opacity: starting !== null && !isStarting ? 0.5 : 1 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Start a conversation with ${name}`}
                >
                  <View
                    className="h-12 w-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: avatarColor(r.id) }}
                  >
                    <Text className="text-sm font-semibold text-white">
                      {initials(name)}
                    </Text>
                  </View>
                  <View className="ml-3 flex-1">
                    <Text
                      className="text-base font-semibold text-foreground"
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    {meta ? (
                      <Text
                        className="mt-0.5 text-sm text-muted-foreground"
                        numberOfLines={1}
                      >
                        {meta}
                      </Text>
                    ) : null}
                  </View>
                  {isStarting ? (
                    <ActivityIndicator size="small" color="#14161a" />
                  ) : (
                    <Feather name="message-circle" size={18} color="#737373" />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
