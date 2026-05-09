import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "host" | "vendor" | "admin";
export type EventType = "wedding" | "birthday" | "holiday_dinner" | "other";
export type VendorApplicationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_changes"
  | "submitted";

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

// The user's own vendor profile (when they've applied). Multi-role:
// every authenticated user is a host by default, and additionally has a
// vendor identity iff this row exists. application_status drives the
// approved-vendor checks in the UI.
export interface OwnVendorProfile {
  id: string;
  business_name: string;
  category: string;
  application_status: VendorApplicationStatus;
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
  ownVendorProfile: OwnVendorProfile | null;
  vendorMemberships: VendorMembership[];
  planningMemberships: PlanningMembership[];
  // True when the user has an approved vendor application in their own
  // name. Use this instead of `profile.role === 'vendor'` to gate
  // vendor-only UI — multi-role lets an approved vendor keep `role='host'`.
  isApprovedVendor: boolean;
  // True when the user has any vendor portal access (own pending/approved
  // vendor OR team member of someone else's vendor).
  hasVendorAccess: boolean;
  // True when the user has actually used host features — onboarded as a
  // host, has an active event, or is a planning collaborator. Distinct
  // from "has a profile" since vendor-only signups also get a default
  // profile row but never touch the host side.
  hasHostAccess: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  profile: null,
  activeEvent: null,
  ownVendorProfile: null,
  vendorMemberships: [],
  planningMemberships: [],
  isApprovedVendor: false,
  hasVendorAccess: false,
  hasHostAccess: false,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [ownVendorProfile, setOwnVendorProfile] =
    useState<OwnVendorProfile | null>(null);
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
      setOwnVendorProfile(null);
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

    // The user's own vendor application (if any). Multi-role: presence of
    // this row means they're either an approved vendor or a pending
    // applicant. Both states grant vendor portal access; only 'approved'
    // makes the listing publicly visible (gated by RLS on the table).
    const { data: vp } = await supabase
      .from("vendor_profiles")
      .select("id, business_name, category, application_status")
      .eq("user_id", userId)
      .maybeSingle();
    setOwnVendorProfile((vp as OwnVendorProfile | null) ?? null);

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

  // Catch admin-deleted accounts. Supabase invalidates refresh tokens
  // on delete but the cached access token stays valid for ~1h. Poll
  // getUser() every 30s so a deleted user is signed out within 30s
  // instead of an hour. getUser() hits the auth server (not the cache),
  // so a deleted account returns an error → force signOut.
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

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setActiveEvent(null);
    setOwnVendorProfile(null);
    setVendorMemberships([]);
    setPlanningMemberships([]);
    setSession(null);
  }

  // Derived flags. Multi-role: an "approved vendor" is anyone with their
  // own approved application, OR a legacy profile.role==='vendor' user
  // (set by the old promotion trigger before the multi_role migration).
  const isApprovedVendor =
    ownVendorProfile?.application_status === "approved" ||
    profile?.role === "vendor";
  const hasVendorAccess =
    isApprovedVendor || vendorMemberships.length > 0;
  // Real host = went through onboarding, has an active event, or is a
  // planning collaborator. Pure vendor signups get a default profile row
  // but none of these markers, so they don't appear as hosts.
  const hasHostAccess =
    profile != null &&
    (profile.onboarded_at !== null ||
      profile.active_event_id !== null ||
      planningMemberships.length > 0);

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        activeEvent,
        ownVendorProfile,
        vendorMemberships,
        planningMemberships,
        isApprovedVendor,
        hasVendorAccess,
        hasHostAccess,
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
