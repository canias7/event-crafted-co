// Host profile hub — mirrors apps/host-mobile/app/(host)/profile.tsx.
//
// Hero card (avatar / name / member-since / stats), verification
// upsell card with 4 states (none, pending, approved, rejected),
// shortcut to Account settings, and Sign out. Verification writes
// into public.host_verification_requests; admins follow up via
// support to collect ID.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Inbox,
  LogOut,
  Settings as SettingsIcon,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Skeleton } from "@/components/ui/skeleton";
import { customerNavItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type VerifStatus = "none" | "pending" | "approved" | "rejected";

interface Stats {
  inquiries: number;
  booked: number;
  vendors: number;
  events: number;
}

interface ProfileState {
  name: string;
  email: string;
  memberSince: string;
  unread: number;
  stats: Stats;
  verifStatus: VerifStatus;
}

function initialOf(name: string): string {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

export default function HostProfilePage() {
  const { user, signOut } = useAuth();
  const [state, setState] = useState<ProfileState | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const [
      { data: profile },
      { data: inquiries },
      { count: unread },
      authUser,
      { data: verifRow },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("inquiries")
        .select("status, vendor_id, event_type, event_date")
        .eq("host_id", user.id),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null),
      supabase.auth.getUser(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("host_verification_requests")
        .select("status")
        .eq("user_id", user.id)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const rows = (inquiries ?? []) as Array<{
      status: string;
      vendor_id: string;
      event_type: string | null;
      event_date: string | null;
    }>;
    const vendors = new Set(rows.map((r) => r.vendor_id));
    const events = new Set(
      rows
        .map((r) =>
          r.event_type || r.event_date
            ? `${r.event_type ?? ""}|${r.event_date ?? ""}`
            : null,
        )
        .filter(Boolean) as string[],
    );

    const createdAt = authUser?.data?.user?.created_at;
    const year = createdAt
      ? new Date(createdAt).getFullYear()
      : new Date().getFullYear();
    const fallback =
      (profile as { display_name?: string } | null)?.display_name ??
      user.email?.split("@")[0] ??
      "Host";
    const titleCase = fallback
      .split(/[ _-]+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");

    const rawStatus = (verifRow as { status?: string } | null)?.status;
    const status: VerifStatus =
      rawStatus === "approved" ||
      rawStatus === "pending" ||
      rawStatus === "rejected"
        ? rawStatus
        : "none";

    setState({
      name: titleCase,
      email: user.email ?? "",
      memberSince: String(year),
      unread: unread ?? 0,
      stats: {
        inquiries: rows.length,
        booked: rows.filter((r) => r.status === "won").length,
        vendors: vendors.size,
        events: events.size,
      },
      verifStatus: status,
    });
    setLoading(false);
  }, [user?.id, user?.email]);

  useEffect(() => {
    load();
  }, [load]);

  async function requestVerification() {
    if (!user?.id) return;
    const ok = window.confirm(
      "Request host verification?\n\nWe'll reach out within 48 hours to verify your identity (a photo of a government ID is enough). It typically unlocks faster vendor replies.",
    );
    if (!ok) return;
    setRequesting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("host_verification_requests")
      .insert({ user_id: user.id, status: "pending" });
    setRequesting(false);
    if (error) {
      toast.error("Couldn't send request — try again in a moment.");
      return;
    }
    toast.success("Request received — our team will reach out within 48 hours.");
    load();
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar
        items={customerNavItems}
        title="Profile"
        backPath="/customer/dashboard"
      />
      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border/40 bg-card/60 backdrop-blur px-4 md:px-8 py-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-editorial text-3xl">Profile</h1>
            <p className="text-sm text-muted-foreground">
              Your account at a glance.
            </p>
          </div>
          <NotificationBell variant="light" />
        </div>

        <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
          {loading || !state ? (
            <>
              <Skeleton className="h-64 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </>
          ) : (
            <>
              <HeroCard
                initial={initialOf(state.name)}
                name={state.name}
                memberSince={state.memberSince}
                verified={state.verifStatus === "approved"}
                stats={state.stats}
              />

              <div className="grid grid-cols-2 gap-3">
                <ShortcutTile
                  to="/customer/inquiries"
                  icon={Inbox}
                  title="Inbox"
                  subtitle={
                    state.unread
                      ? `${state.unread} unread`
                      : "All caught up"
                  }
                  badge={state.unread ? String(state.unread) : null}
                />
                <ShortcutTile
                  to="/customer/events"
                  icon={Calendar}
                  title="My Events"
                  subtitle={
                    state.stats.events
                      ? `${state.stats.events} planned`
                      : "Plan your first"
                  }
                  badge={null}
                />
              </div>

              <VerificationCard
                status={state.verifStatus}
                requesting={requesting}
                onRequest={requestVerification}
              />

              <ActionCard
                to="/settings"
                icon={SettingsIcon}
                iconBg="bg-secondary"
                iconColor="text-foreground"
                title="Account settings"
                subtitle={state.email}
              />

              <button
                onClick={() => signOut()}
                className="w-full mt-2 py-4 rounded-2xl text-sm text-muted-foreground hover:bg-secondary/40 transition flex items-center justify-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </>
          )}
        </div>
      </main>
      <MobileNav items={customerNavItems} />
    </div>
  );
}

function HeroCard({
  initial,
  name,
  memberSince,
  stats,
  verified,
}: {
  initial: string;
  name: string;
  memberSince: string;
  stats: Stats;
  verified: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 shadow-[0_8px_24px_-12px_rgba(26,20,16,0.18)] p-8 flex flex-col items-center bg-[linear-gradient(135deg,#fffbf2_0%,#faecd0_100%)]">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(circle at 18% 22%, rgba(255,230,180,0.55), transparent 55%)",
        }}
      />
      <div className="relative">
        <div className="w-28 h-28 rounded-full bg-foreground text-background flex items-center justify-center">
          <span className="font-editorial text-5xl">{initial}</span>
        </div>
        {verified ? (
          <div className="absolute -right-1 bottom-1 w-8 h-8 rounded-full bg-card border-2 border-background flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
        ) : null}
      </div>
      <h2 className="relative mt-3 font-editorial text-2xl text-foreground text-center">
        {name}
      </h2>
      <p className="relative mt-1 text-sm text-muted-foreground">
        {verified ? "Verified Host  ·  " : ""}Member since {memberSince}
      </p>
      <div className="relative my-5 h-px w-full bg-border/60" />
      <div className="relative flex w-full items-center">
        <StatCol label="Inquiries" value={String(stats.inquiries)} />
        <div className="h-10 w-px bg-border/60" />
        <StatCol label="Booked" value={String(stats.booked)} />
        <div className="h-10 w-px bg-border/60" />
        <StatCol
          label="Vendors"
          value={String(stats.vendors)}
          trailing={<Star className="h-4 w-4 text-amber-500" />}
        />
      </div>
    </div>
  );
}

function StatCol({
  label,
  value,
  trailing,
}: {
  label: string;
  value: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col items-center">
      <div className="flex items-center gap-1">
        <span className="text-2xl font-semibold tnum">{value}</span>
        {trailing}
      </div>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function ShortcutTile({
  to,
  icon: Icon,
  title,
  subtitle,
  badge,
}: {
  to: string;
  icon: typeof Inbox;
  title: string;
  subtitle: string;
  badge: string | null;
}) {
  return (
    <Link
      to={to}
      className="block rounded-3xl bg-card border border-border/60 shadow-[0_8px_24px_-16px_rgba(26,20,16,0.16)] p-4 hover:bg-secondary/40 transition"
    >
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
          <Icon className="h-5 w-5 text-foreground" />
        </div>
        {badge ? (
          <span className="rounded-full bg-foreground text-background text-xs font-bold px-2.5 py-1">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-editorial text-lg">{title}</p>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </Link>
  );
}

function VerificationCard({
  status,
  requesting,
  onRequest,
}: {
  status: VerifStatus;
  requesting: boolean;
  onRequest: () => void;
}) {
  if (status === "approved") {
    return (
      <ActionCard
        onClick={() =>
          toast.success(
            "Verified host — vendors see a badge on your inquiries.",
          )
        }
        icon={CheckCircle2}
        iconBg="bg-emerald-500"
        iconColor="text-white"
        title="You're verified"
        subtitle="Vendors prioritize verified hosts."
      />
    );
  }
  if (status === "pending") {
    return (
      <ActionCard
        onClick={() =>
          toast.message("Verification pending — we'll email you within 48h.")
        }
        icon={Clock}
        iconBg="bg-amber-500"
        iconColor="text-white"
        title="Verification pending"
        subtitle="We'll reach out within 48 hours."
      />
    );
  }
  return (
    <ActionCard
      onClick={requesting ? undefined : onRequest}
      icon={Award}
      iconBg="bg-foreground"
      iconColor="text-background"
      title={status === "rejected" ? "Try verifying again" : "Become Verified"}
      subtitle="Build trust with vendors. Faster replies, better matches."
    />
  );
}

function ActionCard({
  to,
  onClick,
  icon: Icon,
  iconBg,
  iconColor,
  title,
  subtitle,
}: {
  to?: string;
  onClick?: () => void;
  icon: typeof SettingsIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
}) {
  const inner = (
    <div className="rounded-3xl bg-card border border-border/60 shadow-[0_8px_24px_-16px_rgba(26,20,16,0.16)] p-4 flex items-center gap-3 hover:bg-secondary/40 transition">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}
      >
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        {subtitle ? (
          <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
        ) : null}
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </div>
  );
  if (to) {
    return <Link to={to}>{inner}</Link>;
  }
  return (
    <button onClick={onClick} className="w-full text-left" disabled={!onClick}>
      {inner}
    </button>
  );
}
