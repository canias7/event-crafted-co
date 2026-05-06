import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle, KeyRound, User, Cookie, Download, Bell, Sun, Moon, Monitor } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTheme, type ThemePreference } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PushNotificationsCard } from "@/components/settings/PushNotificationsCard";
import { NotificationPreferencesCard } from "@/components/settings/NotificationPreferencesCard";
import { TwoFactorCard } from "@/components/settings/TwoFactorCard";
import { customerNavItems, vendorNavItems } from "@/data/navItems";

const COOKIE_KEY = "vendora.cookie-consent";

export default function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [digestEnabled, setDigestEnabled] = useState<boolean | null>(null);
  const [savingDigest, setSavingDigest] = useState(false);
  const [reengagementEnabled, setReengagementEnabled] = useState<boolean | null>(null);
  const [savingReengagement, setSavingReengagement] = useState(false);

  const { preference: themePref, setPreference: setThemePref } = useTheme();

  useEffect(() => {
    if (profile) setDisplayName(profile.display_name ?? "");
  }, [profile]);

  // Load the digest + re-engagement preferences. profile from useAuth
  // doesn't include these columns, so query directly.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("daily_digest_enabled, reengagement_emails_enabled")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }: { data: { daily_digest_enabled: boolean; reengagement_emails_enabled: boolean } | null }) => {
        if (cancelled) return;
        setDigestEnabled(data?.daily_digest_enabled ?? true);
        setReengagementEnabled(data?.reengagement_emails_enabled ?? true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function toggleReengagement(next: boolean) {
    if (!user) return;
    setSavingReengagement(true);
    setReengagementEnabled(next);
    const { error } = await supabase
      .from("profiles")
      .update({ reengagement_emails_enabled: next })
      .eq("id", user.id);
    setSavingReengagement(false);
    if (error) {
      setReengagementEnabled(!next);
      toast.error(error.message);
    }
  }

  async function toggleDigest(next: boolean) {
    if (!user) return;
    setSavingDigest(true);
    setDigestEnabled(next);
    const { error } = await supabase
      .from("profiles")
      .update({ daily_digest_enabled: next })
      .eq("id", user.id);
    setSavingDigest(false);
    if (error) {
      setDigestEnabled(!next);
      toast.error(error.message);
      return;
    }
    toast.success(next ? "Daily digest enabled" : "Daily digest disabled");
  }

  const navItems =
    profile?.role === "vendor" ? vendorNavItems : customerNavItems;
  const sidebarTitle =
    profile?.role === "vendor" ? "Vendor Portal" : "Customer";

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile saved");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password changed");
    setNewPassword("");
    setConfirmPassword("");
  }

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

  async function exportData() {
    if (!user || !profile) return;
    setExporting(true);
    // Pull every user-owned table via RLS-protected reads; assemble into one
    // JSON document and trigger a download.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const tables: Array<{ key: string; query: () => Promise<{ data: unknown }> }> = [
      { key: "profile", query: () => sb.from("profiles").select("*").eq("id", user.id).maybeSingle() },
      { key: "vendor_profile", query: () => sb.from("vendor_profiles").select("*").eq("user_id", user.id).maybeSingle() },
      { key: "inquiries_as_host", query: () => sb.from("inquiries").select("*").eq("host_id", user.id) },
      { key: "messages_authored", query: () => sb.from("messages").select("*").eq("sender_id", user.id) },
      { key: "reviews_authored", query: () => sb.from("reviews").select("*").eq("host_id", user.id) },
      { key: "saved_vendors", query: () => sb.from("saved_vendors").select("*").eq("host_id", user.id) },
      { key: "checklist_items", query: () => sb.from("checklist_items").select("*").eq("host_id", user.id) },
      { key: "budget_items", query: () => sb.from("budget_items").select("*").eq("host_id", user.id) },
      { key: "event_tasks", query: () => sb.from("event_tasks").select("*").eq("host_id", user.id) },
      { key: "notifications", query: () => sb.from("notifications").select("*").eq("user_id", user.id) },
      { key: "host_inquiry_templates", query: () => sb.from("host_inquiry_templates").select("*").eq("host_id", user.id) },
      { key: "content_reports_filed", query: () => sb.from("content_reports").select("*").eq("reporter_id", user.id) },
      { key: "direct_threads", query: () => sb.from("direct_threads").select("*").eq("host_id", user.id) },
      { key: "saved_searches", query: () => sb.from("saved_searches").select("*").eq("host_id", user.id) },
      { key: "host_events", query: () => sb.from("host_events").select("*").eq("host_id", user.id) },
    ];

    const result: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      user: { id: user.id, email: user.email },
    };
    for (const t of tables) {
      try {
        const { data } = await t.query();
        result[t.key] = data ?? null;
      } catch {
        result[t.key] = null;
      }
    }

    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendora-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExporting(false);
    toast.success("Data exported");
  }

  function resetCookies() {
    localStorage.removeItem(COOKIE_KEY);
    toast.success("Cookie banner will reappear on next page load");
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title={sidebarTitle} backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-display text-xl">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account and preferences
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-2xl space-y-10">
          {!profile ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              {/* Profile */}
              <Section
                icon={User}
                title="Profile"
                subtitle="How you appear across Vendora"
              >
                <form onSubmit={saveProfile} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="display-name">Display name</Label>
                    <Input
                      id="display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      value={user?.email ?? ""}
                      disabled
                      className="h-11 bg-secondary/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Contact{" "}
                      <a
                        href="mailto:hello@vendora.events"
                        className="text-accent"
                      >
                        hello@vendora.events
                      </a>{" "}
                      to change your email.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={savingProfile}
                      className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                    >
                      {savingProfile && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Save
                    </Button>
                  </div>
                </form>
              </Section>

              {/* Password */}
              <Section
                icon={KeyRound}
                title="Password"
                subtitle="Change the password you use to sign in"
              >
                <form onSubmit={changePassword} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={8}
                        placeholder="At least 8 characters"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        minLength={8}
                        className="h-11"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={
                        savingPassword || !newPassword || !confirmPassword
                      }
                      className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                    >
                      {savingPassword && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Change password
                    </Button>
                  </div>
                </form>
              </Section>

              {/* 2FA */}
              <Section
                icon={KeyRound}
                title="Two-factor"
                subtitle="A second sign-in factor via your authenticator app"
              >
                <TwoFactorCard />
              </Section>

              {/* Data export */}
              <Section
                icon={Download}
                title="Your data"
                subtitle="Download everything Vendora has on your account"
              >
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  Exports your profile, inquiries, messages, reviews, saved
                  vendors, checklist, budget, tasks, and notifications as a
                  single JSON file. Honors your GDPR / CCPA right to data
                  portability.
                </p>
                <Button
                  onClick={exportData}
                  disabled={exporting}
                  variant="outline"
                  className="rounded-full"
                >
                  {exporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Building…
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Export my data
                    </>
                  )}
                </Button>
              </Section>

              {/* Appearance */}
              <Section
                icon={Sun}
                title="Appearance"
                subtitle="Light, dark, or follow your system"
              >
                <div
                  role="radiogroup"
                  aria-label="Theme preference"
                  className="grid grid-cols-3 gap-2 max-w-md"
                >
                  {(
                    [
                      { value: "light", label: "Light", Icon: Sun },
                      { value: "dark", label: "Dark", Icon: Moon },
                      { value: "system", label: "System", Icon: Monitor },
                    ] as Array<{
                      value: ThemePreference;
                      label: string;
                      Icon: typeof Sun;
                    }>
                  ).map((opt) => {
                    const active = themePref === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setThemePref(opt.value)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-sm border transition-colors ${
                          active
                            ? "border-foreground bg-secondary text-foreground"
                            : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30"
                        }`}
                      >
                        <opt.Icon className="w-4 h-4" />
                        <span className="text-xs font-medium">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Push notifications */}
              <Section
                icon={Bell}
                title="Notifications"
                subtitle="Get pinged in real time on this device"
              >
                <div className="space-y-6">
                  <PushNotificationsCard />
                  <div className="pt-4 border-t border-border">
                    <NotificationPreferencesCard />
                  </div>
                  <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium mb-1">
                        Daily digest email
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        One morning email with everything new since
                        yesterday. Turn off to only receive per-event
                        emails (new inquiries, team invites, review prompts).
                      </p>
                    </div>
                    <Switch
                      checked={digestEnabled ?? true}
                      onCheckedChange={toggleDigest}
                      disabled={savingDigest || digestEnabled === null}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium mb-1">
                        Re-engagement nudges
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        For vendors: get an email + in-app ping when a
                        past client's anniversary or milestone date is
                        approaching, so you can reach out about a
                        follow-on event.
                      </p>
                    </div>
                    <Switch
                      checked={reengagementEnabled ?? true}
                      onCheckedChange={toggleReengagement}
                      disabled={savingReengagement || reengagementEnabled === null}
                    />
                  </div>
                </div>
              </Section>

              {/* Cookies */}
              <Section
                icon={Cookie}
                title="Cookies"
                subtitle="Re-show the consent banner"
              >
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  We remember your cookie choice in your browser's local
                  storage. Reset it to see the banner again on the next page
                  load.
                </p>
                <Button
                  variant="outline"
                  onClick={resetCookies}
                  className="rounded-full"
                >
                  Reset cookie preferences
                </Button>
              </Section>

              {/* Danger zone */}
              <Section
                icon={AlertTriangle}
                title="Danger zone"
                subtitle="Permanent actions"
                tone="destructive"
              >
                <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-5">
                  <p className="text-sm font-medium mb-2">
                    Close your account
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    Permanently removes your profile and everything tied to
                    it: inquiries, messages, reviews, saved vendors, and
                    {profile.role === "vendor" ? " business profile, portfolio, and availability calendar" : " event details, checklist, tasks, and budget"}.
                    This can't be undone.
                  </p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-full text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                      >
                        Close my account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-sm">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-display text-2xl">
                          Close your account?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm leading-relaxed">
                          This will delete your profile and all related data
                          ({profile.role === "vendor" ? "vendor profile, portfolio, inquiries, reviews, calendar" : "inquiries, messages, reviews, checklist, tasks, budget"}).
                          You'll be signed out immediately and won't be able
                          to sign back in with this email.
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
                          Yes, close it
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div className="pt-4">
                  <Button
                    variant="ghost"
                    className="rounded-full"
                    onClick={async () => {
                      await signOut();
                      navigate("/");
                    }}
                  >
                    Sign out
                  </Button>
                </div>
              </Section>
            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  tone,
  children,
}: {
  icon: typeof User;
  title: string;
  subtitle?: string;
  tone?: "destructive";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            tone === "destructive"
              ? "bg-destructive/15 text-destructive"
              : "bg-secondary text-foreground"
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h2 className="font-display text-lg leading-tight">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="ml-11">{children}</div>
    </section>
  );
}
