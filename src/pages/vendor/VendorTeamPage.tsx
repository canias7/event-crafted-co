import { useEffect, useState } from "react";
import {
  Users,
  Plus,
  Mail,
  Loader2,
  Trash2,
  Copy,
  Crown,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { vendorNavItems as navItems } from "@/data/navItems";

interface MemberRow {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
  user_display_name: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: "admin" | "member";
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

const roleBadge: Record<string, { label: string; className: string; icon?: typeof Crown }> = {
  owner: {
    label: "Owner",
    className: "bg-accent/15 text-accent border border-accent/30",
    icon: Crown,
  },
  admin: {
    label: "Admin",
    className: "bg-secondary text-secondary-foreground border border-border",
    icon: ShieldCheck,
  },
  member: {
    label: "Member",
    className: "bg-muted text-muted-foreground border border-border",
  },
};

export default function VendorTeamPage() {
  const { user, vendorMemberships } = useAuth();
  const membership = vendorMemberships[0] ?? null;
  const vendorId = membership?.vendor_id ?? null;
  const canManage =
    membership?.role === "owner" || membership?.role === "admin";

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [sending, setSending] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    if (!user || !vendorId) {
      setMembers([]);
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: memberRows } = await (supabase as any)
      .from("vendor_team_members")
      .select("id, user_id, role, created_at")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: true });
    const baseMembers = (memberRows as Omit<MemberRow, "user_display_name">[] | null) ?? [];

    // Hydrate display names from profiles. profiles is publicly readable.
    let merged: MemberRow[] = baseMembers.map((m) => ({
      ...m,
      user_display_name: null,
    }));
    if (baseMembers.length > 0) {
      const ids = baseMembers.map((m) => m.user_id);
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      const map = new Map(
        ((profileRows as { id: string; display_name: string | null }[] | null) ?? [])
          .map((p) => [p.id, p.display_name]),
      );
      merged = merged.map((m) => ({
        ...m,
        user_display_name: map.get(m.user_id) ?? null,
      }));
    }
    setMembers(merged);

    if (canManage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inviteRows } = await (supabase as any)
        .from("vendor_team_invites")
        .select("id, email, role, token, expires_at, accepted_at, created_at")
        .eq("vendor_id", vendorId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      setInvites((inviteRows as InviteRow[] | null) ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorId, canManage]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !vendorId) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setSending(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_team_invites")
      .insert({
        vendor_id: vendorId,
        email,
        role: inviteRole,
        invited_by: user.id,
      })
      .select("token")
      .single();
    if (error) {
      setSending(false);
      toast.error(error.message);
      return;
    }
    const token = (data as { token: string }).token;
    const link = `${window.location.origin}/accept-team-invite/${token}`;

    // Look up business name for the email subject + body. Best effort —
    // missing profile shouldn't fail the invite.
    const { data: vp } = await supabase
      .from("vendor_profiles")
      .select("business_name")
      .eq("id", vendorId)
      .maybeSingle();

    // Fire-and-fail-soft email send. We always copy the link to clipboard
    // so the inviter has a fallback if Resend is misconfigured.
    const emailResult = await supabase.functions.invoke(
      "send-transactional-email",
      {
        body: {
          kind: "team_invite",
          email,
          token,
          businessName: vp?.business_name ?? null,
          role: inviteRole,
        },
      },
    );

    await navigator.clipboard.writeText(link).catch(() => {});
    setSending(false);
    if (emailResult.error) {
      toast.warning("Invite created — email failed, link copied as fallback");
    } else {
      toast.success(`Invite emailed to ${email} (link also copied)`);
    }
    setInviteOpen(false);
    setInviteEmail("");
    setInviteRole("member");
    load();
  }

  function copyInviteLink(token: string) {
    const link = `${window.location.origin}/accept-team-invite/${token}`;
    navigator.clipboard.writeText(link).then(
      () => toast.success("Invite link copied"),
      () => toast.error("Couldn't copy"),
    );
  }

  async function removeMember(member: MemberRow) {
    setRemovingId(member.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_team_members")
      .delete()
      .eq("id", member.id);
    setRemovingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removed from team");
    load();
  }

  async function revokeInvite(invite: InviteRow) {
    setRevokingId(invite.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_team_invites")
      .delete()
      .eq("id", invite.id);
    setRevokingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-xl">Team</h1>
            <p className="text-sm text-muted-foreground">
              Add staff so multiple people can manage inquiries together
            </p>
          </div>
          {canManage && (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Invite teammate
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite a teammate</DialogTitle>
                  <DialogDescription>
                    They'll get a one-time link to accept and join your vendor account.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={sendInvite} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="teammate@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-role">Role</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(v) => setInviteRole(v as "admin" | "member")}
                    >
                      <SelectTrigger id="invite-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">
                          Member — manage inquiries, templates, availability
                        </SelectItem>
                        <SelectItem value="admin">
                          Admin — everything members can do, plus team management
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setInviteOpen(false)}
                      className="rounded-full"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={sending}
                      className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                    >
                      {sending && (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      )}
                      Create invite
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-10">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">
              Loading team…
            </div>
          ) : !vendorId ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl mb-2">
                Set up your business profile first
              </h3>
              <p className="text-sm text-muted-foreground">
                Once you have a vendor profile, you can invite teammates here.
              </p>
            </div>
          ) : (
            <>
              <section>
                <p className="font-label text-muted-foreground mb-3">
                  Members
                </p>
                <div className="rounded-sm border border-border bg-card divide-y divide-border">
                  {members.map((m) => {
                    const role = roleBadge[m.role];
                    const Icon = role.icon;
                    const isMe = m.user_id === user?.id;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {m.user_display_name ?? "Teammate"}
                            {isMe && (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Joined{" "}
                            {new Date(m.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge className={role.className}>
                            {Icon && <Icon className="w-3 h-3 mr-1" />}
                            {role.label}
                          </Badge>
                          {canManage && m.role !== "owner" && !isMe && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={removingId === m.id}
                                  aria-label="Remove member"
                                >
                                  {removingId === m.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Remove this teammate?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    They'll lose access to the inbox and all
                                    vendor portal features. You can re-invite
                                    them later if needed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-full">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => removeMember(m)}
                                    className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {canManage && invites.length > 0 && (
                <section>
                  <p className="font-label text-muted-foreground mb-3">
                    Pending invites
                  </p>
                  <div className="rounded-sm border border-border bg-card divide-y divide-border">
                    {invites.map((i) => (
                      <div
                        key={i.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            {i.email}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Expires{" "}
                            {new Date(i.expires_at).toLocaleDateString()} ·{" "}
                            {i.role}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs rounded-full"
                            onClick={() => copyInviteLink(i.token)}
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy link
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => revokeInvite(i)}
                            disabled={revokingId === i.id}
                            aria-label="Revoke invite"
                          >
                            {revokingId === i.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Invites are emailed automatically. If your teammate didn't
                    get one, copy the link above and send it directly.
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
