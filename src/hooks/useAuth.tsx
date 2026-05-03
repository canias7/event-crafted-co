import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "host" | "vendor" | "admin";

interface Profile {
  id: string;
  role: AppRole;
  display_name: string | null;
  onboarded_at: string | null;
  event_type: "wedding" | "birthday" | "holiday_dinner" | "other" | null;
  event_date: string | null;
  event_location: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  event_notes: string | null;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, role, display_name, onboarded_at, event_type, event_date, event_location, budget_min_cents, budget_max_cents, event_notes",
      )
      .eq("id", userId)
      .maybeSingle();
    if (data) setProfile(data as unknown as Profile);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);