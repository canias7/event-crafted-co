import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle, KeyRound, User, Cookie } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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

  useEffect(() => {
    if (profile) setDisplayName(profile.display_name ?? "");
  }, [profile]);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("request_account_deletion");
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

  function resetCookies() {
    localStorage.removeItem(COOKIE_KEY);
    toast.success("Cookie banner will reappear on next page load");
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title={sidebarTitle} backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
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
