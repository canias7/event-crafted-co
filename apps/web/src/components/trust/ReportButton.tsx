import { useState } from "react";
import { Flag, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Universal "Report" button — drops onto any user-generated content
// surface. Inserts a row into content_reports for admin triage.
//
// We don't accept anonymous reports (too easy to abuse). Unsigned-in
// users see a sign-in nudge instead of the form.

export type ReportContentType =
  | "vendor_profile"
  | "review"
  | "direct_message"
  | "microsite"
  | "vendor_blog_post"
  | "editorial_article"
  | "mood_board"
  | "inquiry_message"
  | "real_event";

const REASON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "spam", label: "Spam or scam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "misleading", label: "False or misleading" },
  { value: "impersonation", label: "Impersonation" },
  { value: "copyright", label: "Copyright violation" },
  { value: "safety", label: "Safety concern" },
  { value: "other", label: "Other" },
];

export function ReportButton({
  contentType,
  contentId,
  variant = "ghost",
  size = "sm",
  label,
}: {
  contentType: ReportContentType;
  contentId: string;
  variant?: "ghost" | "outline" | "link";
  size?: "sm" | "icon" | "default";
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Report this content"
      >
        <Flag className={size === "icon" ? "w-3.5 h-3.5" : "w-3.5 h-3.5 mr-1.5"} />
        {size !== "icon" && (label ?? "Report")}
      </Button>
      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        contentType={contentType}
        contentId={contentId}
      />
    </>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  contentType,
  contentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: ReportContentType;
  contentId: string;
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !reason) return;
    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("content_reports").insert({
      reporter_id: user.id,
      content_type: contentType,
      content_id: contentId,
      reason,
      details: details.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      // 23505 = unique violation = already reported and still open
      if (error.code === "23505") {
        toast.info("You've already reported this. Our team is reviewing.");
        onOpenChange(false);
        return;
      }
      toast.error(error.message);
      return;
    }
    setDone(true);
  }

  function close() {
    onOpenChange(false);
    // Reset state after the close animation.
    setTimeout(() => {
      setReason("");
      setDetails("");
      setDone(false);
    }, 200);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl inline-flex items-center gap-2">
            <Flag className="w-5 h-5" />
            Report content
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Reports go to our trust & safety team. We review every one
            and take action when warranted. Reporters are kept private.
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="py-4 text-sm text-muted-foreground">
            You need to be signed in to report content.{" "}
            <a href="/login" className="text-accent hover:underline">
              Sign in
            </a>
          </div>
        ) : done ? (
          <div className="py-6 text-center">
            <ShieldCheck className="w-10 h-10 text-accent mx-auto mb-3" />
            <p className="font-display text-xl mb-2">Thanks for the report</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We'll review this within 24 hours. If we take action, you'll
              hear back via email.
            </p>
            <Button
              type="button"
              onClick={close}
              className="mt-5 rounded-full"
              variant="outline"
            >
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="r-reason">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="r-reason">
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-details">More context (optional)</Label>
              <Textarea
                id="r-details"
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="What should we look at? Any specific examples?"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={close}
                disabled={submitting}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !reason}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit report
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
