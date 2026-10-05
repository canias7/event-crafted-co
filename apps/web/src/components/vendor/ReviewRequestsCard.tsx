import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Star,
  Send,
  Copy,
  Check,
  Mail,
  Loader2,
  RefreshCw,
} from "lucide-react";
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
} from "@/components/ui/dialog";

// Vendor-side review request manager. Sends a tokenized link to a
// past client; recipient hits /review/:token to leave a review
// without creating a Vendora account.
//
// We don't email from here — instead we surface the link for the
// vendor to copy and paste into their own follow-up email or text.
// (Lovable's Supabase auth handles transactional auth emails;
// generic outbound is out of scope for v1.)

interface ReviewRequest {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  token: string;
  status: "sent" | "completed" | "expired";
  sent_at: string;
  send_count: number;
  completed_at: string | null;
}

const STATUS_TONE: Record<ReviewRequest["status"], string> = {
  sent: "bg-accent/15 text-accent border-accent/30",
  completed: "bg-secondary text-secondary-foreground border-border",
  expired: "bg-secondary text-muted-foreground border-border",
};

// "May 3, 2026" in the vendor's language (formatDate's long style
// follows the browser's locale instead).
function longDate(input: string, language: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(language, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function ReviewRequestsCard({ vendorId }: { vendorId: string }) {
  const { t } = useTranslation("vendorTools");
  const [rows, setRows] = useState<ReviewRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("review_requests")
      .select(
        "id, recipient_email, recipient_name, token, status, sent_at, send_count, completed_at",
      )
      .eq("vendor_id", vendorId)
      .order("sent_at", { ascending: false })
      .limit(50);
    setRows((data as ReviewRequest[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
            <Star className="w-3 h-3" />
            {t("reviewRequests.title")}
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {t("reviewRequests.intro")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setSendOpen(true)}
          className="rounded-full"
        >
          <Send className="w-3 h-3 mr-1.5" />
          {t("reviewRequests.request")}
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-4">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-3">
          {t("reviewRequests.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <RequestRow
              key={r.id}
              r={r}
              vendorId={vendorId}
              onChange={load}
            />
          ))}
        </ul>
      )}

      <SendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        vendorId={vendorId}
        onSaved={load}
      />
    </div>
  );
}

function RequestRow({
  r,
  vendorId,
  onChange,
}: {
  r: ReviewRequest;
  vendorId: string;
  onChange: () => void;
}) {
  const { t, i18n } = useTranslation("vendorTools");
  const [copied, setCopied] = useState(false);
  const [acting, setActing] = useState(false);
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/review/${r.token}`
      : `/review/${r.token}`;

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success(t("common.linkCopied"));
    setTimeout(() => setCopied(false), 1800);
  }

  async function resend() {
    setActing(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("send_review_request", {
      p_vendor_id: vendorId,
      p_inquiry_id: null,
      p_recipient_email: r.recipient_email,
      p_recipient_name: r.recipient_name,
    });
    setActing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("reviewRequests.resent"));
    onChange();
  }

  return (
    <li className="card-soft p-3">
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-medium text-sm truncate">
              {r.recipient_name ?? r.recipient_email}
            </p>
            <Badge variant="outline" className={STATUS_TONE[r.status]}>
              {t(`reviewRequests.status.${r.status}`, { defaultValue: r.status })}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Mail className="w-2.5 h-2.5" />
            {r.recipient_email}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {t("reviewRequests.sentOn", { date: longDate(r.sent_at, i18n.language) })}
            {r.send_count > 1 && ` · ${r.send_count}×`}
            {r.completed_at &&
              ` · ${t("reviewRequests.completedOn", {
                date: longDate(r.completed_at, i18n.language),
              })}`}
          </p>
        </div>
        {r.status === "sent" && (
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full h-8"
              onClick={copyLink}
            >
              {copied ? (
                <Check className="w-3 h-3 mr-1.5" />
              ) : (
                <Copy className="w-3 h-3 mr-1.5" />
              )}
              {t("common.copyLink")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full h-8"
              onClick={resend}
              disabled={acting}
            >
              {acting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function SendDialog({
  open,
  onOpenChange,
  vendorId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation("vendorTools");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("send_review_request", {
      p_vendor_id: vendorId,
      p_inquiry_id: null,
      p_recipient_email: email,
      p_recipient_name: name || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("reviewRequests.created"));
    setEmail("");
    setName("");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {t("reviewRequests.dialogTitle")}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {t("reviewRequests.dialogBody")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="rr-email">{t("reviewRequests.clientEmail")}</Label>
            <Input
              id="rr-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-name">{t("reviewRequests.clientName")}</Label>
            <Input
              id="rr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={submitting || !email}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("reviewRequests.createLink")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
