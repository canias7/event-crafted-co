// Auth context for vendor-mobile. Mirrors the surface of the web
// app's useAuth hook (apps/web/src/hooks/useAuth.tsx) so screens can
// read `user` / `loading` / `signOut` without caring about platform.
//
// Source of truth = supabase.auth — we subscribe once at the root
// and push state down via context.

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  tryRegisterPushToken,
  tryUnregisterPushToken,
} from "./pushNotifications";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch((err) => {
        // A failed session read (e.g. SecureStore hiccup) must not strand
        // the app on the loading splash — clear loading and let
        // onAuthStateChange settle the real session when it can.
        // eslint-disable-next-line no-console
        console.warn("[auth] getSession failed", err);
      })
      .finally(() => setLoading(false));

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // Register the device's Expo push token any time we land in a
  // signed-in state. The helper is idempotent (upserts on the token
  // PK) and silently no-ops on simulators / denied permissions.
  useEffect(() => {
    if (!session?.user?.id) return;
    tryRegisterPushToken(session.user.id, "vendor");
  }, [session?.user?.id]);

  // Catch admin-deleted accounts. Supabase invalidates refresh tokens
  // on delete but the cached access token stays valid for ~1h. Poll
  // getUser() every 30s so a deleted user is signed out promptly.
  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    const tick = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !data?.user) {
        await supabase.auth.signOut();
      }
    };
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session?.user?.id]);

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    loading,
    signOut: async () => {
      // Remove this device's push token BEFORE clearing the session.
      // Once auth.uid() goes null, RLS on device_push_tokens blocks
      // the delete and the row would persist — meaning push for the
      // just-signed-out account keeps landing on this phone.
      const uid = session?.user?.id;
      if (uid) await tryUnregisterPushToken(uid);
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
