import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Loader2,
  Flag,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface HostReputation {
  total_inquiries: number;
  bookings: number;
  ghosted: number;
  response_rate: number | null;
  booking_rate: number | null;
  positive_flags: number;
  negative_flags: number;
  joined_at: string;
  tier: "new" | "reliable" | "top" | "caution";
}

const tierMeta: Record<
  HostReputation["tier"],
  { label: string; tone: string; Icon: typeof ShieldCheck }
> = {
  new: {
    label: "New host",
    tone: "bg-secondary text-muted-foreground border-border",
    Icon: UserPlus,
  },
  reliable: {
    label: "Reliable",
    tone: "bg-accent/10 text-accent border-accent/30",
    Icon: ShieldCheck,
  },
  top: {
    label: "Top host",
    tone: "bg-accent text-accent-foreground border-accent",
    Icon: Sparkles,
  },
  caution: {
    label: "Caution",
    tone: "bg-destructive/10 text-destructive border-destructive/30",
    Icon: ShieldAlert,
  },
};

const FLAG_LABELS: Record<string, { label: string; positive: boolean }> = {
  pleasant: { label: "Easy to work with", positive: true },
  great_communication: { label: "Great communication", positive: true },
  rebooked: { label: "Rebooked us", positive: true },
  no_show: { label: "No-show", positive: false },
  unresponsive: { label: "Went unresponsive", positive: false },
  paid_late: { label: "Paid late", positive: false },
};

function joinedAgo(joinedAt: string) {
  const days = Math.floor(
    (Date.now() - new Date(joinedAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 30) return `${days}d on Vendora`;
  if (days < 365) return `${Math.floor(days / 30)}mo on Vendora`;
  return `${Math.floor(days / 365)}y on Vendora`;
}

interface Props {
  hostId: string;
  vendorId: string;
  inquiryId?: string;
  /** When false, skip the "Flag this host" affordance. */
  canFlag?: boolean;
}

export function HostReputationCard({
  hostId,
  vendorId,
  inquiryId,
  canFlag = true,
}: Props) {
  const [rep, setRep] = useState<HostReputation | null>(null);
  const [loading, setLoading] = useState(true);
  const [flagOpen, setFlagOpen] = useState(false);

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "get_host_reputation",
      { p_host_id: hostId },
    );
    setLoading(false);
    if (error) {
      // Silently swallow — usually means the vendor doesn't have an
      // inquiry with this host (impossible in normal flow but safe).
      return;
    }
    if (Array.isArray(data) && data[0]) setRep(data[0] as HostReputation);
  }

  useEffect(() => {
    if (hostId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  if (loading) {
    return (
      <div className="rounded-sm border border-border p-4 bg-card">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!rep) return null;

  const meta = tierMeta[rep.tier];
  const TierIcon = meta.Icon;

  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TierIcon className="w-3.5 h-3.5 text-foreground/70" />
          <p className="font-label text-muted-foreground">Host signals</p>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${meta.tone}`}
        >
          {meta.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <Metric
          label="Inquiries"
          value={rep.total_inquiries.toString()}
          sub={`${rep.bookings} booked`}
        />
        <Metric
          label="Reply rate"
          value={
            rep.response_rate != null
              ? `${Math.round(rep.response_rate * 100)}%`
              : "—"
          }
          sub={
            rep.response_rate != null
              ? rep.response_rate >= 0.8
                ? "responsive"
                : rep.response_rate >= 0.5
                  ? "ok"
                  : "slow"
              : "no replies yet"
          }
        />
        <Metric
          label="Joined"
          value={joinedAgo(rep.joined_at)}
          sub={
            rep.ghosted > 0
              ? `${rep.ghosted} ghosted`
              : rep.positive_flags > 0
                ? `${rep.positive_flags} kudos`
                : "clean"
          }
        />
      </div>

      {rep.negative_flags >= 2 && (
        <p className="text-xs text-destructive/80 mb-3 flex items-start gap-1.5">
          <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" />
          {rep.negative_flags} other vendor{rep.negative_flags === 1 ? "" : "s"}{" "}
          flagged this host. Consider asking for a deposit upfront.
        </p>
      )}

      {canFlag && inquiryId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFlagOpen(true)}
          className="rounded-full text-xs h-7 px-2.5 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <Flag className="w-3 h-3 mr-1.5" />
          Flag this host
        </Button>
      )}

      {canFlag && inquiryId && (
        <FlagDialog
          open={flagOpen}
          onOpenChange={setFlagOpen}
          hostId={hostId}
          vendorId={vendorId}
          inquiryId={inquiryId}
          onSaved={load}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-display text-lg leading-tight tnum mt-0.5">{value}</p>
      <p className="text-[10px] text-muted-foreground capitalize">{sub}</p>
    </div>
  );
}

function FlagDialog({
  open,
  onOpenChange,
  hostId,
  vendorId,
  inquiryId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hostId: string;
  vendorId: string;
  inquiryId: string;
  onSaved: () => void;
}) {
  const [flagType, setFlagType] = useState("pleasant");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("host_reliability_flags")
      .insert({
        vendor_id: vendorId,
        host_id: hostId,
        inquiry_id: inquiryId,
        flag_type: flagType,
        note: note.trim() || null,
      });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    onOpenChange(false);
    setNote("");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Flag this host
          </DialogTitle>
          <DialogDescription>
            Your flag is private to you and rolls up into the host's
            cross-vendor signals. Use both positive and negative — the
            kudos help great hosts stand out.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="flag-type">Signal</Label>
            <Select value={flagType} onValueChange={setFlagType}>
              <SelectTrigger id="flag-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pleasant">
                  ✓ Easy to work with
                </SelectItem>
                <SelectItem value="great_communication">
                  ✓ Great communication
                </SelectItem>
                <SelectItem value="rebooked">✓ Rebooked us</SelectItem>
                <SelectItem value="no_show">⚠ No-show</SelectItem>
                <SelectItem value="unresponsive">⚠ Went unresponsive</SelectItem>
                <SelectItem value="paid_late">⚠ Paid late</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="flag-note">Note (optional, private)</Label>
            <Textarea
              id="flag-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything other vendors should know."
            />
          </div>
          <DialogFooter className="pt-1 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Save flag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Compact inline tier badge for inbox rows.
export function HostTierBadge({ tier }: { tier: HostReputation["tier"] }) {
  const meta = tierMeta[tier];
  const Icon = meta.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 border ${meta.tone}`}
      title={`Host tier: ${meta.label}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {meta.label}
    </span>
  );
}

export type { HostReputation };
