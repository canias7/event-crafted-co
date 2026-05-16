import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  Upload,
  X,
  Globe,
  EyeOff,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { vendorImageUrl } from "@/lib/storage";

const BUCKET = "vendor-portfolios";
const MAX_GALLERY = 24;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface RealEvent {
  id: string;
  slug: string | null;
  title: string;
  intro: string | null;
  story: string | null;
  cover_path: string | null;
  gallery_paths: string[];
  event_type: string | null;
  event_date: string | null;
  location: string | null;
  host_consent_given_at: string | null;
  published_at: string | null;
  created_at: string;
}

const EVENT_TYPES = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "holiday_dinner", label: "Holiday Dinner" },
  { value: "other", label: "Other" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventsTable = () => (supabase as any).from("real_events");

export function RealEventsManager({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const [events, setEvents] = useState<RealEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorEvent, setEditorEvent] = useState<RealEvent | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await eventsTable()
      .select(
        "id, slug, title, intro, story, cover_path, gallery_paths, event_type, event_date, location, host_consent_given_at, published_at, created_at",
      )
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });
    setEvents((data as RealEvent[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function createDraft() {
    setCreating(true);
    const { data, error } = await eventsTable()
      .insert({
        vendor_id: vendorId,
        title: "Untitled event",
      })
      .select(
        "id, slug, title, intro, story, cover_path, gallery_paths, event_type, event_date, location, host_consent_given_at, published_at, created_at",
      )
      .single();
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEvents((p) => [data as RealEvent, ...p]);
    setEditorEvent(data as RealEvent);
  }

  async function deleteEvent(id: string) {
    const { error } = await eventsTable().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEvents((p) => p.filter((e) => e.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-label text-muted-foreground">Real events</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-xl">
            Publish a completed event as a short editorial gallery on
            Vendora. Becomes social proof on your profile + a discoverable
            page that ranks for the event type and city. Only public after
            you confirm the host has given consent.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={createDraft}
            disabled={creating}
            className="rounded-full"
          >
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            New event
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground text-sm py-6">
          Loading…
        </div>
      ) : events.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-10 text-center">
          <Sparkles className="w-7 h-7 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium mb-1">
            No published events yet
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            One real-event page does more for you than ten static portfolio
            shots — hosts get to see the full arc of an evening.
          </p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {events.map((e) => (
            <li
              key={e.id}
              className="card-soft overflow-hidden flex flex-col"
            >
              <div className="aspect-[16/10] bg-muted relative">
                {e.cover_path ? (
                  <img
                    src={vendorImageUrl(e.cover_path, { width: 800 })}
                    alt={e.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground/40 text-xs">
                    No cover yet
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  {e.published_at && e.host_consent_given_at ? (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-accent text-accent-foreground rounded-full px-2 py-0.5">
                      <Globe className="w-3 h-3" />
                      Live
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-secondary text-muted-foreground rounded-full px-2 py-0.5">
                      <EyeOff className="w-3 h-3" />
                      Draft
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <p className="font-display text-base leading-tight line-clamp-1">
                  {e.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                  {e.event_type?.replace("_", " ") ?? "Event"}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditorEvent(e)}
                      className="h-7 rounded-full text-xs"
                    >
                      Edit
                    </Button>
                  )}
                  {e.slug && e.published_at && e.host_consent_given_at && (
                    <Link
                      to={`/real-events/${e.slug}`}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View
                    </Link>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteEvent(e.id)}
                      className="h-7 w-7 ml-auto text-muted-foreground hover:text-destructive"
                      aria-label="Delete event"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editorEvent && (
        <Editor
          event={editorEvent}
          vendorId={vendorId}
          onClose={() => setEditorEvent(null)}
          onSaved={(updated) => {
            setEvents((p) => p.map((e) => (e.id === updated.id ? updated : e)));
            setEditorEvent(updated);
          }}
        />
      )}
    </div>
  );
}

function Editor({
  event,
  vendorId,
  onClose,
  onSaved,
}: {
  event: RealEvent;
  vendorId: string;
  onClose: () => void;
  onSaved: (e: RealEvent) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [intro, setIntro] = useState(event.intro ?? "");
  const [story, setStory] = useState(event.story ?? "");
  const [eventType, setEventType] = useState(event.event_type ?? "wedding");
  const [eventDate, setEventDate] = useState(event.event_date ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [coverPath, setCoverPath] = useState(event.cover_path);
  const [gallery, setGallery] = useState<string[]>(event.gallery_paths ?? []);
  const [hostConsent, setHostConsent] = useState(
    Boolean(event.host_consent_given_at),
  );
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File): Promise<string | null> {
    if (!ACCEPTED.includes(file.type)) {
      toast.error(`${file.name}: only JPG, PNG, WEBP`);
      return null;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name}: max 5 MB`);
      return null;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${vendorId}/event-${event.id}-${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "3600" });
    if (up.error) {
      toast.error(up.error.message);
      return null;
    }
    return path;
  }

  async function handleCover(file: File) {
    const path = await uploadOne(file);
    if (!path) return;
    if (coverPath) {
      await supabase.storage.from(BUCKET).remove([coverPath]);
    }
    setCoverPath(path);
  }

  async function handleGallery(files: FileList) {
    const remaining = MAX_GALLERY - gallery.length;
    if (remaining <= 0) {
      toast.error(`Max ${MAX_GALLERY} gallery photos`);
      return;
    }
    const accepted = Array.from(files).slice(0, remaining);
    const uploaded: string[] = [];
    for (const f of accepted) {
      const p = await uploadOne(f);
      if (p) uploaded.push(p);
    }
    if (uploaded.length > 0) {
      setGallery((prev) => [...prev, ...uploaded]);
    }
  }

  async function removeGalleryAt(idx: number) {
    const path = gallery[idx];
    await supabase.storage.from(BUCKET).remove([path]);
    setGallery((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save(extra: Partial<RealEvent> = {}) {
    setSaving(true);
    const update = {
      title: title.trim() || "Untitled event",
      intro: intro.trim() || null,
      story: story.trim() || null,
      event_type: eventType,
      event_date: eventDate || null,
      location: location.trim() || null,
      cover_path: coverPath,
      gallery_paths: gallery,
      host_consent_given_at: hostConsent
        ? event.host_consent_given_at ?? new Date().toISOString()
        : null,
      ...extra,
    };
    const { data, error } = await eventsTable()
      .update(update)
      .eq("id", event.id)
      .select(
        "id, slug, title, intro, story, cover_path, gallery_paths, event_type, event_date, location, host_consent_given_at, published_at, created_at",
      )
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return null;
    }
    onSaved(data as RealEvent);
    return data as RealEvent;
  }

  async function publish() {
    if (!hostConsent) {
      toast.error("Mark host consent before publishing");
      return;
    }
    if (!coverPath) {
      toast.error("Add a cover image first");
      return;
    }
    setPublishing(true);

    // Generate slug server-side (idempotent — uses event id hash).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slugRes = await (supabase as any).rpc(
      "generate_real_event_slug",
      { p_title: title.trim() || "event", p_id: event.id },
    );
    const slug = slugRes.data as string | null;

    const updated = await save({
      slug: slug ?? event.slug,
      published_at: new Date().toISOString(),
    });
    setPublishing(false);
    if (updated) toast.success("Event published");
  }

  async function unpublish() {
    setPublishing(true);
    await save({ published_at: null });
    setPublishing(false);
    toast.success("Event unpublished");
  }

  const isLive = Boolean(event.published_at && event.host_consent_given_at);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isLive ? "Edit live event" : "Edit draft"}
          </DialogTitle>
          <DialogDescription>
            Tell the story of the evening. Fields auto-save when you tap
            Save; published events show up at /real-events/{event.slug ?? "…"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Cover */}
          <div>
            <Label>Cover image</Label>
            <div className="mt-1.5 aspect-[16/9] rounded-sm bg-muted overflow-hidden relative">
              {coverPath ? (
                <img
                  src={vendorImageUrl(coverPath, { width: 1200 })}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                  No cover
                </div>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="absolute bottom-2 right-2 rounded-full"
                onClick={() => coverRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {coverPath ? "Replace" : "Upload"}
              </Button>
              <input
                ref={coverRef}
                type="file"
                accept={ACCEPTED.join(",")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCover(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="re-type">Event type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger id="re-type" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="re-date">Event date</Label>
              <Input
                id="re-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="re-title">Title</Label>
            <Input
              id="re-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sarah & Marcus, a brownstone garden wedding"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="re-location">Location</Label>
            <Input
              id="re-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Brooklyn, NY"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="re-intro">Intro (1 sentence)</Label>
            <Input
              id="re-intro"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="An intimate 60-guest celebration on a perfect October evening."
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="re-story">Story</Label>
            <Textarea
              id="re-story"
              rows={6}
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="A few paragraphs about the day — the design vision, the moments that mattered, what made the event special."
              className="mt-1.5"
            />
          </div>

          {/* Gallery */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Gallery ({gallery.length}/{MAX_GALLERY})</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full h-7 text-xs"
                onClick={() => galleryRef.current?.click()}
                disabled={gallery.length >= MAX_GALLERY}
              >
                <Upload className="w-3 h-3 mr-1.5" />
                Add photos
              </Button>
              <input
                ref={galleryRef}
                type="file"
                accept={ACCEPTED.join(",")}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleGallery(e.target.files);
                  }
                  e.target.value = "";
                }}
              />
            </div>
            {gallery.length === 0 ? (
              <div className="border border-dashed border-border rounded-sm p-6 text-center text-xs text-muted-foreground">
                No gallery photos yet
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {gallery.map((p, i) => (
                  <div
                    key={p}
                    className="aspect-square rounded-sm overflow-hidden bg-muted relative group"
                  >
                    <img
                      src={vendorImageUrl(p, { width: 400, height: 400 })}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeGalleryAt(i)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-foreground/85 text-background flex items-center justify-center opacity-0 group-hover:opacity-100"
                      aria-label="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Host consent */}
          <div className="flex items-start justify-between gap-3 pt-3 border-t border-border">
            <div className="min-w-0">
              <p className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                Host has given consent
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Confirm the host is OK with this event being published
                publicly. Required before publish.
              </p>
            </div>
            <Switch
              checked={hostConsent}
              onCheckedChange={setHostConsent}
            />
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
            disabled={saving || publishing}
            className="rounded-full"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save draft
          </Button>
          {isLive ? (
            <Button
              type="button"
              variant="outline"
              onClick={unpublish}
              disabled={publishing}
              className="rounded-full"
            >
              {publishing && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              <EyeOff className="w-3.5 h-3.5 mr-1.5" />
              Unpublish
            </Button>
          ) : (
            <Button
              type="button"
              onClick={publish}
              disabled={publishing || saving}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {publishing && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              <Globe className="w-3.5 h-3.5 mr-1.5" />
              Publish
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
