// Auth context for vendor-mobile. Mirrors the surface of the web
// app's useAuth hook (apps/web/src/hooks/useAuth.tsx) so screens can
// read `user` / `loading` / `signOut` without caring about platform.
//
// Source of truth = supabase.auth — we subscribe once at the root
// and push state down via context.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
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
  // When the user closed their account: the date it's permanently
  // deleted. Null = active. While set, AccountDeletionGate replaces the
  // app with a restore / sign-out screen (migration
  // 20261013140000_account_deletion_grace.sql).
  deletionScheduledFor: string | null;
  refreshDeletion: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletionScheduledFor, setDeletionScheduledFor] = useState<string | null>(null);

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

  // Closed account in its 30-day grace period? Read on its own so a
  // database without the column yet still signs in normally.
  const userId = session?.user?.id ?? null;
  const refreshDeletion = useCallback(async () => {
    if (!userId) {
      setDeletionScheduledFor(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("deletion_scheduled_for")
      .eq("id", userId)
      .maybeSingle();
    setDeletionScheduledFor(
      (data as { deletion_scheduled_for?: string | null } | null)
        ?.deletion_scheduled_for ?? null,
    );
  }, [userId]);
  useEffect(() => {
    void refreshDeletion();
  }, [refreshDeletion]);

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
    deletionScheduledFor,
    refreshDeletion,
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
