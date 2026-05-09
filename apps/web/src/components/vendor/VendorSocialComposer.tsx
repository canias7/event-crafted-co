import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export type SocialKind = "post" | "reel" | "buzz";

const BUZZ_LIMIT = 280;

const TITLES: Record<SocialKind, string> = {
  post: "New post",
  reel: "New reel",
  buzz: "New buzz",
};

export function VendorSocialComposer({
  open,
  kind,
  vendorId,
  userId,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  kind: SocialKind;
  vendorId: string;
  userId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setCaption("");
    }
  }, [open]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isMedia = kind !== "buzz";
  const accept = kind === "reel" ? "video/*" : "image/*";
  const bucket = kind === "reel" ? "vendor-reels" : "vendor-posts";

  async function handleSubmit() {
    if (busy) return;
    if (kind === "buzz") {
      const body = caption.trim();
      if (!body) {
        toast.error("Write something first");
        return;
      }
      if (body.length > BUZZ_LIMIT) {
        toast.error(`Keep buzz under ${BUZZ_LIMIT} characters`);
        return;
      }
      setBusy(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("vendor_buzz").insert({
        body,
        vendor_id: vendorId,
        user_id: userId,
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Buzz posted");
      onCreated();
      onOpenChange(false);
      return;
    }

    if (!file) {
      toast.error(`Pick a ${kind === "reel" ? "video" : "photo"} first`);
      return;
    }
    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || (kind === "reel" ? "mp4" : "jpg");
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const upload = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (upload.error) {
      setBusy(false);
      toast.error(upload.error.message);
      return;
    }
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    const row =
      kind === "reel"
        ? {
            video_url: publicUrl,
            caption: caption.trim() || null,
            vendor_id: vendorId,
            user_id: userId,
          }
        : {
            image_url: publicUrl,
            caption: caption.trim() || null,
            vendor_id: vendorId,
            user_id: userId,
          };
    const table = kind === "reel" ? "vendor_reels" : "vendor_posts";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from(table).insert(row);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(kind === "reel" ? "Reel posted" : "Post shared");
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLES[kind]}</DialogTitle>
        </DialogHeader>

        {isMedia && (
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-square rounded-md border border-dashed border-border bg-secondary/30 flex items-center justify-center overflow-hidden hover:bg-secondary/50 transition-colors"
            >
              {preview ? (
                kind === "reel" ? (
                  <video
                    src={preview}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    autoPlay
                    loop
                  />
                ) : (
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                )
              ) : (
                <div className="flex flex-col items-center text-muted-foreground">
                  {kind === "reel" ? (
                    <Video className="w-8 h-8 mb-2" />
                  ) : (
                    <ImageIcon className="w-8 h-8 mb-2" />
                  )}
                  <span className="text-sm">
                    Click to choose {kind === "reel" ? "a video" : "a photo"}
                  </span>
                </div>
              )}
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={
              kind === "buzz"
                ? "Share an update with your followers"
                : "Add a caption (optional)"
            }
            rows={kind === "buzz" ? 5 : 3}
            maxLength={kind === "buzz" ? BUZZ_LIMIT : 2200}
          />
          {kind === "buzz" && (
            <p className="text-xs text-muted-foreground text-right">
              {caption.length}/{BUZZ_LIMIT}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {kind === "buzz" ? "Post buzz" : kind === "reel" ? "Share reel" : "Share"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
