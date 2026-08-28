// Setup checklist — the screen behind the Profile tab's "You're almost
// live!" banner. Shows every step between a fresh signup and being
// discoverable, with live done/not-done state computed straight from the
// vendor's data (lib/setupChecklist.ts), and routes each row to the
// screen where that step actually gets done.
//
// Styling: cream Vendora light theme matching the Profile tab, gold
// accents, serif headline — the light-side sibling of the dark auth
// flow. No function-form style props (device interop drops them).

import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { loadSetupState, type SetupItem, type SetupState } from "@/lib/setupChecklist";
import { editorRouteFor } from "@/components/listing/WizardKit";

const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const INK = "#14161a";
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = "#14161a";
const GOLD = "#c9a86a";
// Champagne bronze — the landing page's text accent. #c9a86a is
// reserved for fills and glyphs; as words on cream it only reaches
// 2:1, so every gold *label* uses this instead.
const BRONZE = "#8a6f3e";
const GOLD_SOFT = "rgba(201,168,106,0.35)";
const BORDER = "rgba(20,22,26,0.10)";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

export default function SetupChecklistScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [state, setState] = useState<SetupState | null>(null);
  const [creating, setCreating] = useState(false);

  // Reload every time the screen gains focus, so finishing a step on
  // another screen and coming back flips its checkmark immediately.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!user?.id) return;
      loadSetupState(user.id)
        .then((s) => {
          if (!cancelled) setState(s);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [user?.id]),
  );

  // Listing rows open the right editor for the listing's category
  // directly (category wizard or the generic form — the wizards carry a
  // category picker in Basics, so "change category" works everywhere).
  // If no listing exists yet, create a draft and start generic.
  async function openListingBuilder() {
    if (state?.primaryListingId) {
      router.push(
        `/(vendor)/${editorRouteFor(state.primaryCategory)}?id=${state.primaryListingId}` as never,
      );
      return;
    }
    if (!user?.id || creating) return;
    setCreating(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_profiles")
      .insert({ user_id: user.id, application_status: "draft" })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data?.id) {
      Alert.alert("Couldn't create a listing", error?.message ?? "Unknown error");
      return;
    }
    router.push(`/(vendor)/listing?id=${data.id}` as never);
  }

  function openItem(item: SetupItem) {
    if (item.route === "edit-profile") {
      router.push("/(vendor)/edit-profile" as never);
    } else if (item.route === "listing") {
      void openListingBuilder();
    } else if (item.route === "calendar") {
      router.push("/(vendor)/calendar" as never);
    }
  }

  const done = state?.requiredDone ?? 0;
  const total = state?.requiredTotal ?? 8;
  const pct = total === 0 ? 0 : done / total;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: PAGE }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 140,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(vendor)/profile" as never);
          }}
          hitSlop={12}
          style={{ alignSelf: "flex-start", paddingVertical: 8 }}
        >
          <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 16}}>
            ← Back
          </Text>
        </Pressable>

        <View style={{ marginTop: 12 }}>
          <Text
            style={{
              fontFamily: SERIF_BOLD,
              color: BRONZE,
              fontSize: 12,
              letterSpacing: 3,
            }}
          >
            {state?.complete ? "ALL SET" : "FINISH SETTING UP"}
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontFamily: SERIF_BOLD,
              fontSize: 38,
              lineHeight: 46,
              color: INK,
              letterSpacing: -0.5,
            }}
          >
            {state?.complete ? "You're live!" : "You're almost live"}
          </Text>
          <Text
            style={{
              fontFamily: SERIF,
              marginTop: 8,
              fontSize: 13,
              lineHeight: 19,
              color: INK_DIM,
            }}
          >
            {state?.complete
              ? "Everything's in place. Hosts can discover and book you."
              : "Complete these steps to start getting discovered by customers."}
          </Text>
        </View>

        {/* Progress — gold fill on a hairline track, X of Y. */}
        <View style={{ marginTop: 22 }}>
          <View
            style={{
              height: 8,
              borderRadius: 4,
              backgroundColor: "rgba(20,22,26,0.08)",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.round(pct * 100)}%`,
                height: 8,
                borderRadius: 4,
                backgroundColor: GOLD,
              }}
            />
          </View>
          <Text style={{ fontFamily: SERIF, marginTop: 8, fontSize: 13, color: INK_DIM }}>
            {state ? `${done} of ${total} complete` : "Checking your progress…"}
          </Text>
        </View>

        {/* Checklist rows. */}
        <View
          style={{
            marginTop: 18,
            backgroundColor: CARD,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: BORDER,
            overflow: "hidden",
          }}
        >
          {(state?.items ?? []).map((item, i) => {
            const tappable = item.route !== null;
            const row = (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 15,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: BORDER,
                }}
              >
                {/* Done marker. */}
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: item.done ? GOLD : "transparent",
                    borderWidth: item.done ? 0 : 1.5,
                    borderColor: GOLD_SOFT,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 14,
                  }}
                >
                  {item.done ? (
                    <MaterialCommunityIcons name="check" size={16} color={INK} />
                  ) : null}
                </View>

                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={{
                        fontFamily: SERIF_BOLD,
                        fontSize: 16,
                        color: INK,
                      }}
                    >
                      {item.title}
                    </Text>
                    {item.optional ? (
                      <View
                        style={{
                          marginLeft: 8,
                          borderRadius: 999,
                          backgroundColor: "rgba(20,22,26,0.06)",
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: SERIF_BOLD,
                            fontSize: 10,
                            letterSpacing: 1,
                            color: INK_DIM,
                          }}
                        >
                          OPTIONAL
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={{
                      fontFamily: SERIF,
                      marginTop: 2,
                      fontSize: 13,
                      lineHeight: 18,
                      color: INK_DIM,
                    }}
                  >
                    {item.subtitle}
                  </Text>
                </View>

                {tappable ? (
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={INK_DIM}
                  />
                ) : null}
              </View>
            );
            return tappable ? (
              <TouchableOpacity
                key={item.key}
                onPress={() => openItem(item)}
                activeOpacity={0.6}
              >
                {row}
              </TouchableOpacity>
            ) : (
              <View key={item.key}>{row}</View>
            );
          })}
        </View>

        {state?.complete ? (
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(vendor)/profile" as never);
            }}
            activeOpacity={0.85}
            style={{
              marginTop: 24,
              backgroundColor: GOLD,
              borderRadius: 999,
              height: 56,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 16}}>
              Back to my profile
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
