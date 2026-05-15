import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Bulk-email dialog launched from the Guests page. Pushes the message
// through the send-transactional-email edge function so the rendered
// payload + delivery accounting goes through the same pipeline as
// system emails. Audience switches between attending / all / VIPs;
// each pill shows its current count so hosts can see what they're
// about to send before composing.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  attendingCount: number;
  allCount: number;
  vipCount: number;
}

export function BulkMessageDialog({
  open,
  onOpenChange,
  hostId,
  attendingCount,
  allCount,
  vipCount,
}: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"attending" | "all" | "vip">(
    "attending",
  );
  const [submitting, setSubmitting] = useState(false);

  const recipientCount =
    audience === "attending"
      ? attendingCount
      : audience === "vip"
        ? vipCount
        : allCount;

  async function send() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    if (recipientCount === 0) {
      toast.error("No guests in that audience have an email");
      return;
    }
    setSubmitting(true);
    const result = await supabase.functions.invoke(
      "send-transactional-email",
      {
        body: {
          kind: "guest_blast",
          hostId,
          subject: subject.trim(),
          body: body.trim(),
          audience: {
            rsvp_status: audience === "all" ? "all" : "attending",
            vip_only: audience === "vip",
          },
        },
      },
    );
    setSubmitting(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    const sent = (result.data as { sent?: number } | null)?.sent ?? 0;
    toast.success(
      `Email sent to ${sent} ${sent === 1 ? "guest" : "guests"}`,
    );
    setSubject("");
    setBody("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl">
            Message your guests
          </DialogTitle>
          <DialogDescription>
            Send a single email to a filtered audience. Only guests with an
            email address on file will receive it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Audience</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: "attending", label: "Attending", count: attendingCount },
                  { value: "all", label: "Everyone", count: allCount },
                  { value: "vip", label: "VIPs only", count: vipCount },
                ] as const
              ).map((opt) => {
                const active = audience === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAudience(opt.value)}
                    disabled={opt.count === 0}
                    className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background border-border hover:border-foreground/30 disabled:opacity-50"
                    }`}
                  >
                    {opt.label}
                    <span className="ml-1.5 tnum opacity-70">{opt.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="blast-subject">Subject</Label>
            <Input
              id="blast-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="An update on the wedding"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="blast-body">Message</Label>
            <Textarea
              id="blast-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Hi everyone, a quick update…"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Sending to <strong>{recipientCount}</strong>{" "}
            {recipientCount === 1 ? "guest" : "guests"}.
          </p>
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
            type="button"
            onClick={send}
            disabled={submitting || recipientCount === 0}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Send to {recipientCount}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
