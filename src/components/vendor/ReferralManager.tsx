import { useEffect, useState } from "react";
import { Plus, Loader2, Copy, Mail, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

interface Referral {
  id: string;
  email: string;
  referral_code: string;
  status: "pending" | "signed_up" | "first_booking" | "rewarded" | "expired";
  reward_percent_off: number;
  signed_up_at: string | null;
  expires_at: string;
  created_at: string;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Sent",
    className: "bg-secondary text-muted-foreground border border-border",
  },
  signed_up: {
    label: "Signed up",
    className: "bg-accent/15 text-accent border border-accent/30",
  },
  first_booking: {
    label: "First booking",
    className: "bg-accent text-accent-foreground border border-accent",
  },
  rewarded: {
    label: "Rewarded",
    className: "bg-foreground text-background border border-foreground",
  },
  expired: {
    label: "Expired",
    className: "bg-muted text-muted-foreground border border-border",
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const refsTable = () => (supabase as any).from("vendor_referrals");

export function ReferralManager({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const [refs, setRefs] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await refsTable()
      .select(
        "id, email, referral_code, status, reward_percent_off, signed_up_at, expires_at, created_at",
      )
      .eq("referrer_id", vendorId)
      .order("created_at", { ascending: false });
    setRefs((data as Referral[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setSending(true);
    const { data, error } = await refsTable()
      .insert({ referrer_id: vendorId, email: cleanEmail })
      .select("referral_code")
      .single();
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const code = (data as { referral_code: string }).referral_code;
    const link = `${window.location.origin}/vendor-apply?ref=${code}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Referral link copied — send it to your contact");
    setOpen(false);
    setEmail("");
    load();
  }

  function copyLink(code: string) {
    const link = `${window.location.origin}/vendor-apply?ref=${code}`;
    navigator.clipboard.writeText(link).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy"),
    );
  }

  async function deleteRef(id: string) {
    setDeletingId(id);
    const { error } = await refsTable().delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRefs((p) => p.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-label text-muted-foreground">Refer a vendor</p>
          <p className="text-xs text-muted-foreground mt-1">
            Invite another vendor — when they sign up + book their first
            event, you both get 1% off commission for life. (Live once
            payments ship.)
          </p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Send invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Refer a vendor to Vendora</DialogTitle>
                <DialogDescription>
                  We'll generate a unique link tied to your vendor profile.
                  When they sign up + book their first event, you both get
                  1% off your platform commission.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={send} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ref-email">Their email</Label>
                  <Input
                    id="ref-email"
                    type="email"
                    placeholder="florist@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
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
                    Generate link
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground text-sm py-6">
          Loading…
        </div>
      ) : refs.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-6 text-center">
          <Sparkles className="w-6 h-6 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            No referrals sent yet. Refer 3 vendors → 3% off commission for
            life if they all book.
          </p>
        </div>
      ) : (
        <div className="rounded-sm border border-border bg-card divide-y divide-border">
          {refs.map((r) => {
            const badge = statusBadge[r.status] ?? statusBadge.pending;
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {r.email}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sent {new Date(r.created_at).toLocaleDateString()} ·
                    expires {new Date(r.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={badge.className}>{badge.label}</Badge>
                  {r.status === "pending" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs rounded-full"
                        onClick={() => copyLink(r.referral_code)}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy link
                      </Button>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={deletingId === r.id}
                          onClick={() => deleteRef(r.id)}
                          aria-label="Cancel referral"
                        >
                          {deletingId === r.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          )}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
