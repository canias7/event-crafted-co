import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { adminNavItems as navItems } from "@/data/navItems";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const featuredTable = () => (supabase as any).from("featured_events");

interface Entry {
  id: string;
  slug: string;
  title: string;
  event_type: string;
  event_type_label: string | null;
  location: string | null;
  hosts: string | null;
  guests: number | null;
  date_label: string | null;
  excerpt: string | null;
  body: string | null;
  hero_url: string | null;
  vendor_credits: string[];
  published_at: string | null;
}

const eventTypes = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "holiday_dinner", label: "Holiday dinner" },
  { value: "baby_shower", label: "Baby shower" },
  { value: "anniversary", label: "Anniversary" },
  { value: "engagement", label: "Engagement" },
  { value: "other", label: "Other" },
];

export default function AdminInspirationPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await featuredTable()
      .select(
        "id, slug, title, event_type, event_type_label, location, hosts, guests, date_label, excerpt, body, hero_url, vendor_credits, published_at",
      )
      .order("created_at", { ascending: false });
    setRows((data as Entry[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function togglePublished(e: Entry) {
    const next = e.published_at ? null : new Date().toISOString();
    const { error } = await featuredTable()
      .update({ published_at: next })
      .eq("id", e.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === e.id ? { ...r, published_at: next } : r)),
    );
    toast.success(next ? "Published" : "Unpublished");
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this entry permanently?")) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    const { error } = await featuredTable().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Admin" backPath="/" />

      <main className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl">Inspiration</h1>
            <p className="text-sm text-muted-foreground">
              Editorial entries shown on /inspiration
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            New entry
          </Button>
        </div>

        <div className="p-4 md:p-8">
          <div className="bg-card border border-border rounded-sm overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-16 px-6">
                <p className="font-display text-xl mb-2">No CMS entries yet</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                  Create real-event editorial entries here. The /inspiration
                  page also falls back to bundled placeholder entries until
                  you publish replacements.
                </p>
                <Button
                  onClick={() => {
                    setEditing(null);
                    setEditorOpen(true);
                  }}
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create first entry
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {rows.map((e) => (
                  <div
                    key={e.id}
                    className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-medium">{e.title}</p>
                        {!e.published_at && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Draft
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        /{e.slug} · {e.event_type_label ?? e.event_type}
                        {e.location && ` · ${e.location}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {e.published_at && (
                        <Link
                          to={`/inspiration/${e.slug}`}
                          target="_blank"
                          className="inline-flex items-center"
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            View
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs rounded-full"
                        onClick={() => togglePublished(e)}
                      >
                        {e.published_at ? (
                          <>
                            <EyeOff className="w-3 h-3 mr-1" />
                            Unpublish
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3 mr-1" />
                            Publish
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setEditing(e);
                          setEditorOpen(true);
                        }}
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => deleteEntry(e.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />

      <EntryEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSuccess={load}
      />
    </div>
  );
}

function EntryEditor({
  open,
  onOpenChange,
  editing,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Entry | null;
  onSuccess: () => void;
}) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("wedding");
  const [eventTypeLabel, setEventTypeLabel] = useState("");
  const [location, setLocation] = useState("");
  const [hosts, setHosts] = useState("");
  const [guests, setGuests] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [heroUrl, setHeroUrl] = useState("");
  const [vendorCredits, setVendorCredits] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSlug(editing?.slug ?? "");
      setTitle(editing?.title ?? "");
      setEventType(editing?.event_type ?? "wedding");
      setEventTypeLabel(editing?.event_type_label ?? "");
      setLocation(editing?.location ?? "");
      setHosts(editing?.hosts ?? "");
      setGuests(editing?.guests?.toString() ?? "");
      setDateLabel(editing?.date_label ?? "");
      setExcerpt(editing?.excerpt ?? "");
      setBody(editing?.body ?? "");
      setHeroUrl(editing?.hero_url ?? "");
      setVendorCredits((editing?.vendor_credits ?? []).join("\n"));
    }
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug.trim() || !title.trim()) {
      toast.error("Slug and title are required");
      return;
    }
    setSubmitting(true);
    const payload = {
      slug: slug.trim(),
      title: title.trim(),
      event_type: eventType,
      event_type_label: eventTypeLabel.trim() || null,
      location: location.trim() || null,
      hosts: hosts.trim() || null,
      guests: guests ? Number.parseInt(guests, 10) : null,
      date_label: dateLabel.trim() || null,
      excerpt: excerpt.trim() || null,
      body: body.trim() || null,
      hero_url: heroUrl.trim() || null,
      vendor_credits: vendorCredits
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const { error } = editing
      ? await featuredTable().update(payload).eq("id", editing.id)
      : await featuredTable().insert({ ...payload, published_at: null });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Saved" : "Created (unpublished)");
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit entry" : "New inspiration entry"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            New entries start unpublished. Use the publish toggle on the
            list to push them live.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="entry-slug">
                Slug <span className="text-destructive">*</span>
              </Label>
              <Input
                id="entry-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="brooklyn-rooftop-40th"
                className="h-10"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-type">Event type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger id="entry-type" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="entry-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="entry-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10"
              required
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="entry-type-label">Type label</Label>
              <Input
                id="entry-type-label"
                value={eventTypeLabel}
                onChange={(e) => setEventTypeLabel(e.target.value)}
                placeholder="Milestone Birthday"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-location">Location</Label>
              <Input
                id="entry-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-date">Date label</Label>
              <Input
                id="entry-date"
                value={dateLabel}
                onChange={(e) => setDateLabel(e.target.value)}
                placeholder="June 2026"
                className="h-10"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="entry-hosts">Hosts</Label>
              <Input
                id="entry-hosts"
                value={hosts}
                onChange={(e) => setHosts(e.target.value)}
                placeholder="Sarah & James"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-guests">Guest count</Label>
              <Input
                id="entry-guests"
                type="number"
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="entry-hero">Hero image URL</Label>
            <Input
              id="entry-hero"
              type="url"
              value={heroUrl}
              onChange={(e) => setHeroUrl(e.target.value)}
              placeholder="https://… (Supabase Storage or any CDN)"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entry-excerpt">Excerpt</Label>
            <Textarea
              id="entry-excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              placeholder="One-paragraph teaser shown on the index card."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entry-body">Body</Label>
            <Textarea
              id="entry-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="The long-form story. Use blank lines to separate paragraphs."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entry-credits">
              Vendor credits (one per line)
            </Label>
            <Textarea
              id="entry-credits"
              value={vendorCredits}
              onChange={(e) => setVendorCredits(e.target.value)}
              rows={4}
              placeholder={"Florals — Forrest & Field\nPhotography — Atelier 47"}
            />
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? "Save changes" : "Create entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
