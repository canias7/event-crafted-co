import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Loader2,
  Copy,
  Mail,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminNavItems as navItems } from "@/data/navItems";
import { formatDate } from "@/lib/format";

// Admin outreach tracker for the claim-listing flow. Lists every
// pre-created stub vendor profile + its claim invitation status.
// The admin can:
//   - Create a new stub + invitation in one form (business name,
//     category, location, owner email)
//   - Copy the /claim/{token} link
//   - Manually mark "contacted" once the email goes out (status
//     advances pending → contacted → accepted/declined)
//   - Delete a row that's been declined or shouldn't exist

const STATUS_META: Record<
  string,
  { label: string; tone: string; Icon: typeof Clock }
> = {
  pending: { label: "Pending", tone: "bg-secondary/60 text-foreground", Icon: Clock },
  contacted: { label: "Contacted", tone: "bg-accent/15 text-accent border-accent/30", Icon: Mail },
  accepted: { label: "Claimed", tone: "bg-accent text-accent-foreground", Icon: CheckCircle2 },
  declined: { label: "Declined", tone: "bg-destructive/10 text-destructive", Icon: XCircle },
};

interface ClaimRow {
  id: string;
  vendor_id: string;
  email: string;
  token: string;
  status: "pending" | "contacted" | "accepted" | "declined";
  notes: string | null;
  contacted_at: string | null;
  accepted_at: string | null;
  created_at: string;
  vendor: {
    id: string;
    business_name: string;
    category: string;
    location: string | null;
    user_id: string | null;
  } | null;
}

export default function AdminClaimsPage() {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_claim_invitations")
      .select(
        "id, vendor_id, email, token, status, notes, contacted_at, accepted_at, created_at, vendor:vendor_profiles!vendor_claim_invitations_vendor_id_fkey(id, business_name, category, location, user_id)",
      )
      .order("created_at", { ascending: false });
    setRows((data as ClaimRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(row: ClaimRow, status: ClaimRow["status"]) {
    const patch: Record<string, unknown> = { status };
    if (status === "contacted" && !row.contacted_at) {
      patch.contacted_at = new Date().toISOString();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_claim_invitations")
      .update(patch)
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked ${STATUS_META[status].label.toLowerCase()}`);
    load();
  }

  async function copyClaimLink(token: string) {
    const url = `${window.location.origin}/claim/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  }

  // Funnel counts at a glance.
  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Admin" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-xl">Claim invitations</h1>
            <p className="text-sm text-muted-foreground">
              Vendor-density flywheel — pre-list stubs, send claim links,
              track outreach
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New invite
          </Button>
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-4">
          {/* Funnel stats */}
          <div className="grid grid-cols-4 gap-3">
            {(
              ["pending", "contacted", "accepted", "declined"] as const
            ).map((s) => {
              const meta = STATUS_META[s];
              return (
                <div
                  key={s}
                  className="rounded-sm border border-border bg-card p-3"
                >
                  <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
                    <meta.Icon className="w-3 h-3" />
                    {meta.label}
                  </p>
                  <p className="font-display text-2xl tnum mt-1">
                    {counts[s] ?? 0}
                  </p>
                </div>
              );
            })}
          </div>

          {loading ? (
            <>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-sm" />
              ))}
            </>
          ) : rows.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <Mail className="w-10 h-10 mx-auto text-muted-foreground/40 mb-4" />
              <h2 className="font-display text-xl mb-2">No invitations yet</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pre-create a stub vendor profile + claim invitation. The
                vendor visits /claim/&#123;token&#125; to take ownership.
              </p>
            </div>
          ) : (
            rows.map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <div
                  key={r.id}
                  className="rounded-sm border border-border bg-card p-4 flex items-start gap-4 flex-wrap"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-display text-base truncate">
                        {r.vendor?.business_name ?? "—"}
                      </h3>
                      <Badge className={`${meta.tone}`}>
                        <meta.Icon className="w-3 h-3 mr-1" />
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.vendor?.category}
                      {r.vendor?.location ? ` · ${r.vendor.location}` : null}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r.email}{" "}
                      <span className="ml-2 tnum">
                        {formatDate(r.created_at, "short")}
                      </span>
                    </p>
                    {r.notes && (
                      <p className="text-xs text-foreground/70 mt-2 italic">
                        {r.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs h-8"
                      onClick={() => copyClaimLink(r.token)}
                    >
                      {copiedToken === r.token ? (
                        <>
                          <Check className="w-3 h-3 mr-1.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 mr-1.5" />
                          Claim link
                        </>
                      )}
                    </Button>
                    {r.status === "pending" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full text-xs h-8"
                        onClick={() => setStatus(r, "contacted")}
                      >
                        Mark contacted
                      </Button>
                    )}
                    {r.status === "contacted" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-full text-xs h-8 text-muted-foreground"
                        onClick={() => setStatus(r, "declined")}
                      >
                        Mark declined
                      </Button>
                    )}
                    {r.vendor?.user_id && (
                      <Link
                        to={`/vendors/${r.vendor.id}`}
                        target="_blank"
                        className="inline-flex items-center"
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      <NewInviteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
      />
    </div>
  );
}

function NewInviteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setBusinessName("");
      setCategory("");
      setLocation("");
      setEmail("");
      setNotes("");
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim() || !category.trim() || !email.trim()) return;
    setSubmitting(true);
    // 1. Insert stub vendor_profile (user_id NULL).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: vp, error: vpErr } = await sb
      .from("vendor_profiles")
      .insert({
        user_id: null,
        business_name: businessName.trim(),
        category: category.trim(),
        location: location.trim() || null,
      })
      .select("id")
      .single();
    if (vpErr || !vp) {
      setSubmitting(false);
      toast.error(vpErr?.message ?? "Couldn't create stub");
      return;
    }
    // 2. Insert claim invitation pointing to the stub.
    const { data: inv, error: invErr } = await sb
      .from("vendor_claim_invitations")
      .insert({
        vendor_id: vp.id,
        email: email.trim(),
        notes: notes.trim() || null,
      })
      .select("id, token")
      .single();
    setSubmitting(false);
    if (invErr || !inv) {
      toast.error(invErr?.message ?? "Couldn't create invitation");
      return;
    }
    // Drop the claim URL on the clipboard so the admin can paste it
    // straight into their outreach email.
    const url = `${window.location.origin}/claim/${inv.token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success("Invitation created — link copied");
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            New claim invite
          </DialogTitle>
          <DialogDescription>
            Pre-creates a stub vendor profile + a claim link the owner can
            visit to take ownership. Link is copied to your clipboard on
            create.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="ci-name">Business name *</Label>
            <Input
              id="ci-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Hudson Valley Floral Co."
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ci-cat">Category *</Label>
              <Input
                id="ci-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Florist"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci-loc">Location</Label>
              <Input
                id="ci-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Hudson, NY"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ci-email">Owner email *</Label>
            <Input
              id="ci-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@hudsonvalleyfloral.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ci-notes">Outreach notes</Label>
            <Textarea
              id="ci-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="From the Yelp directory · referred by Sarah · etc."
            />
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
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
