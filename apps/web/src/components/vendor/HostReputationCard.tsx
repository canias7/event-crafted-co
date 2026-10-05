import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
  positive_flags: number;
  negative_flags: number;
  joined_at: string;
  tier: "new" | "reliable" | "top" | "caution";
}

// Labels: vendorTools hostReputation.tiers.<tier>.
const tierMeta: Record<
  HostReputation["tier"],
  { tone: string; Icon: typeof ShieldCheck }
> = {
  new: {
    tone: "bg-secondary text-muted-foreground border-border",
    Icon: UserPlus,
  },
  reliable: {
    tone: "bg-accent/10 text-accent border-accent/30",
    Icon: ShieldCheck,
  },
  top: {
    tone: "bg-accent text-accent-foreground border-accent",
    Icon: Sparkles,
  },
  caution: {
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

function joinedAgo(t: TFunction, joinedAt: string) {
  const days = Math.floor(
    (Date.now() - new Date(joinedAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 30) return t("hostReputation.joinedDays", { count: days });
  if (days < 365) return t("hostReputation.joinedMonths", { count: Math.floor(days / 30) });
  return t("hostReputation.joinedYears", { count: Math.floor(days / 365) });
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
  const { t } = useTranslation("vendorTools");
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
      <div className="rounded-2xl border border-border p-4 bg-card">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!rep) return null;

  const meta = tierMeta[rep.tier];
  const TierIcon = meta.Icon;

  return (
    <div className="card-soft p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TierIcon className="w-3.5 h-3.5 text-foreground" />
          <p className="font-label text-muted-foreground">{t("hostReputation.signals")}</p>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${meta.tone}`}
        >
          {t(`hostReputation.tiers.${rep.tier}`)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <Metric
          label={t("hostReputation.inquiries")}
          value={rep.total_inquiries.toString()}
          sub={t("hostReputation.booked", { n: rep.bookings })}
        />
        <Metric
          label={t("hostReputation.replyRate")}
          value={
            rep.response_rate != null
              ? `${Math.round(rep.response_rate * 100)}%`
              : "—"
          }
          sub={
            rep.response_rate != null
              ? rep.response_rate >= 0.8
                ? t("hostReputation.responsive")
                : rep.response_rate >= 0.5
                  ? t("hostReputation.ok")
                  : t("hostReputation.slow")
              : t("hostReputation.noReplies")
          }
        />
        <Metric
          label={t("hostReputation.joined")}
          value={joinedAgo(t, rep.joined_at)}
          sub={
            rep.ghosted > 0
              ? t("hostReputation.ghosted", { n: rep.ghosted })
              : rep.positive_flags > 0
                ? t("hostReputation.kudos", { n: rep.positive_flags })
                : t("hostReputation.clean")
          }
        />
      </div>

      {rep.negative_flags >= 2 && (
        <p className="text-xs text-destructive/80 mb-3 flex items-start gap-1.5">
          <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" />
          {t("hostReputation.flaggedWarning", { count: rep.negative_flags })}
        </p>
      )}

      {canFlag && inquiryId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFlagOpen(true)}
          className="rounded-full text-xs h-7 px-2.5 -ml-2 text-muted-foreground hover:text-accent"
        >
          <Flag className="w-3 h-3 mr-1.5" />
          {t("hostReputation.flag")}
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
  const { t } = useTranslation("vendorTools");
  const [flagType, setFlagType] = useState("pleasant");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
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
    toast.success(t("common.saved"));
    onOpenChange(false);
    setNote("");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl">
            {t("hostReputation.flag")}
          </DialogTitle>
          <DialogDescription>
            {t("hostReputation.flagIntro")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="flag-type">{t("hostReputation.signal")}</Label>
            <Select value={flagType} onValueChange={setFlagType}>
              <SelectTrigger id="flag-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pleasant">
                  ✓ {t("hostReputation.flags.pleasant")}
                </SelectItem>
                <SelectItem value="great_communication">
                  ✓ {t("hostReputation.flags.great_communication")}
                </SelectItem>
                <SelectItem value="rebooked">✓ {t("hostReputation.flags.rebooked")}</SelectItem>
                <SelectItem value="no_show">⚠ {t("hostReputation.flags.no_show")}</SelectItem>
                <SelectItem value="unresponsive">⚠ {t("hostReputation.flags.unresponsive")}</SelectItem>
                <SelectItem value="paid_late">⚠ {t("hostReputation.flags.paid_late")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="flag-note">{t("hostReputation.note")}</Label>
            <Textarea
              id="flag-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("hostReputation.notePlaceholder")}
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
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              {t("hostReputation.saveFlag")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Compact inline tier badge for inbox rows.
export function HostTierBadge({ tier }: { tier: HostReputation["tier"] }) {
  const { t } = useTranslation("vendorTools");
  const meta = tierMeta[tier];
  const Icon = meta.Icon;
  const label = t(`hostReputation.tiers.${tier}`);
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 border ${meta.tone}`}
      title={t("hostReputation.tierTitle", { tier: label })}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

export type { HostReputation };
