// Root layout. Wraps every screen in the AuthProvider so any descendant
// can `useAuth()`. NativeWind's global stylesheet is loaded once here.
import "../global.css";

import { useEffect } from "react";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
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

export default function RootLayout() {
  useApplyUpdatesOnLaunch();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Slot />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
