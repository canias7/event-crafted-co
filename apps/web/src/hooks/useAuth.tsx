import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "host" | "vendor";
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

export interface PlanningMembership {
  host_id: string;
  role: "owner" | "editor" | "viewer";
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  activeEvent: ActiveEvent | null;
  vendorMemberships: VendorMembership[];
  planningMemberships: PlanningMembership[];
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
  planningMemberships: [],
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
  const [planningMemberships, setPlanningMemberships] = useState<
    PlanningMembership[]
  >([]);
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
      const { data: ev } = await supabase
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
    const { data: memberRows } = await supabase
      .from("vendor_team_members")
      .select("vendor_id, role")
      .eq("user_id", userId);
    setVendorMemberships(
      (memberRows as VendorMembership[] | null) ?? [],
    );

    // Planning collaborator memberships — when this user is a partner /
    // MOH / planner on someone else's event workspace. The user is also
    // implicitly an "owner" of their own host_id, but we don't insert a
    // row for that — the helper functions (is_planning_collaborator,
    // is_planning_editor) treat _host_id = auth.uid() as automatic owner.
    const { data: planningRows } = await supabase
      .from("planning_collaborators")
      .select("host_id, role")
      .eq("user_id", userId);
    setPlanningMemberships(
      (planningRows as PlanningMembership[] | null) ?? [],
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
        setPlanningMemberships([]);
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
    setPlanningMemberships([]);
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
        planningMemberships,
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
