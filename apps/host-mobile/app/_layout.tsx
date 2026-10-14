import "../global.css";

import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { AuthProvider } from "@/lib/auth";
import { useLanguageReady } from "@/lib/i18n";
import { AccountDeletionGate } from "@/components/AccountDeletionGate";
import { C } from "@/lib/theme";

export default function RootLayout() {
  // Libre Baskerville — the same serif the website and the vendor app
  // use, so the brand reads identically everywhere. Android will not
  // synthesise a bold or an oblique for a custom family, so each face is
  // registered under its own name (SERIF / SERIF_BOLD / SERIF_ITALIC)
  // and no style may pair a custom fontFamily with a fontWeight.
  const [fontsLoaded, fontError] = useFonts({
    LibreBaskerville: require("../assets/fonts/LibreBaskerville-Regular.ttf"),
    "LibreBaskerville-Bold": require("../assets/fonts/LibreBaskerville-Bold.ttf"),
    "LibreBaskerville-Italic": require("../assets/fonts/LibreBaskerville-Italic.ttf"),
  });

  // The saved language (English, Spanish or Russian) is read first so
  // the first frame is already in it.
  const languageReady = useLanguageReady();

  // Hold the tree until the faces are in — otherwise the first frame
  // paints in the system serif and visibly reflows.
  //
  // But render anyway on error. These files reach already-installed
  // builds over the air, and a binary that has never carried a font
  // asset is the one case this can't be proven safe from a desk. If the
  // download fails, falling back to the system serif is a bad-looking
  // app; blocking on `!fontsLoaded` forever is a blank one.
  if ((!fontsLoaded && !fontError) || !languageReady) {
    return <View style={{ flex: 1, backgroundColor: C.page }} />;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style={C.statusBar} />
        {/* A closed account in its 30-day grace period sees only the
            restore / sign-out screen. */}
        <AccountDeletionGate>
          <Slot />
        </AccountDeletionGate>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
