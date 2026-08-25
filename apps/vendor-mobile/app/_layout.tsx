// Root layout. Wraps every screen in the AuthProvider so any descendant
// can `useAuth()`. NativeWind's global stylesheet is loaded once here.
import "../global.css";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import { useFonts } from "expo-font";
import { AuthProvider } from "@/lib/auth";

// Apply OTA updates on the launch that finds them, instead of expo-updates'
// default one-launch-behind behaviour (download now, run next time). The
// staleness was compounding: every fix a tester looked at was one version
// old, which made "did the update land?" impossible to answer by looking.
// The reload lands within the first seconds of a launch — before anyone is
// deep in a flow — and no-ops when the running update is already current.
function useApplyUpdatesOnLaunch() {
  useEffect(() => {
    if (__DEV__) return;
    let cancelled = false;
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (cancelled || !check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (cancelled) return;
        await Updates.reloadAsync();
      } catch {
        // Offline or the update server hiccuped — the app just runs what
        // it has, same as before this hook existed.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

// Crash net. In production RN there is no redbox — an unhandled JS error
// hard-crashes the app with zero information, which is undebuggable in
// the field. Two nets:
//   1. A global fatal-error handler (ErrorUtils) that swaps the UI for a
//      screen showing the actual error + stack, with a Reload button.
//   2. A React error boundary for render-time errors (JsFatalScreen is
//      also used as expo-router's route-level ErrorBoundary below).
// A visible error screen beats a silent crash every time — the tester
// screenshots it and the message points straight at the cause.
function describeError(e: unknown): string {
  if (e instanceof Error) {
    const stack = (e.stack ?? "")
      .split("\n")
      .slice(0, 8)
      .join("\n");
    return `${e.name}: ${e.message}\n\n${stack}`;
  }
  return String(e);
}

function JsFatalScreen({
  message,
  onReload,
}: {
  message: string;
  onReload: () => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f4f1ea" }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            color: "#b23a34",
            fontSize: 18,
          }}
        >
          Something went wrong
        </Text>
        <Text style={{ fontFamily: "LibreBaskerville", color: "#5e636e", marginTop: 8, fontSize: 13 }}>
          Screenshot this screen and send it to support — it shows exactly
          what broke.
        </Text>
        <View
          style={{
            marginTop: 16,
            backgroundColor: "#fbf9f4",
            borderRadius: 12,
            padding: 14,
          }}
        >
          <Text
            selectable
            style={{
              color: "#14161a",
              fontSize: 12,
              lineHeight: 18,
              fontFamily: "monospace",
            }}
          >
            {message}
          </Text>
        </View>
        <Pressable
          onPress={onReload}
          style={{
            marginTop: 20,
            backgroundColor: "#14161a",
            borderRadius: 999,
            height: 52,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: "LibreBaskerville-Bold", color: "#ffffff", fontSize: 16}}>
            Reload app
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// expo-router route-level error boundary — catches render errors thrown
// anywhere in the route tree and shows them instead of crashing.
export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => Promise<void>;
}) {
  return (
    <JsFatalScreen message={describeError(error)} onReload={() => void retry()} />
  );
}

function FatalCatcher({ children }: { children: ReactNode }) {
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ErrorUtils = (global as any).ErrorUtils;
    if (!ErrorUtils?.setGlobalHandler) return;
    const prev = ErrorUtils.getGlobalHandler?.();
    ErrorUtils.setGlobalHandler((e: unknown, isFatal?: boolean) => {
      try {
        setFatal(describeError(e));
      } catch {
        // If even the setter fails, fall back to the previous handler.
        prev?.(e, isFatal);
      }
      // Deliberately NOT forwarding fatals to the default handler — that
      // is what closes the app. Non-fatals were console noise anyway.
    });
    return () => {
      if (prev) ErrorUtils.setGlobalHandler(prev);
    };
  }, []);

  if (fatal) {
    return (
      <JsFatalScreen
        message={fatal}
        onReload={() => {
          Updates.reloadAsync().catch(() => setFatal(null));
        }}
      />
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  useApplyUpdatesOnLaunch();
  // Libre Baskerville — the same serif the website uses, so the brand
  // reads identically in both places. Android will not synthesise a bold
  // or an oblique for a custom family, so each face is registered under
  // its own name (SERIF / SERIF_BOLD / SERIF_ITALIC). There is no
  // bold-italic face in this family; those few styles use bold.
  const [fontsLoaded] = useFonts({
    LibreBaskerville: require("../assets/fonts/LibreBaskerville-Regular.ttf"),
    "LibreBaskerville-Bold": require("../assets/fonts/LibreBaskerville-Bold.ttf"),
    "LibreBaskerville-Italic": require("../assets/fonts/LibreBaskerville-Italic.ttf"),
  });

  // Hold the tree until the faces are in — otherwise the first frame
  // paints in the system serif and visibly reflows.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: "#f4f1ea" }} />;
  }

  return (
    <SafeAreaProvider>
      <FatalCatcher>
        <AuthProvider>
          <StatusBar style="dark" />
          <Slot />
        </AuthProvider>
      </FatalCatcher>
    </SafeAreaProvider>
  );
}
