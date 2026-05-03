import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "host" | "vendor" | "admin";
export type EventType = "wedding" | "birthday" | "holiday_dinner" | "other";

export interface ActiveEvent {
  id: string;
  name: string | null;
  event_type: EventType;
  event_date: string | null;
  event_location: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  event_notes: string | null;
  archived_at: string | null;
}

interface Profile {
  id: string;
  role: AppRole;
  display_name: string | null;
  onboarded_at: string | null;
  active_event_id: string | null;
  // Legacy event_* fields kept for backward compat with code paths still
  // reading them; the new source of truth is `activeEvent` below.
  event_type: EventType | null;
  event_date: string | null;
  event_location: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  event_notes: string | null;
}

export interface VendorMembership {
  vendor_id: string;
  role: "owner" | "admin" | "member";
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  activeEvent: ActiveEvent | null;
  vendorMemberships: VendorMembership[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  profile: null,
  activeEvent: null,
  vendorMemberships: [],
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [vendorMemberships, setVendorMemberships] = useState<VendorMembership[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, role, display_name, onboarded_at, active_event_id, event_type, event_date, event_location, budget_min_cents, budget_max_cents, event_notes",
      )
      .eq("id", userId)
      .maybeSingle();
    if (!data) {
      setProfile(null);
      setActiveEvent(null);
      setVendorMemberships([]);
      return;
    }
    const p = data as unknown as Profile;
    setProfile(p);

    if (p.active_event_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ev } = await (supabase as any)
        .from("host_events")
        .select(
          "id, name, event_type, event_date, event_location, budget_min_cents, budget_max_cents, event_notes, archived_at",
        )
        .eq("id", p.active_event_id)
        .maybeSingle();
      setActiveEvent((ev as ActiveEvent | null) ?? null);
    } else {
      setActiveEvent(null);
    }

    // Vendor team memberships — drives vendor portal access for non-owner
    // staff. Empty for hosts, populated for vendor owners (auto-backfilled
    // by trigger) and invited team members.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: memberRows } = await (supabase as any)
      .from("vendor_team_members")
      .select("vendor_id, role")
      .eq("user_id", userId);
    setVendorMemberships(
      (memberRows as VendorMembership[] | null) ?? [],
    );
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setActiveEvent(null);
        setVendorMemberships([]);
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
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setActiveEvent(null);
    setVendorMemberships([]);
    setSession(null);
  }

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        activeEvent,
        vendorMemberships,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
