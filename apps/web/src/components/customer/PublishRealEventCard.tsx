import { useEffect, useRef, useState } from "react";
import {
  Globe,
  Loader2,
  Image as ImageIcon,
  Upload,
  X,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { transformedImageUrl } from "@/lib/storage";

// Host-led "publish your event as a real event" flow. Lets a host
// (not a vendor) take their finished event and turn it into a public
// SEO landing page at /real-events/{slug}. Each row this creates:
//   - is permanent indexable content with a cover image + story
//   - shows the host's event credit info but redacts personal details
//   - links back into the marketplace (drives discovery)
//
// Storage: photos go to the event-microsites bucket where the host
// has write access (the vendor-portfolios bucket is vendor-write-only).
// The real_events.media_bucket column tracks which bucket each event
// uses so RealEventDetailPage knows where to read from.

const BUCKET = "event-microsites";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_GALLERY = 16;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface ExistingRealEvent {
  id: string;
  slug: string | null;
  title: string;
  intro: string | null;
  story: string | null;
  cover_path: string | null;
  gallery_paths: string[];
  published_at: string | null;
}

interface Props {
  /** Host's primary event (host_events row). Used to seed defaults. */
  event: {
    id: string;
    name: string | null;
    event_type: string | null;
    event_date: string | null;
    event_location: string | null;
  };
}

export function PublishRealEventCard({ event }: Props) {
  const { user } = useAuth();
  const [existing, setExisting] = useState<ExistingRealEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [story, setStory] = useState("");
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [galleryPaths, setGalleryPaths] = useState<string[]>([]);
  const [coverUploading, setCoverUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("real_events")
        .select(
          "id, slug, title, intro, story, cover_path, gallery_paths, published_at",
        )
        .eq("host_id", user.id)
        .eq("inquiry_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const row = data as ExistingRealEvent | null;
      if (row) {
        setExisting(row);
        setTitle(row.title);
        setIntro(row.intro ?? "");
        setStory(row.story ?? "");
        setCoverPath(row.cover_path);
        setGalleryPaths(row.gallery_paths ?? []);
      } else {
        // Seed defaults from the event row.
        setTitle(event.name ?? "Our event");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, event.id]);

  async function uploadCover(file: File) {
    if (!user) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("JPG, PNG, or WEBP only");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Max 8 MB");
      return;
    }
    setCoverUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${user.id}/realevent-cover-${event.id}-${crypto.randomUUID()}.${ext}`;
    if (coverPath) {
      // Best-effort cleanup of the previous cover.
      await supabase.storage.from(BUCKET).remove([coverPath]);
    }
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "3600" });
    setCoverUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCoverPath(path);
  }

  async function uploadGallery(files: FileList) {
    if (!user) return;
    const remaining = MAX_GALLERY - galleryPaths.length;
    if (remaining <= 0) {
      toast.error(`Max ${MAX_GALLERY} gallery photos`);
      return;
    }
    setGalleryUploading(true);
    const accepted = Array.from(files)
      .slice(0, remaining)
      .filter((f) => ACCEPTED.includes(f.type) && f.size <= MAX_BYTES);
    const newPaths: string[] = [];
    for (const file of accepted) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/realevent-${event.id}-${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "3600" });
      if (up.error) {
        toast.error(`${file.name}: ${up.error.message}`);
        continue;
      }
      newPaths.push(path);
    }
    setGalleryUploading(false);
    if (newPaths.length > 0) {
      setGalleryPaths((prev) => [...prev, ...newPaths]);
    }
  }

  async function removeGalleryPhoto(path: string) {
    await supabase.storage.from(BUCKET).remove([path]);
    setGalleryPaths((prev) => prev.filter((p) => p !== path));
  }

  async function publish() {
    if (!user) return;
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!coverPath) {
      toast.error("Add a cover image first");
      return;
    }
    setPublishing(true);

    let row = existing;
    if (!row) {
      // Create the row first so we have an id for slug generation.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insert = await (supabase as any)
        .from("real_events")
        .insert({
          host_id: user.id,
          title: title.trim(),
          intro: intro.trim() || null,
          story: story.trim() || null,
          cover_path: coverPath,
          gallery_paths: galleryPaths,
          event_type: event.event_type,
          event_date: event.event_date,
          location: event.event_location,
          media_bucket: BUCKET,
        })
        .select("id, slug, title, intro, story, cover_path, gallery_paths, published_at")
        .single();
      if (insert.error || !insert.data) {
        setPublishing(false);
        toast.error(insert.error?.message ?? "Couldn't save");
        return;
      }
      row = insert.data as ExistingRealEvent;
    }

    // Generate slug from title — server-side helper appends a hash to
    // disambiguate if multiple events share a title.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slugRes = await (supabase as any).rpc("generate_real_event_slug", {
      p_title: title.trim(),
      p_id: row.id,
    });
    const slug = (slugRes.data as string | null) ?? row.slug;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("real_events")
      .update({
        title: title.trim(),
        intro: intro.trim() || null,
        story: story.trim() || null,
        cover_path: coverPath,
        gallery_paths: galleryPaths,
        slug: slug ?? row.slug,
        published_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select(
        "id, slug, title, intro, story, cover_path, gallery_paths, published_at",
      )
      .single();
    setPublishing(false);
    if (error || !data) {
      toast.error(error?.message ?? "Couldn't publish");
      return;
    }
    setExisting(data as ExistingRealEvent);
    setEditing(false);
    toast.success("Published — your event is live");
  }

  async function unpublish() {
    if (!existing) return;
    setUnpublishing(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("real_events")
      .update({ published_at: null })
      .eq("id", existing.id);
    setUnpublishing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setExisting({ ...existing, published_at: null });
    toast.success("Unpublished");
  }

  if (loading) return null;

  const isLive = !!existing?.published_at && !!existing?.slug;
  const publicUrl = isLive ? `/real-events/${existing.slug}` : null;

  return (
    <div className="card-soft p-5 md:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-full bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
          <Globe className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-tight mb-1">
            Share your event with the world
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Publish your event as a public gallery — a permanent page on
            Vendora that doubles as inspiration for other hosts and a
            credit to the vendors you worked with.
          </p>
        </div>
      </div>

      {isLive && !editing && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-3 mb-4 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight mb-1">
              Live at vendora.app{publicUrl}
            </p>
            <p className="text-xs text-muted-foreground">
              Public visitors can view and share. Edit anytime; changes
              go live immediately.
            </p>
          </div>
        </div>
      )}

      {!editing && !isLive && (
        <Button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          <Globe className="w-3.5 h-3.5 mr-1.5" />
          Publish my event
        </Button>
      )}

      {!editing && isLive && (
        <div className="flex flex-wrap gap-2">
          <Link to={publicUrl ?? "#"} target="_blank">
            <Button variant="outline" size="sm" className="rounded-full">
              <ExternalLink className="w-3 h-3 mr-1.5" />
              View live
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            className="rounded-full"
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={unpublish}
            disabled={unpublishing}
            className="rounded-full text-muted-foreground"
          >
            {unpublishing ? "Unpublishing…" : "Unpublish"}
          </Button>
        </div>
      )}

      {editing && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="re-title">Title</Label>
            <Input
              id="re-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Our wedding at the Hudson farmhouse"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="re-intro">Short intro (optional)</Label>
            <Input
              id="re-intro"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="One-line teaser. 'A late-summer farmhouse weekend.'"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="re-story">Story (optional)</Label>
            <Textarea
              id="re-story"
              value={story}
              onChange={(e) => setStory(e.target.value)}
              rows={5}
              placeholder="A few paragraphs about how the day came together — what made it special, who you worked with, what you'd recommend to other hosts."
            />
          </div>

          {/* Cover */}
          <div className="space-y-2">
            <Label>Cover image</Label>
            {coverPath ? (
              <div className="relative aspect-[3/2] rounded-2xl overflow-hidden bg-muted">
                <img
                  src={transformedImageUrl(BUCKET, coverPath, { width: 1200 })}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/85 text-background text-xs hover:bg-foreground transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  Replace
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="w-full aspect-[3/2] border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-muted-foreground hover:border-foreground/30 transition-colors"
                disabled={coverUploading}
              >
                {coverUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <ImageIcon className="w-6 h-6 mb-2" />
                    <span className="text-sm">Upload a cover image</span>
                    <span className="text-xs mt-1">JPG / PNG / WEBP, up to 8 MB</span>
                  </>
                )}
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) uploadCover(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>

          {/* Gallery */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Gallery ({galleryPaths.length}/{MAX_GALLERY})</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => galleryInputRef.current?.click()}
                disabled={
                  galleryUploading || galleryPaths.length >= MAX_GALLERY
                }
                className="rounded-full"
              >
                {galleryUploading ? (
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="w-3 h-3 mr-1.5" />
                )}
                Add photos
              </Button>
              <input
                ref={galleryInputRef}
                type="file"
                accept={ACCEPTED.join(",")}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    uploadGallery(e.target.files);
                  }
                  e.target.value = "";
                }}
              />
            </div>
            {galleryPaths.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {galleryPaths.map((path) => (
                  <div
                    key={path}
                    className="relative aspect-square rounded-2xl overflow-hidden bg-muted group"
                  >
                    <img
                      src={transformedImageUrl(BUCKET, path, { width: 400 })}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeGalleryPhoto(path)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground/85 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                // Reset form to existing data (or seed defaults).
                if (existing) {
                  setTitle(existing.title);
                  setIntro(existing.intro ?? "");
                  setStory(existing.story ?? "");
                  setCoverPath(existing.cover_path);
                  setGalleryPaths(existing.gallery_paths ?? []);
                }
              }}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={publish}
              disabled={publishing || !title.trim() || !coverPath}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {publishing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Publishing…
                </>
              ) : isLive ? (
                "Save changes"
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5 mr-1.5" />
                  Publish
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
