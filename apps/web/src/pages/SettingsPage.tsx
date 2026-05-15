import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle, User, LogOut } from "lucide-react";
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

// Account settings — mirrors mobile's three-section layout (Profile /
// Session / Danger zone). The big web-only feature blocks (password
// change, 2FA, theme picker, push notifications, email digest toggles,
// data export, cookie reset) were stripped when the host portal was
// mirrored to mobile. If a user needs to reset their password they
// can use the forgot-password flow; email is hello@vendora.events for
// anything else.
export default function SettingsPage() {
  const { user, profile, isApprovedVendor, signOut } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (profile) setDisplayName(profile.display_name ?? "");
  }, [profile]);

  const navItems = isApprovedVendor ? vendorNavItems : customerNavItems;
  const sidebarTitle = isApprovedVendor ? "Vendor Portal" : "Customer";

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
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title={sidebarTitle} backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40">
          <h1 className="font-editorial text-2xl">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-2xl space-y-10">
          {!profile ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
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

              <Section
                icon={LogOut}
                title="Session"
                subtitle="Sign out of this device"
              >
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={async () => {
                    await signOut();
                    navigate("/");
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </Button>
              </Section>

              <Section
                icon={AlertTriangle}
                title="Danger zone"
                subtitle="Permanent actions"
                tone="destructive"
              >
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
                  <p className="text-sm font-medium mb-2">
                    Delete your account
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    Permanently removes your profile and everything tied
                    to it: inquiries, messages, reviews, saved vendors
                    {isApprovedVendor
                      ? ", and your business profile, portfolio, and availability calendar"
                      : ""}
                    . This can't be undone.
                  </p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-full text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                      >
                        Delete account
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
