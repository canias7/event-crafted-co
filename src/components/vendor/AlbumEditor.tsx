import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Upload,
  Globe,
  EyeOff,
  Copy,
  Check,
  X,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ACCEPTED,
  BUCKET,
  MAX_BYTES,
  MAX_PER_ALBUM,
  albumsTable,
  photosTable,
  type Album,
  type Photo,
} from "@/components/vendor/album-shared";

// Album editor dialog: title + description + bulk photo upload, cover
// selection, host-consent gate, publish + share-link copy. Pulls all
// state internally — parent passes the album to edit and gets back
// updated rows via onSaved (so the list view can re-render without
// refetching).

interface Props {
  album: Album;
  vendorId: string;
  onClose: () => void;
  onSaved: (a: Album) => void;
}

export function AlbumEditor({ album, vendorId, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description ?? "");
  const [downloadEnabled, setDownloadEnabled] = useState(album.download_enabled);
  const [hostConsent, setHostConsent] = useState(
    Boolean(album.host_consent_given_at),
  );
  const [coverPath, setCoverPath] = useState(album.cover_path);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadPhotos() {
    setLoadingPhotos(true);
    const { data } = await photosTable()
      .select("id, storage_path, caption, display_order, taken_at")
      .eq("album_id", album.id)
      .order("display_order", { ascending: true });
    setPhotos((data as Photo[]) ?? []);
    setLoadingPhotos(false);
  }

  useEffect(() => {
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album.id]);

  async function uploadFiles(fileList: FileList) {
    const remaining = MAX_PER_ALBUM - photos.length;
    const accepted = Array.from(fileList)
      .slice(0, remaining)
      .filter((f) => {
        if (!ACCEPTED.includes(f.type)) {
          toast.error(`${f.name}: only JPG, PNG, WEBP`);
          return false;
        }
        if (f.size > MAX_BYTES) {
          toast.error(`${f.name}: max 25 MB`);
          return false;
        }
        return true;
      });
    if (accepted.length === 0) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: accepted.length });
    let nextOrder =
      photos.reduce((m, p) => Math.max(m, p.display_order), -1) + 1;
    let firstUploaded: string | null = null;
    let succeeded = 0;
    for (const file of accepted) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const filename = `album-${album.id}-${crypto.randomUUID()}.${ext}`;
      const path = `${vendorId}/${filename}`;
      const up = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "3600" });
      if (up.error) {
        toast.error(`${file.name}: ${up.error.message}`);
        setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
        continue;
      }
      const ins = await photosTable().insert({
        album_id: album.id,
        storage_path: path,
        display_order: nextOrder++,
        // Best-effort: use the file's last-modified as taken_at.
        taken_at: file.lastModified
          ? new Date(file.lastModified).toISOString()
          : null,
      });
      if (ins.error) {
        await supabase.storage.from(BUCKET).remove([path]);
        toast.error(ins.error.message);
      } else {
        succeeded++;
        if (!firstUploaded) firstUploaded = path;
      }
      setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setUploading(false);

    // First upload doubles as cover if none set yet.
    if (succeeded > 0) {
      if (!coverPath && firstUploaded) {
        setCoverPath(firstUploaded);
        await albumsTable()
          .update({ cover_path: firstUploaded })
          .eq("id", album.id);
        onSaved({ ...album, cover_path: firstUploaded });
      }
      toast.success(`${succeeded} photo${succeeded === 1 ? "" : "s"} uploaded`);
      loadPhotos();
    }
  }

  async function deletePhoto(p: Photo) {
    await supabase.storage.from(BUCKET).remove([p.storage_path]);
    await photosTable().delete().eq("id", p.id);
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    if (coverPath === p.storage_path) {
      setCoverPath(null);
      await albumsTable().update({ cover_path: null }).eq("id", album.id);
      onSaved({ ...album, cover_path: null });
    }
  }

  async function setAsCover(p: Photo) {
    setCoverPath(p.storage_path);
    await albumsTable()
      .update({ cover_path: p.storage_path })
      .eq("id", album.id);
    onSaved({ ...album, cover_path: p.storage_path });
  }

  async function save(extra: Partial<Album> = {}) {
    setSaving(true);
    const update = {
      title: title.trim() || "Untitled album",
      description: description.trim() || null,
      download_enabled: downloadEnabled,
      host_consent_given_at: hostConsent
        ? album.host_consent_given_at ?? new Date().toISOString()
        : null,
      ...extra,
    };
    const { data, error } = await albumsTable()
      .update(update)
      .eq("id", album.id)
      .select(
        "id, title, description, share_token, cover_path, host_consent_given_at, published_at, download_enabled, inquiry_id, host_id, event_id, created_at",
      )
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return null;
    }
    onSaved(data as Album);
    return data as Album;
  }

  async function publish() {
    if (!hostConsent) {
      toast.error("Mark host consent before publishing");
      return;
    }
    if (photos.length === 0) {
      toast.error("Add at least one photo first");
      return;
    }
    const updated = await save({ published_at: new Date().toISOString() });
    if (updated) toast.success("Album published");
  }

  async function unpublish() {
    await save({ published_at: null });
    toast.success("Album unpublished");
  }

  async function copyShareLink() {
    if (!album.share_token) return;
    const url = `${window.location.origin}/album/${album.share_token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const isLive = Boolean(album.published_at && album.host_consent_given_at);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isLive ? "Edit live album" : "Edit album"}
          </DialogTitle>
          <DialogDescription>
            Upload, caption, publish, share. Photos render via short-lived
            signed URLs so unpublished albums stay private.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {isLive && (
            <div className="rounded-sm border border-accent/40 bg-accent/5 p-3 flex gap-2 items-center">
              <Input
                value={`${window.location.origin}/album/${album.share_token}`}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full shrink-0"
                onClick={copyShareLink}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          )}

          <div>
            <Label htmlFor="al-title">Title</Label>
            <Input
              id="al-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sarah & Marcus's wedding — full gallery"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="al-desc">Description (optional)</Label>
            <Textarea
              id="al-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A few notes for the host — total photos, delivery turnaround, anything else."
              className="mt-1.5"
            />
          </div>

          {/* Bulk uploader */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <Label>
                Photos ({photos.length}/{MAX_PER_ALBUM})
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || photos.length >= MAX_PER_ALBUM}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Uploading {uploadProgress.done}/{uploadProgress.total}
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    Add photos
                  </>
                )}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED.join(",")}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    uploadFiles(e.target.files);
                  }
                  e.target.value = "";
                }}
              />
            </div>
            {loadingPhotos ? (
              <div className="text-center text-xs text-muted-foreground py-6">
                Loading photos…
              </div>
            ) : photos.length === 0 ? (
              <div className="border border-dashed border-border rounded-sm p-8 text-center text-xs text-muted-foreground">
                No photos yet. JPG / PNG / WEBP, up to 25 MB each.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-96 overflow-y-auto p-1">
                {photos.map((p) => (
                  <PhotoTile
                    key={p.id}
                    photo={p}
                    isCover={coverPath === p.storage_path}
                    onSetCover={() => setAsCover(p)}
                    onDelete={() => deletePhoto(p)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex items-start justify-between gap-3 pt-3 border-t border-border">
            <div className="min-w-0">
              <p className="text-sm font-medium mb-1">Allow downloads</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Guests can download full-resolution originals from the public
                album page.
              </p>
            </div>
            <Switch
              checked={downloadEnabled}
              onCheckedChange={setDownloadEnabled}
            />
          </div>

          <div className="flex items-start justify-between gap-3 pt-3 border-t border-border">
            <div className="min-w-0">
              <p className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                Host has given consent
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Confirm the host is OK with this album being shared with their
                guests via the link. Required before publish.
              </p>
            </div>
            <Switch checked={hostConsent} onCheckedChange={setHostConsent} />
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2 sm:gap-2 flex-wrap">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="rounded-full"
          >
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => save()}
            disabled={saving}
            className="rounded-full"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
          {isLive ? (
            <Button
              type="button"
              variant="outline"
              onClick={unpublish}
              disabled={saving}
              className="rounded-full"
            >
              <EyeOff className="w-3.5 h-3.5 mr-1.5" />
              Unpublish
            </Button>
          ) : (
            <Button
              type="button"
              onClick={publish}
              disabled={saving}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <Globe className="w-3.5 h-3.5 mr-1.5" />
              Publish
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PhotoTile({
  photo,
  isCover,
  onSetCover,
  onDelete,
}: {
  photo: Photo;
  isCover: boolean;
  onSetCover: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(photo.storage_path, 60 * 60)
      .then(({ data }) => {
        if (cancelled) return;
        setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [photo.storage_path]);

  return (
    <div
      className={`aspect-square rounded-sm overflow-hidden bg-muted relative group ${
        isCover ? "ring-2 ring-accent" : ""
      }`}
    >
      {url && (
        <img
          src={url}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
        />
      )}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-foreground/40 transition-opacity flex items-center justify-center gap-1.5">
        {!isCover && (
          <button
            type="button"
            onClick={onSetCover}
            className="text-[10px] uppercase tracking-wide bg-background/85 text-foreground rounded-full px-2 py-1"
          >
            Cover
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="w-7 h-7 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
          aria-label="Delete photo"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {isCover && (
        <span className="absolute top-1 left-1 text-[9px] uppercase tracking-wide bg-accent text-accent-foreground rounded-full px-1.5 py-0.5">
          Cover
        </span>
      )}
    </div>
  );
}
