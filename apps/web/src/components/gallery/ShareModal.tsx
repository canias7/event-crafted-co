// Create a shareable link for either a single gallery image or a
// whole album. Inserts a vendor_gallery_shares row with a fresh
// token (server-side default = encode(gen_random_bytes(16), 'hex'))
// and shows the resulting /g/:token URL with a copy button.

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Exactly one of these is set; the modal validates and the DB
  // CHECK constraint enforces too.
  imageId?: string;
  albumId?: string;
  targetLabel: string;
}

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never expires" },
  { value: "1d", label: "Expires in 1 day" },
  { value: "7d", label: "Expires in 7 days" },
  { value: "30d", label: "Expires in 30 days" },
];

export function ShareModal({
  open,
  onOpenChange,
  imageId,
  albumId,
  targetLabel,
}: Props) {
  const { user } = useAuth();
  const [expiry, setExpiry] = useState<string>("never");
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Reset state when the modal closes so a re-open starts fresh.
    if (!open) {
      setToken(null);
      setExpiry("never");
      setCopied(false);
    }
  }, [open]);

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/g/${token}`
    : "";

  async function create() {
    if (!user?.id) return;
    if (!imageId && !albumId) return;
    setCreating(true);
    const expires_at =
      expiry === "never"
        ? null
        : expiry === "1d"
          ? new Date(Date.now() + 86400_000).toISOString()
          : expiry === "7d"
            ? new Date(Date.now() + 7 * 86400_000).toISOString()
            : new Date(Date.now() + 30 * 86400_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_gallery_shares")
      .insert({
        user_id: user.id,
        image_id: imageId ?? null,
        album_id: albumId ?? null,
        expires_at,
      })
      .select("token")
      .single();
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setToken(data.token as string);
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — copy manually");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Share {imageId ? "image" : "album"}
          </DialogTitle>
          <DialogDescription>
            Anyone with this link can view {targetLabel}.
          </DialogDescription>
        </DialogHeader>

        {!token ? (
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground">
                Expiry
              </Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setExpiry(opt.value)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      expiry === opt.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card hover:bg-secondary/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Label className="text-xs font-medium text-muted-foreground">
              Share link
            </Label>
            <div className="flex items-center gap-2">
              <Input value={shareUrl} readOnly className="font-mono text-xs" />
              <Button onClick={copy} variant="outline" className="shrink-0">
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Revoke any time from the share's row in your gallery.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            {token ? "Done" : "Cancel"}
          </Button>
          {!token ? (
            <Button onClick={create} disabled={creating} className="rounded-full">
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create link
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
