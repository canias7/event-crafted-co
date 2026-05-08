// Google OAuth via Supabase, opened inside an in-app auth session
// (expo-web-browser). Flow:
//
//   1. Ask Supabase for a sign-in URL with redirectTo set to our
//      app's deep link (vendora-host://auth-callback or
//      vendora-vendor://auth-callback — whatever Linking gives us).
//   2. Open that URL in a system-managed browser tab. The user signs
//      in to Google, Supabase posts back to /auth/v1/callback,
//      which then redirects to our deep link with tokens in the
//      URL fragment.
//   3. WebBrowser.openAuthSessionAsync resolves with the redirect
//      URL once the user lands back on the deep link. Parse the
//      access + refresh tokens out of the fragment and seed
//      supabase.auth with setSession.
//
// Both Supabase and the Google Cloud OAuth client must already be
// configured (Supabase Authentication → Providers → Google +
// Redirect URLs allowlist with the deep link scheme).

import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

export type GoogleSignInResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "error"; message?: string };

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const redirectTo = Linking.createURL("auth-callback");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data?.url) {
    return {
      ok: false,
      reason: "error",
      message: error?.message ?? "No auth URL",
    };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) {
    return {
      ok: false,
      reason: result.type === "cancel" ? "cancelled" : "error",
    };
  }

  // Supabase puts the session tokens in the URL fragment.
  const fragment = result.url.split("#")[1] ?? "";
  const params = new URLSearchParams(fragment);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) {
    // Some flows (PKCE) put a `code` in the query string instead;
    // fall through to exchangeCodeForSession in that case.
    const query = result.url.split("?")[1]?.split("#")[0] ?? "";
    const qParams = new URLSearchParams(query);
    const code = qParams.get("code");
    if (code) {
      const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exchErr) {
        return { ok: false, reason: "error", message: exchErr.message };
      }
      return { ok: true };
    }
    return {
      ok: false,
      reason: "error",
      message: "Missing tokens in callback URL",
    };
  }

  const { error: setErr } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (setErr) {
    return { ok: false, reason: "error", message: setErr.message };
  }
  return { ok: true };
}
