import { useEffect, useState } from "react";
import {
  Plus,
  Loader2,
  Trash2,
  Send,
  CheckCircle2,
  Clock,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Lets the host build the inner-circle VIP list and email invitations.
// Works for any event type — weddings, milestone birthdays, holiday
// gatherings, baby showers — the VIPs are whoever the host wants in
// the privileged tier (co-hosts, family, wedding party, best friends).
// Each member gets a magic-link → AcceptPartyInvitePage flow.

interface PartyInvite {
  id: string;
  email: string;
  role_label: string;
  token: string;
  member_user_id: string | null;
  accepted_at: string | null;
  created_at: string;
}

// Universal options first, then event-specific. Free-text is supported
// at the DB layer (role_label is text) so a custom label could be added
// later via the schema; for v1 we ship a curated list that covers most
// event types.
const ROLE_OPTIONS = [
  // Universal
  "VIP",
  "Co-host",
  "Family",
  "Best Friend",
  "Parent",
  "Sibling",
  // Wedding-specific
  "Maid of Honor",
  "Best Man",
  "Bridesmaid",
  "Groomsman",
  "Mother of the Bride",
  "Mother of the Groom",
  "Father of the Bride",
  "Father of the Groom",
  // Birthday / milestone
  "Guest of Honor",
  // Baby shower
  "Mother-to-be",
  "Co-parent",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invitesTable = () => (supabase as any).from("event_party_invites");

export function PartyInviteManager({
  hostId,
  eventId,
}: {
  hostId: string;
  eventId: string | null;
}) {
  const [invites, setInvites] = useState<PartyInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  async function load() {
    if (!eventId) {
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await invitesTable()
      .select(
        "id, email, role_label, token, member_user_id, accepted_at, created_at",
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    setInvites((data as PartyInvite[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function deleteInvite(id: string) {
    if (!confirm("Remove this party member? They'll lose access immediately."))
      return;
    const { error } = await invitesTable().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInvites((p) => p.filter((x) => x.id !== id));
  }

  async function copyLink(invite: PartyInvite) {
    setCopyingId(invite.id);
    const url = `${window.location.origin}/accept-party-invite/${invite.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Copy failed");
    }
    setTimeout(() => setCopyingId(null), 1500);
  }

  if (!eventId) {
    return (
      <div className="rounded-sm border border-dashed border-border p-8 text-center">
        <Sparkles className="w-7 h-7 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium mb-1">No active event</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
          Set an active event from your dashboard to start adding wedding-party
          members.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-label text-muted-foreground">Inner circle</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-xl">
            Add co-hosts, family, the wedding party, or anyone else who needs
            day-of details. They get a private portal with the schedule,
            vendor names, group gifts, registry, and any tasks you assign —
            no inquiries or finances.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add member
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          Loading…
        </div>
      ) : invites.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          No party members yet
        </div>
      ) : (
        <ul className="space-y-2">
          {invites.map((inv) => {
            const accepted = Boolean(inv.accepted_at);
            return (
              <li
                key={inv.id}
                className="card-soft p-3 flex items-start justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {inv.email}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {inv.role_label}
                    {" · "}
                    {accepted ? (
                      <span className="text-accent inline-flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        accepted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        invited
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => copyLink(inv)}
                    className="rounded-full text-xs h-7 px-2.5"
                  >
                    {copyingId === inv.id ? (
                      <Check className="w-3 h-3 mr-1" />
                    ) : (
                      <Copy className="w-3 h-3 mr-1" />
                    )}
                    Copy link
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteInvite(inv.id)}
                    className="rounded-full text-xs h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        hostId={hostId}
        eventId={eventId}
        onAdded={load}
      />
    </div>
  );
}

function AddDialog({
  open,
  onOpenChange,
  hostId,
  eventId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hostId: string;
  eventId: string;
  onAdded: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("VIP");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("event_party_invites")
      .insert({
        host_id: hostId,
        event_id: eventId,
        email: email.trim().toLowerCase(),
        role_label: role,
      });
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }
    // Best-effort email send via send-transactional-email. Skip if the
    // function isn't deployed yet — the link can still be copied.
    try {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          kind: "party_invite",
          email: email.trim().toLowerCase(),
          roleLabel: role,
        },
      });
    } catch {
      // ignore — fall back to copy-link
    }
    setSubmitting(false);
    toast.success("Invite added — copy the link to send manually if needed");
    setEmail("");
    setRole("VIP");
    onOpenChange(false);
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Add an inner-circle VIP
          </DialogTitle>
          <DialogDescription>
            They'll get a magic-link email + a private portal with the
            schedule, vendor contacts, group gifts, and any tasks you
            assign. Works for any event type.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="party-email">Email</Label>
            <Input
              id="party-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sarah@example.com"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="party-role">Role</Label>
            <select
              id="party-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full h-10 rounded-sm border border-input bg-background px-3 text-sm"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1.5" />
              )}
              Add + send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
