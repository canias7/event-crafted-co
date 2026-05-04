import { useEffect, useState } from "react";
import {
  Users,
  Plus,
  Mail,
  Loader2,
  Trash2,
  Copy,
  Crown,
  Edit2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { PartyInviteManager } from "@/components/customer/PartyInviteManager";
import { PLANNING_HUB_TABS } from "@/data/hubTabs";
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
import { customerNavItems as navItems } from "@/data/navItems";

interface CollaboratorRow {
  id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
  display_name: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: "editor" | "viewer";
  token: string;
  expires_at: string;
  created_at: string;
}

const roleBadge: Record<string, { label: string; className: string; Icon: typeof Crown }> = {
  owner: {
    label: "You",
    className: "bg-accent/15 text-accent border border-accent/30",
    Icon: Crown,
  },
  editor: {
    label: "Editor",
    className: "bg-secondary text-secondary-foreground border border-border",
    Icon: Edit2,
  },
  viewer: {
    label: "Viewer",
    className: "bg-muted text-muted-foreground border border-border",
    Icon: Eye,
  },
};

export default function PlanningTeamPage() {
  const { user, profile, activeEvent } = useAuth();

  const [collaborators, setCollaborators] = useState<CollaboratorRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [sending, setSending] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await (supabase as any)
      .from("planning_collaborators")
      .select("id, user_id, role, created_at")
      .eq("host_id", user.id)
      .order("created_at", { ascending: true });

    // Insert a virtual "owner" row for the host themselves so the list
    // renders the host first; saves having to seed the table.
    const base: CollaboratorRow[] = [
      {
        id: "owner-self",
        user_id: user.id,
        role: "owner",
        created_at: profile?.onboarded_at ?? new Date().toISOString(),
        display_name: profile?.display_name ?? null,
      },
    ];
    const others = (rows as Omit<CollaboratorRow, "display_name">[] | null) ?? [];

    let merged: CollaboratorRow[] = [
      ...base,
      ...others.map((r) => ({ ...r, display_name: null })),
    ];

    if (others.length > 0) {
      const ids = others.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      const map = new Map(
        ((profiles as { id: string; display_name: string | null }[] | null) ?? [])
          .map((p) => [p.id, p.display_name]),
      );
      merged = merged.map((r) =>
        r.id === "owner-self"
          ? r
          : { ...r, display_name: map.get(r.user_id) ?? null },
      );
    }

    setCollaborators(merged);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inviteRows } = await (supabase as any)
      .from("planning_invites")
      .select("id, email, role, token, expires_at, created_at")
      .eq("host_id", user.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    setInvites((inviteRows as InviteRow[] | null) ?? []);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setSending(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("planning_invites")
      .insert({
        host_id: user.id,
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
    const link = `${window.location.origin}/accept-planning-invite/${token}`;

    // Fire-and-fail-soft email send; clipboard fallback always runs.
    const emailResult = await supabase.functions.invoke(
      "send-transactional-email",
      {
        body: {
          kind: "planning_invite",
          email,
          token,
          hostName: profile?.display_name ?? null,
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
    setInviteRole("editor");
    load();
  }

  function copyInviteLink(token: string) {
    const link = `${window.location.origin}/accept-planning-invite/${token}`;
    navigator.clipboard.writeText(link).then(
      () => toast.success("Invite link copied"),
      () => toast.error("Couldn't copy"),
    );
  }

  async function removeCollaborator(c: CollaboratorRow) {
    setRemovingId(c.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("planning_collaborators")
      .delete()
      .eq("id", c.id);
    setRemovingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removed from your planning team");
    load();
  }

  async function revokeInvite(i: InviteRow) {
    setRevokingId(i.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("planning_invites")
      .delete()
      .eq("id", i.id);
    setRevokingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInvites((prev) => prev.filter((p) => p.id !== i.id));
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-xl">Planning team</h1>
            <p className="text-sm text-muted-foreground">
              Share your event workspace with your partner, MOH, planner, or family
            </p>
          </div>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Invite collaborator
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a collaborator</DialogTitle>
                <DialogDescription>
                  They'll get a one-time link to join your planning workspace.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={sendInvite} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="partner@example.com"
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
                    onValueChange={(v) => setInviteRole(v as "editor" | "viewer")}
                  >
                    <SelectTrigger id="invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">
                        Editor — can add guests, edit checklist + budget, build mood boards
                      </SelectItem>
                      <SelectItem value="viewer">
                        Viewer — can see everything but can't edit
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
          </div>
          <SubNavTabs tabs={PLANNING_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-10">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : (
            <>
              {/* Wedding-party VIPs — separate from full editor collaborators */}
              {user && (
                <section className="pb-8 border-b border-border">
                  <PartyInviteManager
                    hostId={user.id}
                    eventId={activeEvent?.id ?? null}
                  />
                </section>
              )}

              <section>
                <p className="font-label text-muted-foreground mb-3">
                  Your team
                </p>
                <div className="rounded-sm border border-border bg-card divide-y divide-border">
                  {collaborators.map((c) => {
                    const role = roleBadge[c.role];
                    const Icon = role.Icon;
                    const isMe = c.user_id === user?.id;
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {c.display_name ?? "Collaborator"}
                            {isMe && (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.role === "owner"
                              ? "Workspace owner"
                              : `Joined ${new Date(c.created_at).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge className={role.className}>
                            <Icon className="w-3 h-3 mr-1" />
                            {role.label}
                          </Badge>
                          {c.role !== "owner" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={removingId === c.id}
                                  aria-label="Remove collaborator"
                                >
                                  {removingId === c.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Remove this collaborator?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    They'll lose access to your planning
                                    workspace. You can re-invite them later
                                    if needed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-full">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => removeCollaborator(c)}
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

              {invites.length > 0 && (
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
                    Invites are emailed automatically. If your collaborator
                    didn't get one, copy the link above and send it directly.
                  </p>
                </section>
              )}

              {collaborators.length === 1 && invites.length === 0 && (
                <div className="text-center py-10 max-w-md mx-auto">
                  <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                    <Users className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="font-display text-lg mb-2">
                    Plan with the people who matter
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Invite your partner, maid of honor, parents, or planner
                    to share your guest list, budget, checklist, mood
                    boards, and timeline.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
