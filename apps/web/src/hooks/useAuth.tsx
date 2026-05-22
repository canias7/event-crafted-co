import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setUser as setSentryUser } from "@/lib/sentry";

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
  // Vendor account identity — these are the source of truth for the
  // business-facing brand. They're populated at signup for vendors
  // (handle_new_user seeds business_name from raw_user_meta_data) and
  // rewritten via /vendor/me Edit identity. Hosts leave them null.
  business_name: string | null;
  logo_url: string | null;
  onboarded_at: string | null;
  // Application status — drives vendor approval gating. For hosts
  // this is 'approved' from signup time; for vendors it's 'pending'
  // until admin reviews.
  application_status: "pending" | "approved" | "rejected" | null;
}

// The user's own listing (when they've created one). Multi-role:
// every authenticated user is a host by default, and additionally has a
// vendor identity iff this row exists in vendor_profiles (the table is
// historically named "vendor_profiles" but each row is a LISTING — up to
// 5 per vendor account). application_status drives the approved-vendor
// checks in the UI.
export interface OwnListing {
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
  ownListing: OwnListing | null;
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
  ownListing: null,
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
  const [ownListing, setOwnListing] =
    useState<OwnListing | null>(null);
  const [vendorMemberships, setVendorMemberships] = useState<VendorMembership[]>(
    [],
  );
  const [planningMemberships, setPlanningMemberships] = useState<
    PlanningMembership[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Tracks the latest in-flight loadProfile invocation. Each call
  // captures a generation number and bails out (without setState)
  // if a newer load has started since — prevents stale results from
  // a previous user/session from clobbering the current one during
  // rapid sign-out → sign-in or token-refresh races.
  const loadGenRef = useRef(0);

  const loadProfile = useCallback(async (userId: string) => {
    const myGen = ++loadGenRef.current;
    const isStale = () => loadGenRef.current !== myGen;

    const { data } = await supabase
      .from("profiles")
      .select(
        "id, role, display_name, business_name, logo_url, onboarded_at, application_status",
      )
      .eq("id", userId)
      .maybeSingle();
    if (isStale()) return;
    if (!data) {
      setProfile(null);
      setActiveEvent(null);
      setOwnListing(null);
      setVendorMemberships([]);
      return;
    }
    const p = data as unknown as Profile;
    setProfile(p);
    // host_events removed — multi-event planner workspace is no
    // longer in the host portal. ActiveEvent always null.
    setActiveEvent(null);

    // The user's own listing (if any). Multi-role: presence of this row
    // means they're either an approved vendor or a pending applicant.
    // Both states grant vendor portal access; only 'approved' makes the
    // listing publicly visible (gated by RLS on the table).
    //
    // Multi-listing accounts: prefer an APPROVED listing first (the
    // canonical public brand representative), and only fall back to
    // the oldest pending / rejected row if there isn't one yet. Keeps
    // ownListing.id pointing at a publicly reachable row whenever
    // possible, so anywhere downstream that resolves the id to a
    // public URL doesn't 404.
    //
    // business_name / logo_url sync from profiles via trigger, so
    // either result renders the same brand on the nav avatar; the
    // approved preference only matters for id-based consumers.
    //
    // (Plain .maybeSingle() throws "matched many" for accounts with
    // 2+ listings and returns null — which used to silently hide the
    // "Message vendor" button for every multi-listing vendor.)
    let { data: vp } = await supabase
      .from("vendor_profiles")
      .select("id, business_name, category, application_status, logo_url")
      .eq("user_id", userId)
      .eq("application_status", "approved")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!vp) {
      ({ data: vp } = await supabase
        .from("vendor_profiles")
        .select("id, business_name, category, application_status, logo_url")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle());
    }
    if (isStale()) return;
    setOwnListing((vp as OwnListing | null) ?? null);

    // Vendor team memberships — drives vendor portal access for non-owner
    // staff. Empty for hosts, populated for vendor owners (auto-backfilled
    // by trigger) and invited team members.
    const { data: memberRows } = await supabase
      .from("vendor_team_members")
      .select("vendor_id, role")
      .eq("user_id", userId);
    if (isStale()) return;
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
        setSentryUser({ id: s.user.id, email: s.user.email ?? null });
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setSentryUser(null);
        // Bumping the generation invalidates any in-flight loadProfile
        // — otherwise a slow profile fetch from the previous session
        // could resolve and rewrite the just-cleared state.
        loadGenRef.current++;
        setProfile(null);
        setActiveEvent(null);
        setOwnListing(null);
        setVendorMemberships([]);
        setPlanningMemberships([]);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        setSentryUser({
          id: data.session.user.id,
          email: data.session.user.email ?? null,
        });
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
  // instead of an hour. getUser() hits the auth server (not the cache).
  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    const tick = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      // getUser() also fails on a transient network blip — offline for
      // a moment, a closed connection, a 5xx. That must NOT be mistaken
      // for a deleted account, or every wifi hiccup logs the user out.
      // AuthRetryableFetchError flags exactly those retryable cases;
      // skip them and let the next 30s tick retry. Only a genuine auth
      // rejection (the account/token is actually gone) signs out.
      if (error) {
        if (error.name !== "AuthRetryableFetchError") {
          await supabase.auth.signOut();
        }
      } else if (!data?.user) {
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
    loadGenRef.current++;
    setProfile(null);
    setActiveEvent(null);
    setOwnListing(null);
    setVendorMemberships([]);
    setPlanningMemberships([]);
    setSession(null);
  }

  // Derived flags. A vendor is "approved" when:
  //   1. profile.role === 'vendor' AND profile.application_status ===
  //      'approved' — the admin-approval signal. Source-of-truth for
  //      fresh accounts that don't have a vendor_profiles row yet.
  //   OR
  //   2. ownListing.application_status === 'approved' — used
  //      to be the primary signal under the old per-listing approval
  //      model. Kept as a fallback for vendors who pre-existed before
  //      profile-level approval was added.
  // Either path is sufficient.
  const isApprovedVendor =
    (profile?.role === "vendor" && profile?.application_status === "approved") ||
    ownListing?.application_status === "approved";
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
        ownListing,
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
