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

// ActiveEvent / multi-event planner workspace removed when the web host
// portal was trimmed to mirror mobile. Keep the type alias so callers
// that import it still compile; it just resolves to never on use.
export type ActiveEvent = never;

interface Profile {
  id: string;
  role: AppRole;
  display_name: string | null;
  onboarded_at: string | null;
  // Application status — drives vendor approval gating. For hosts
  // this is 'approved' from signup time; for vendors it's 'pending'
  // until admin reviews.
  application_status: "pending" | "approved" | "rejected" | null;
}

// The user's own vendor profile (when they've applied). Multi-role:
// every authenticated user is a host by default, and additionally has a
// vendor identity iff this row exists. application_status drives the
// approved-vendor checks in the UI.
export interface OwnVendorProfile {
  id: string;
  business_name: string | null;
  category: string | null;
  application_status: VendorApplicationStatus;
  logo_url: string | null;
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
      .select("id, role, display_name, onboarded_at, application_status")
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
    // host_events removed — multi-event planner workspace is no
    // longer in the host portal. ActiveEvent always null.
    setActiveEvent(null);

    // The user's own vendor application (if any). Multi-role: presence of
    // this row means they're either an approved vendor or a pending
    // applicant. Both states grant vendor portal access; only 'approved'
    // makes the listing publicly visible (gated by RLS on the table).
    const { data: vp } = await supabase
      .from("vendor_profiles")
      .select("id, business_name, category, application_status, logo_url")
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

    // planning_collaborators dropped along with the planner workspace
    // — multi-host event planning is no longer in the portal.
    setPlanningMemberships([]);
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

  // Derived flags. A vendor is "approved" when:
  //   1. profile.role === 'vendor' AND profile.application_status ===
  //      'approved' — the admin-approval signal. Source-of-truth for
  //      fresh accounts that don't have a vendor_profiles row yet.
  //   OR
  //   2. ownVendorProfile.application_status === 'approved' — used
  //      to be the primary signal under the old per-listing approval
  //      model. Kept as a fallback for vendors who pre-existed before
  //      profile-level approval was added.
  // Either path is sufficient.
  const isApprovedVendor =
    (profile?.role === "vendor" && profile?.application_status === "approved") ||
    ownVendorProfile?.application_status === "approved";
  const hasVendorAccess =
    isApprovedVendor || vendorMemberships.length > 0;
  // Real host = went through onboarding. Pure vendor signups get a
  // default profile row but onboarded_at stays null until they
  // explicitly finish the host onboarding wizard.
  const hasHostAccess = profile != null && profile.onboarded_at !== null;

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
