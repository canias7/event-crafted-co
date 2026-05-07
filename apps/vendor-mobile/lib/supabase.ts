// Supabase client for the vendor mobile app. Sessions persist in
// expo-secure-store (Keychain on iOS, EncryptedSharedPreferences on
// Android) so the user stays logged in across app restarts without
// the access token sitting in plain AsyncStorage.
//
// Env vars: any var prefixed `EXPO_PUBLIC_` is shipped to the JS
// bundle, so the URL + anon key go in `.env.local`:
//   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable-key>

import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Fail loud at startup rather than silently no-op every query.
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Add them to apps/vendor-mobile/.env.local.",
  );
}

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // RN doesn't have a URL bar, so OAuth redirect detection is a no-op.
    detectSessionInUrl: false,
  },
});
