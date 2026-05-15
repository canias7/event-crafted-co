import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Globe,
  EyeOff,
  Copy,
  Check,
  Upload,
  Sparkles,
  Image as ImageIcon,
  Trash2,
  GripVertical,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { transformedImageUrl } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { EVENT_HUB_TABS } from "@/data/hubTabs";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { customerNavItems as navItems } from "@/data/navItems";
import { MicrositeRsvpResponsesCard } from "@/components/microsite/MicrositeRsvpResponsesCard";

const BUCKET = "event-microsites";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_GALLERY = 24;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface Event {
  id: string;
  name: string | null;
  event_type: string;
  event_date: string | null;
  event_location: string | null;
  microsite_token: string | null;
  microsite_published_at: string | null;
  microsite_title: string | null;
  microsite_subtitle: string | null;
  microsite_story: string | null;
  microsite_cover_path: string | null;
  microsite_theme: string;
  microsite_show_schedule: boolean;
  microsite_show_rsvp: boolean;
  microsite_show_registry: boolean;
  microsite_show_gifts: boolean;
  microsite_show_gallery: boolean;
}

interface Photo {
  id: string;
  storage_path: string;
  caption: string | null;
  display_order: number;
}

// 14 microsite themes covering the spectrum of event types — wedding,
// birthday, holiday, corporate, baby shower, anniversary. Adding a new
// theme here also requires adding the matching palette to the THEMES
// record in EventMicrositePage.tsx.
const THEMES: Array<{ id: string; label: string; preview: string }> = [
  // — Romantic / wedding-leaning —
  { id: "classic", label: "Classic", preview: "from-stone-900 to-stone-700" },
  { id: "rose", label: "Rose", preview: "from-rose-900 to-rose-700" },
  { id: "ivory", label: "Ivory & Blush", preview: "from-rose-300 to-amber-200" },
  { id: "garden", label: "Garden", preview: "from-emerald-700 to-lime-500" },
  { id: "sage", label: "Sage", preview: "from-emerald-900 to-emerald-700" },
  { id: "champagne", label: "Champagne", preview: "from-amber-900 to-yellow-700" },
  // — Evening / formal —
  { id: "dusk", label: "Dusk", preview: "from-indigo-900 to-purple-700" },
  { id: "midnight", label: "Midnight", preview: "from-slate-900 to-blue-900" },
  { id: "starlit", label: "Starlit", preview: "from-slate-950 to-amber-700" },
  // — Festive / birthday / casual —
  { id: "confetti", label: "Confetti", preview: "from-pink-500 to-violet-500" },
  { id: "sunset", label: "Sunset", preview: "from-orange-600 to-rose-500" },
  // — Holiday / winter —
  { id: "evergreen", label: "Evergreen", preview: "from-green-900 to-red-800" },
  // — Baby shower / soft pastels —
  { id: "powder", label: "Powder", preview: "from-sky-200 to-pink-200" },
  // — Corporate / minimal —
  { id: "monochrome", label: "Monochrome", preview: "from-zinc-900 to-zinc-600" },
];

const EVENT_DEFAULTS: Record<string, { title: string; subtitle: string }> = {
  wedding: { title: "Our wedding", subtitle: "is almost here" },
  birthday: { title: "A milestone birthday", subtitle: "is coming up" },
  holiday_dinner: { title: "Our holiday gathering", subtitle: "is around the corner" },
  other: { title: "Our event", subtitle: "is almost here" },
};

function publicUrl(
  path: string,
  opts?: { width?: number; quality?: number },
) {
  return transformedImageUrl(BUCKET, path, opts);
}

