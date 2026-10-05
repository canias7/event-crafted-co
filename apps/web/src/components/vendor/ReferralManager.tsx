import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

// Labels: vendorTools referrals.status.<status>.
const statusBadge: Record<string, { className: string }> = {
  pending: {
    className: "bg-secondary text-muted-foreground border border-border",
  },
  signed_up: {
    className: "bg-accent/15 text-accent border border-accent/30",
  },
  first_booking: {
    className: "bg-accent text-accent-foreground border border-accent",
  },
  rewarded: {
    className: "bg-foreground text-background border border-foreground",
  },
  expired: {
    className: "bg-muted text-muted-foreground border border-border",
  },
};

const refsTable = () => supabase.from("vendor_referrals");

export function ReferralManager({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation("vendorTools");
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
      toast.error(t("referrals.invalidEmail"));
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
    const link = `${window.location.origin}/signup?ref=${code}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success(t("referrals.linkCopiedSend"));
    setOpen(false);
    setEmail("");
    load();
  }

  function copyLink(code: string) {
    const link = `${window.location.origin}/signup?ref=${code}`;
    navigator.clipboard.writeText(link).then(
      () => toast.success(t("common.linkCopied")),
      () => toast.error(t("referrals.couldntCopy")),
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
          <p className="font-label text-muted-foreground">{t("referrals.title")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("referrals.intro")}
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
                {t("referrals.sendInvite")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("referrals.dialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("referrals.dialogBody")}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={send} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ref-email">{t("referrals.theirEmail")}</Label>
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
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={sending}
                  >
                    {sending && (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    )}
                    {t("referrals.generateLink")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground text-sm py-6">
          {t("common.loading")}
        </div>
      ) : refs.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-6 text-center">
          <Sparkles className="w-6 h-6 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            {t("referrals.emptyBody")}
          </p>
        </div>
      ) : (
        <div className="card-soft divide-y divide-border">
          {refs.map((r) => {
            const badgeStatus = statusBadge[r.status] ? r.status : "pending";
            const badge = statusBadge[badgeStatus];
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
                    {t("referrals.sentExpires", {
                      sent: new Date(r.created_at).toLocaleDateString(i18n.language),
                      expires: new Date(r.expires_at).toLocaleDateString(i18n.language),
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={badge.className}>
                    {t(`referrals.status.${badgeStatus}`)}
                  </Badge>
                  {r.status === "pending" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs rounded-full"
                        onClick={() => copyLink(r.referral_code)}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        {t("common.copyLink")}
                      </Button>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={deletingId === r.id}
                          onClick={() => deleteRef(r.id)}
                          aria-label={t("referrals.cancelReferral")}
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
