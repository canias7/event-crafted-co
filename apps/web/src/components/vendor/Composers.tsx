// Composers shared between Vendor Home (global feed) and Vendor
// Profile (own content). Each composer mounts as a modal and either
// inserts into vendor_buzz or uploads media to vendor-posts /
// vendor-reels storage and inserts the corresponding row.

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-medium">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function BuzzComposerModal({
  userId,
  onClose,
  onPosted,
}: {
  userId: string;
  /** Optional. Pass to associate the buzz with a specific listing. */
  vendorId?: string | null;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const trimmed = text.trim();
  const MAX = 280;
  const canPost = trimmed.length > 0 && trimmed.length <= MAX && !posting;

  async function handlePost() {
    if (!canPost) return;
    setPosting(true);
    const { error } = await supabase.from("vendor_buzz").insert({
      user_id: userId,
      body: trimmed,
    });
    if (error) {
      setPosting(false);
      toast.error(`Couldn't post: ${error.message}`);
      return;
    }
    setText("");
    onPosted();
  }

  return (
    <ModalShell onClose={onClose} title="New buzz">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening?"
        maxLength={MAX}
        rows={5}
        className="resize-none"
        autoFocus
      />
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {trimmed.length}/{MAX}
        </span>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={posting}>
          Cancel
        </Button>
        <Button onClick={handlePost} disabled={!canPost}>
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
        </Button>
      </div>
    </ModalShell>
  );
}

export function MediaComposerModal({
  kind,
  userId,
  vendorId,
  onClose,
  onPosted,
}: {
  kind: "post" | "reel";
  userId: string;
  /** Optional. Pass to associate the media with a specific listing. */
  vendorId?: string | null;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrl = file ? URL.createObjectURL(file) : null;
  const accept = kind === "post" ? "image/*" : "video/*";
  const bucket = kind === "post" ? "vendor-posts" : "vendor-reels";
  const noun = kind === "post" ? "photo" : "video";

  async function handlePost() {
    if (!file) {
      toast.error(`Pick a ${noun} first`);
      return;
    }
    setPosting(true);
    try {
      const ext =
        file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ??
        (kind === "post" ? "jpg" : "mp4");
      const filename = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const path = `${userId}/${filename}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          contentType:
            file.type || (kind === "post" ? "image/jpeg" : "video/mp4"),
          upsert: false,
        });
      if (upErr) throw upErr;
      // Track the uploaded path so we can remove it if the metadata
      // INSERT fails. Without this, every DB-side failure leaves an
      // orphan file in the bucket.
      const uploadedPath = path;

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);

      try {
        if (kind === "post") {
          const { error: insErr } = await supabase.from("vendor_posts").insert({
            user_id: userId,
            image_url: pub.publicUrl,
            caption: caption.trim() || null,
          });
          if (insErr) throw insErr;
        } else {
          const { error: insErr } = await supabase.from("vendor_reels").insert({
            user_id: userId,
            video_url: pub.publicUrl,
            thumbnail_url: null,
            caption: caption.trim() || null,
          });
          if (insErr) throw insErr;
        }
      } catch (dbErr) {
        // DB write failed — undo the storage upload so we don't leak
        // files. Fire-and-forget the removal so the user still sees the
        // original error toast; if removal fails too, log and move on.
        supabase.storage
          .from(bucket)
          .remove([uploadedPath])
          .then(({ error: rmErr }) => {
            if (rmErr) {
              console.error(
                "[MediaComposer] failed to clean up orphan upload",
                uploadedPath,
                rmErr,
              );
            }
          });
        throw dbErr;
      }

      setCaption("");
      setFile(null);
      onPosted();
    } catch (err) {
      setPosting(false);
      const msg = (err as { message?: string })?.message ?? "Try again.";
      toast.error(`Couldn't post: ${msg}`);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      title={kind === "post" ? "New post" : "New reel"}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {previewUrl ? (
        <div className="relative overflow-hidden rounded-md bg-secondary/40 max-h-80">
          {kind === "post" ? (
            <img
              src={previewUrl}
              alt=""
              className="w-full max-h-80 object-contain"
            />
          ) : (
            <video src={previewUrl} controls className="w-full max-h-80" />
          )}
          <button
            onClick={() => setFile(null)}
            className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-card/40 p-12 text-muted-foreground hover:bg-card"
        >
          <ImagePlus className="h-8 w-8" />
          <span className="text-sm">Tap to pick a {noun}</span>
        </button>
      )}
      <Textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Add a caption (optional)"
        rows={3}
        className="mt-3 resize-none"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={posting}>
          Cancel
        </Button>
        <Button onClick={handlePost} disabled={!file || posting}>
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
        </Button>
      </div>
    </ModalShell>
  );
}