export default function MicrositeEditorPage() {
  const { user } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [coverUploading, setCoverUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!user) return;
    setLoading(true);

    const { data: prof } = await supabase
      .from("profiles")
      .select("active_event_id")
      .eq("id", user.id)
      .maybeSingle();
    const eventId = (prof as { active_event_id: string | null } | null)
      ?.active_event_id;
    if (!eventId) {
      setEvent(null);
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ev } = await (supabase as any)
      .from("host_events")
      .select(
        "id, name, event_type, event_date, event_location, microsite_token, microsite_published_at, microsite_title, microsite_subtitle, microsite_story, microsite_cover_path, microsite_theme, microsite_show_schedule, microsite_show_rsvp, microsite_show_registry, microsite_show_gifts, microsite_show_gallery",
      )
      .eq("id", eventId)
      .maybeSingle();
    setEvent(ev as Event | null);

    if (ev) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ph } = await (supabase as any)
        .from("event_microsite_photos")
        .select("id, storage_path, caption, display_order")
        .eq("event_id", (ev as Event).id)
        .order("display_order", { ascending: true });
      setPhotos((ph as Photo[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function update(patch: Partial<Event>) {
    if (!event) return;
    setSaving(true);
    // Optimistic.
    setEvent({ ...event, ...patch });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("host_events")
      .update(patch)
      .eq("id", event.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      load(); // rollback
    }
  }

  async function uploadCover(file: File) {
    if (!event || !user) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("JPG, PNG, or WEBP only");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Max 5 MB");
      return;
    }
    setCoverUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${user.id}/cover-${event.id}-${crypto.randomUUID()}.${ext}`;
    if (event.microsite_cover_path) {
      await supabase.storage.from(BUCKET).remove([event.microsite_cover_path]);
    }
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "3600" });
    if (error) {
      setCoverUploading(false);
      toast.error(error.message);
      return;
    }
    await update({ microsite_cover_path: path });
    setCoverUploading(false);
  }

  async function uploadGallery(files: FileList) {
    if (!event || !user) return;
    const remaining = MAX_GALLERY - photos.length;
    if (remaining <= 0) {
      toast.error(`Max ${MAX_GALLERY} gallery photos`);
      return;
    }
    setGalleryUploading(true);
    const accepted = Array.from(files)
      .slice(0, remaining)
      .filter((f) => ACCEPTED.includes(f.type) && f.size <= MAX_BYTES);
    let nextOrder =
      photos.reduce((m, p) => Math.max(m, p.display_order), -1) + 1;
    for (const file of accepted) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/gallery-${event.id}-${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "3600" });
      if (up.error) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("event_microsite_photos")
        .insert({
          event_id: event.id,
          storage_path: path,
          display_order: nextOrder++,
        });
    }
    setGalleryUploading(false);
    load();
  }

  async function deletePhoto(p: Photo) {
    await supabase.storage.from(BUCKET).remove([p.storage_path]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("event_microsite_photos")
      .delete()
      .eq("id", p.id);
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
  }

  async function publish() {
    if (!event) return;
    if (!event.microsite_cover_path) {
      toast.error("Add a cover image first");
      return;
    }
    // A microsite with a cover image but no title/subtitle/story is
    // visually broken — the cover loads but the page is empty. Force
    // the minimum content set before allowing publish.
    const title = (event.microsite_title ?? "").trim();
    const subtitle = (event.microsite_subtitle ?? "").trim();
    if (!title) {
      toast.error("Add a title before publishing");
      return;
    }
    if (!subtitle) {
      toast.error("Add a subtitle before publishing");
      return;
    }
    await update({ microsite_published_at: new Date().toISOString() });
    toast.success("Microsite published");
  }

  async function unpublish() {
    if (!event) return;
    await update({ microsite_published_at: null });
    toast.success("Microsite unpublished");
  }

  async function copyShareLink() {
    if (!event?.microsite_token) return;
    const url = `${window.location.origin}/e/${event.microsite_token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar items={navItems} title="Customer" backPath="/" />
        <main className="flex-1 p-8 max-w-3xl space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="aspect-[16/9] w-full rounded-sm" />
          <Skeleton className="h-32 w-full rounded-sm" />
        </main>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar items={navItems} title="Customer" backPath="/" />
        <main className="flex-1 p-8 text-center max-w-md mx-auto pt-20">
          <Sparkles className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
          <h1 className="font-editorial text-3xl mb-2">No active event yet</h1>
          <p className="text-muted-foreground mb-6">
            Set up an event from your dashboard, then come back to build a
            microsite for your guests.
          </p>
          <Link to="/customer/dashboard">
            <Button className="rounded-full">Go to dashboard</Button>
          </Link>
        </main>
      </div>
    );
  }

  const defaults = EVENT_DEFAULTS[event.event_type] ?? EVENT_DEFAULTS.other;
  const isLive = Boolean(event.microsite_published_at);
  const shareUrl = event.microsite_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/e/${event.microsite_token}`
    : "";

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-editorial text-3xl">Event microsite</h1>
              <p className="text-sm text-muted-foreground">
                One link for your guests — countdown, story, schedule, RSVP, registry.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isLive ? (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-accent text-accent-foreground rounded-full px-2 py-1">
                  <Globe className="w-3 h-3" />
                  Live
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-secondary text-muted-foreground rounded-full px-2 py-1">
                  <EyeOff className="w-3 h-3" />
                  Draft
                </span>
              )}
              {isLive ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={unpublish}
                  disabled={saving}
                >
                  <EyeOff className="w-3.5 h-3.5 mr-1.5" />
                  Unpublish
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                  onClick={publish}
                  disabled={saving}
                >
                  <Globe className="w-3.5 h-3.5 mr-1.5" />
                  Publish
                </Button>
              )}
            </div>
          </div>
          <SubNavTabs tabs={EVENT_HUB_TABS} />
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-8">
          {/* Share link */}
          {isLive && (
            <div className="rounded-sm border border-accent/40 bg-accent/5 p-4">
              <p className="font-label text-accent mb-2">Share with your guests</p>
              <div className="flex gap-2 items-center">
                <Input
                  value={shareUrl}
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
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Copy
                    </>
                  )}
                </Button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border hover:border-foreground/30 transition-colors shrink-0"
                  aria-label="Open in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Cover */}
          <section>
            <Label>Cover image</Label>
            <div className="mt-1.5 aspect-[16/9] rounded-sm bg-muted overflow-hidden relative">
              {event.microsite_cover_path ? (
                <img
                  src={publicUrl(event.microsite_cover_path, { width: 1200 })}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground/50">
                  <ImageIcon className="w-10 h-10" />
                </div>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="absolute bottom-2 right-2 rounded-full"
                onClick={() => coverRef.current?.click()}
                disabled={coverUploading}
              >
                {coverUploading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                )}
                {event.microsite_cover_path ? "Replace" : "Upload"}
              </Button>
              <input
                ref={coverRef}
                type="file"
                accept={ACCEPTED.join(",")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadCover(f);
                  e.target.value = "";
                }}
              />
            </div>
          </section>

          {/* Title / subtitle / story */}
          <section className="space-y-4">
            <div>
              <Label htmlFor="ms-title">Headline</Label>
              <Input
                id="ms-title"
                value={event.microsite_title ?? ""}
                onChange={(e) => setEvent({ ...event, microsite_title: e.target.value })}
                onBlur={() =>
                  update({ microsite_title: event.microsite_title?.trim() || null })
                }
                placeholder={defaults.title}
                className="mt-1.5 font-display text-lg"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank to use the default for {event.event_type.replace("_", " ")}.
              </p>
            </div>
            <div>
              <Label htmlFor="ms-sub">Subtitle</Label>
              <Input
                id="ms-sub"
                value={event.microsite_subtitle ?? ""}
                onChange={(e) =>
                  setEvent({ ...event, microsite_subtitle: e.target.value })
                }
                onBlur={() =>
                  update({
                    microsite_subtitle: event.microsite_subtitle?.trim() || null,
                  })
                }
                placeholder={defaults.subtitle}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="ms-story">Your story</Label>
              <Textarea
                id="ms-story"
                rows={6}
                value={event.microsite_story ?? ""}
                onChange={(e) =>
                  setEvent({ ...event, microsite_story: e.target.value })
                }
                onBlur={() =>
                  update({ microsite_story: event.microsite_story?.trim() || null })
                }
                placeholder="A few paragraphs about the event — how you got here, what guests should expect, anything you want to share."
                className="mt-1.5"
              />
            </div>
          </section>

          {/* Theme */}
          <section>
            <Label>Theme</Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-1.5">
              {THEMES.map((t) => {
                const active = event.microsite_theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => update({ microsite_theme: t.id })}
                    className={`rounded-sm border p-1.5 transition-colors text-left ${
                      active
                        ? "border-foreground"
                        : "border-border hover:border-foreground/40"
                    }`}
                    aria-pressed={active}
                  >
                    <div
                      className={`h-8 rounded-sm bg-gradient-to-br ${t.preview}`}
                    />
                    <p className="text-[10px] mt-1 text-center font-medium">
                      {t.label}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section toggles */}
          <section>
            <Label>Sections</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Hide what you don't want guests to see. Hidden sections aren't
              fetched at all on the public page.
            </p>
            <div className="space-y-3 card-soft p-4">
              {[
                { key: "microsite_show_schedule", label: "Schedule / run-of-show" },
                { key: "microsite_show_rsvp", label: "RSVP form" },
                { key: "microsite_show_registry", label: "Registry links" },
                { key: "microsite_show_gifts", label: "Group gifts" },
                { key: "microsite_show_gallery", label: "Photo gallery" },
              ].map((row) => {
                const k = row.key as keyof Event;
                return (
                  <div
                    key={row.key}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm">{row.label}</span>
                    <Switch
                      checked={Boolean(event[k])}
                      onCheckedChange={(v) =>
                        update({ [row.key]: v } as Partial<Event>)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {/* RSVP responses */}
          {event.microsite_show_rsvp && (
            <section>
              <MicrositeRsvpResponsesCard eventId={event.id} />
            </section>
          )}

          {/* Gallery */}
          <section>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <Label>
                Photo gallery ({photos.length}/{MAX_GALLERY})
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => galleryRef.current?.click()}
                disabled={galleryUploading || photos.length >= MAX_GALLERY}
              >
                {galleryUploading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                )}
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
                    uploadGallery(e.target.files);
                  }
                  e.target.value = "";
                }}
              />
            </div>
            {photos.length === 0 ? (
              <div className="border border-dashed border-border rounded-sm p-8 text-center text-sm text-muted-foreground">
                No photos yet. Drop in a few engagement, prep, or
                save-the-date shots.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className="aspect-square rounded-sm overflow-hidden bg-muted relative group"
                  >
                    <img
                      src={publicUrl(p.storage_path, { width: 400 })}
                      alt={p.caption ?? ""}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => deletePhoto(p)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground/85 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove photo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <GripVertical className="absolute top-1 left-1 w-3 h-3 text-background/60 opacity-0 group-hover:opacity-100" />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}
