import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronRight, FileText, Globe, HelpCircle, Loader2, LogOut, Lock, Mail, Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { customerNavItems, getLastDashboardSide, vendorNavItems } from "@/data/navItems";

// Account settings — rowed-card layout. Each row is icon + title +
// subtitle on the left, value or action pill on the right, divided by
// hairlines. Identity edits live on /vendor/edit-profile; this surface
// is intentionally minimal (email on file + sign out + delete account).
export default function SettingsPage() {
  const { user, profile, isApprovedVendor, signOut } = useAuth();
  const navigate = useNavigate();

  const [deleting, setDeleting] = useState(false);

  // Notification preferences. Backed by profiles.notification_prefs
  // (JSONB column, defaults to all-on per migration 20260504200000).
  // Server-side notify_* triggers already honor every key via the
  // is_notif_enabled() helper, so a flipped toggle silences in-app
  // notifications + push + email immediately.
  type NotifPrefs = {
    new_inquiry: boolean;
    proposal_accepted: boolean;
    review_received: boolean;
    weekly_digest: boolean;
    daily_digest: boolean;
    marketing: boolean;
  };
  const DEFAULT_PREFS: NotifPrefs = {
    new_inquiry: true,
    proposal_accepted: true,
    review_received: true,
    weekly_digest: true,
    daily_digest: true,
    marketing: false,
  };
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("profiles")
        .select("notification_prefs")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const incoming = (data?.notification_prefs ?? {}) as Partial<NotifPrefs>;
      setPrefs({ ...DEFAULT_PREFS, ...incoming });
      setPrefsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function togglePref(key: keyof NotifPrefs, next: boolean) {
    if (!user?.id) return;
    // Optimistic local update so the switch flips instantly.
    const optimistic = { ...prefs, [key]: next };
    setPrefs(optimistic);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ notification_prefs: optimistic })
      .eq("id", user.id);
    if (error) {
      // Roll back the switch + surface the failure. Keep the toast
      // short — vendors flicking switches don't want an essay.
      setPrefs(prefs);
      toast.error("Couldn't update preference");
    }
  }

  const lastSide = getLastDashboardSide();
  const useVendorNav =
    lastSide === "vendor" || (lastSide === null && isApprovedVendor);
  const navItems = useVendorNav ? vendorNavItems : customerNavItems;
  const sidebarTitle = useVendorNav ? "Vendor Portal" : "Customer";

  async function deleteAccount() {
    setDeleting(true);
    const { error } = await supabase.rpc("request_account_deletion");
    if (error) {
      setDeleting(false);
      toast.error(error.message);
      return;
    }
    await supabase.auth.signOut();
    setDeleting(false);
    toast.success("Account closed. Goodbye for now.");
    navigate("/", { replace: true });
  }

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title={sidebarTitle} backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40">
          <h1 className="font-editorial text-3xl">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account</p>
        </div>

        <div className="p-4 md:p-8 max-w-2xl">
          {!profile ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "rgba(255,253,250,0.6)",
                border: "0.5px solid rgba(255,138,76,0.22)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <SettingRow
                Icon={Mail}
                title="Email"
                subtitle="Email on file for this account"
                right={
                  <a
                    href="mailto:hello@vendora.events"
                    className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors truncate"
                    title="Contact hello@vendora.events to change your email"
                  >
                    {user?.email ?? ""}
                  </a>
                }
              />
              <RowDivider />
              <SettingRow
                Icon={Globe}
                title="Language"
                subtitle="Interface language for menus, buttons, and prompts"
                right={<LanguageSwitcher tone="light" />}
              />
              {isApprovedVendor ? (
                <>
                  <RowDivider />
                  <SettingRow
                    Icon={Plug}
                    title="Integrations"
                    subtitle="Connect your Vendora account to Claude (MCP)"
                    right={
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => navigate("/vendor/integrations")}
                      >
                        Manage
                        <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    }
                  />
                </>
              ) : null}
              {/* Notification preferences. Backing keys map to the
                  same JSON keys notify_* triggers check via
                  is_notif_enabled(). Flipping a switch silences
                  all three channels (in-app bell, push, email)
                  for that kind. Marketing default-off (per migration
                  20260504200000); everything else default-on. */}
              <RowDivider />
              <SettingRow
                Icon={Bell}
                title="New inquiry"
                subtitle="Email + push + in-app when a host asks about your listing"
                right={
                  <Switch
                    checked={prefs.new_inquiry}
                    disabled={!prefsLoaded}
                    onCheckedChange={(v) => togglePref("new_inquiry", v)}
                    aria-label="New inquiry notifications"
                  />
                }
              />
              <RowDivider />
              <SettingRow
                Icon={Bell}
                title="Proposal accepted"
                subtitle="When a host accepts a proposal you sent"
                right={
                  <Switch
                    checked={prefs.proposal_accepted}
                    disabled={!prefsLoaded}
                    onCheckedChange={(v) => togglePref("proposal_accepted", v)}
                    aria-label="Proposal accepted notifications"
                  />
                }
              />
              <RowDivider />
              <SettingRow
                Icon={Bell}
                title="New review"
                subtitle="When a host leaves you a rating"
                right={
                  <Switch
                    checked={prefs.review_received}
                    disabled={!prefsLoaded}
                    onCheckedChange={(v) => togglePref("review_received", v)}
                    aria-label="Review notifications"
                  />
                }
              />
              <RowDivider />
              <SettingRow
                Icon={Bell}
                title="Weekly digest"
                subtitle="Monday summary of last week's activity"
                right={
                  <Switch
                    checked={prefs.weekly_digest}
                    disabled={!prefsLoaded}
                    onCheckedChange={(v) => togglePref("weekly_digest", v)}
                    aria-label="Weekly digest"
                  />
                }
              />
              <RowDivider />
              <SettingRow
                Icon={Bell}
                title="Marketing"
                subtitle="Product news, tips, and occasional offers (opt-in)"
                right={
                  <Switch
                    checked={prefs.marketing}
                    disabled={!prefsLoaded}
                    onCheckedChange={(v) => togglePref("marketing", v)}
                    aria-label="Marketing emails"
                  />
                }
              />
              <RowDivider />
              {/* Help / legal — three lightweight rows. Help opens
                  the FAQ + support email; Terms and Privacy link
                  the legal pages the user already accepted on
                  signup so they're a click away if needed. */}
              <SettingRow
                Icon={HelpCircle}
                title="Help & support"
                subtitle="FAQ + email us if you're stuck"
                right={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => navigate("/help")}
                  >
                    Open
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                }
              />
              <RowDivider />
              <SettingRow
                Icon={FileText}
                title="Terms of Service"
                subtitle="What you agreed to when you signed up"
                right={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => navigate("/terms")}
                  >
                    View
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                }
              />
              <RowDivider />
              <SettingRow
                Icon={Lock}
                title="Privacy Policy"
                subtitle="How we handle your data"
                right={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => navigate("/privacy")}
                  >
                    View
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                }
              />
              <RowDivider />
              <SettingRow
                Icon={LogOut}
                title="Sign out"
                subtitle="Sign out of this device"
                right={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={async () => {
                      await signOut();
                      navigate("/");
                    }}
                  >
                    <LogOut className="w-3.5 h-3.5 mr-1.5" />
                    Sign out
                  </Button>
                }
              />
              <RowDivider />
              <SettingRow
                Icon={Trash2}
                tone="destructive"
                title="Delete account"
                subtitle={`Permanently removes your profile and everything tied to it${
                  isApprovedVendor
                    ? " — listings, portfolio, availability"
                    : ""
                }`}
                right={
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-editorial text-3xl">
                          Delete account?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm leading-relaxed">
                          This will delete your profile and all related
                          data. You'll be signed out immediately and
                          won't be able to sign back in with this email.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="gap-2 sm:gap-0">
                        <AlertDialogCancel
                          disabled={deleting}
                          className="rounded-full"
                        >
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.preventDefault();
                            deleteAccount();
                          }}
                          disabled={deleting}
                          className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {deleting && (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          )}
                          Yes, delete it
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                }
              />
            </div>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}

function SettingRow({
  Icon,
  title,
  subtitle,
  right,
  tone,
}: {
  Icon: typeof Mail;
  title: string;
  subtitle: string;
  right: React.ReactNode;
  tone?: "destructive";
}) {
  const destructive = tone === "destructive";
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <span
        className="shrink-0 w-10 h-10 rounded-xl inline-flex items-center justify-center"
        style={{
          background: destructive
            ? "rgba(220,38,38,0.10)"
            : "rgba(255,138,76,0.14)",
          color: destructive ? "#a3160d" : "#c4541e",
        }}
        aria-hidden
      >
        <Icon className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[15px] font-semibold leading-tight ${
            destructive ? "text-destructive" : "text-foreground"
          }`}
        >
          {title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug truncate">
          {subtitle}
        </p>
      </div>
      <div className="shrink-0 max-w-[55%] flex items-center justify-end overflow-hidden">
        {right}
      </div>
    </div>
  );
}

function RowDivider() {
  return (
    <div
      aria-hidden
      style={{
        height: "0.5px",
        background: "rgba(0,0,0,0.06)",
        marginLeft: "1.25rem",
        marginRight: "1.25rem",
      }}
    />
  );
}
