// Host profile hub — mirrors apps/host-mobile/app/(host)/profile.tsx.
//
// Hero card (avatar / name / member-since / stats), verification
// upsell card with 4 states (none, pending, approved, rejected),
// shortcut to Account settings, and Sign out. Verification writes
// into public.host_verification_requests; admins follow up via
// support to collect ID.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
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
  ratings: number;
}

interface ProfileState {
  name: string;
  email: string;
  memberSince: string;
  unread: number;
  avatarUrl: string | null;
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
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const [
      { data: profile },
      { count: unread },
      { count: ratings },
      authUser,
      { data: verifRow },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null),
      supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("host_id", user.id),
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

    const createdAt = authUser?.data?.user?.created_at;
    const year = createdAt
      ? new Date(createdAt).getFullYear()
      : new Date().getFullYear();
    const fallback =
      profile?.display_name ?? user.email?.split("@")[0] ?? "Host";
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

    const profileRow = profile as
      | { display_name?: string | null; avatar_url?: string | null }
      | null;

    setState({
      name: titleCase,
      email: user.email ?? "",
      memberSince: String(year),
      unread: unread ?? 0,
      avatarUrl: profileRow?.avatar_url ?? null,
      stats: {
        ratings: ratings ?? 0,
      },
      verifStatus: status,
    });
    setLoading(false);
  }, [user?.id, user?.email]);

  async function onPickAvatar(file: File) {
    if (!user?.id || avatarUploading) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Photo too large — pick a photo under 10 MB.");
      return;
    }
    setAvatarUploading(true);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const path = `${user.id}/profile-avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("vendor-posts")
        .upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("vendor-posts")
        .getPublicUrl(path);
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: pub.publicUrl })
        .eq("id", user.id);
      if (updErr) throw updErr;
      setState((prev) =>
        prev ? { ...prev, avatarUrl: pub.publicUrl } : prev,
      );
      toast.success("Photo updated.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Please try again.";
      toast.error(`Couldn't update photo: ${msg}`);
    } finally {
      setAvatarUploading(false);
    }
  }

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
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar
        items={customerNavItems}
        title="Profile"
        backPath="/customer/explore"
      />
      <main className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40 flex items-start justify-between gap-3">
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
                avatarUrl={state.avatarUrl}
                uploading={avatarUploading}
                onPickFile={(file) => onPickAvatar(file)}
                fileInputRef={fileInputRef}
              />

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
  avatarUrl,
  uploading,
  onPickFile,
  fileInputRef,
}: {
  initial: string;
  name: string;
  memberSince: string;
  stats: Stats;
  verified: boolean;
  avatarUrl: string | null;
  uploading: boolean;
  onPickFile: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 shadow-[0_8px_24px_-12px_rgba(26,20,16,0.18)] p-8 flex flex-col items-center bg-[linear-gradient(135deg,#ffffff_0%,#f3f4f6_100%)]">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(circle at 18% 22%, rgba(255,230,180,0.55), transparent 55%)",
        }}
      />
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="Change profile photo"
          className="group relative w-28 h-28 rounded-full overflow-hidden bg-foreground text-background flex items-center justify-center transition disabled:opacity-70"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="font-editorial text-5xl">{initial}</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            {uploading ? (
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            ) : (
              <Camera className="h-6 w-6 text-white" />
            )}
          </span>
        </button>
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
      <div className="relative flex w-full items-center justify-center">
        <StatCol
          label="Ratings"
          value={String(stats.ratings)}
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
