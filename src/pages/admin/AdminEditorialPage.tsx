import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Loader2, Edit2, Trash2, ExternalLink, Globe } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminNavItems as navItems } from "@/data/navItems";
import { formatDate } from "@/lib/format";
import { transformedImageUrl } from "@/lib/storage";

// Admin CMS for the /guides/{slug} editorial library. Markdown body,
// faceting tags (category / city / event-type) for cross-linking with
// the programmatic SEO pages, draft + publish flow.
//
// Bucket: editorial-images (admin write, public read).
//
// Slugs are user-edited; we don't auto-generate to keep editorial
// control over the URL. Validation happens at write time via the
// unique constraint.

const BUCKET = "editorial-images";

interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  body: string;
  hero_path: string | null;
  category_slug: string | null;
  city_slug: string | null;
  event_type_slug: string | null;
  author_name: string | null;
  read_minutes: number;
  published_at: string | null;
  created_at: string;
}

export default function AdminEditorialPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ArticleRow | null>(null);

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("editorial_articles")
      .select(
        "id, slug, title, subtitle, excerpt, body, hero_path, category_slug, city_slug, event_type_slug, author_name, read_minutes, published_at, created_at",
      )
      .order("created_at", { ascending: false });
    setRows((data as ArticleRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function deleteArticle(row: ArticleRow) {
    if (!window.confirm(`Delete "${row.title}"? This can't be undone.`))
      return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("editorial_articles")
      .delete()
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (row.hero_path) {
      await supabase.storage.from(BUCKET).remove([row.hero_path]);
    }
    toast.success("Deleted");
    load();
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Admin" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-xl">Editorial</h1>
            <p className="text-sm text-muted-foreground">
              Long-form guides, city deep-dives, vendor spotlights
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New article
          </Button>
        </div>

        <div className="p-4 md:p-8 max-w-4xl space-y-3">
          {loading ? (
            <>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-sm" />
              ))}
            </>
          ) : rows.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <Globe className="w-10 h-10 mx-auto text-muted-foreground/40 mb-4" />
              <h2 className="font-display text-xl mb-2">No articles yet</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Editorial content is what makes the programmatic SEO pages
                rank — Google rewards sites with hand-written guides + tags.
              </p>
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                className="rounded-sm border border-border bg-card p-4 flex items-start gap-4"
              >
                {r.hero_path ? (
                  <img
                    src={transformedImageUrl(BUCKET, r.hero_path, {
                      width: 200,
                    })}
                    alt=""
                    loading="lazy"
                    className="w-20 h-20 object-cover rounded-sm flex-shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-sm bg-secondary flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-display text-base truncate">
                      {r.title}
                    </h3>
                    {r.published_at ? (
                      <Badge className="bg-accent/15 text-accent border border-accent/30">
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="outline">Draft</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-1">
                    /guides/{r.slug}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                    {r.category_slug && (
                      <span className="px-1.5 py-0.5 rounded-sm bg-secondary/60">
                        {r.category_slug}
                      </span>
                    )}
                    {r.city_slug && (
                      <span className="px-1.5 py-0.5 rounded-sm bg-secondary/60">
                        {r.city_slug}
                      </span>
                    )}
                    {r.event_type_slug && (
                      <span className="px-1.5 py-0.5 rounded-sm bg-secondary/60">
                        {r.event_type_slug}
                      </span>
                    )}
                    <span className="ml-auto tnum">
                      {formatDate(r.created_at, "short")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {r.published_at && (
                    <Link
                      to={`/guides/${r.slug}`}
                      target="_blank"
                      className="inline-flex items-center"
                    >
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditing(r);
                      setEditorOpen(true);
                    }}
                    aria-label="Edit"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => deleteArticle(r)}
                    aria-label="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      <ArticleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        article={editing}
        defaultAuthorName={profile?.display_name ?? null}
        onSaved={load}
      />
    </div>
  );
}

function ArticleEditor({
  open,
  onOpenChange,
  article,
  defaultAuthorName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: ArticleRow | null;
  defaultAuthorName: string | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [heroPath, setHeroPath] = useState<string | null>(null);
  const [categorySlug, setCategorySlug] = useState("");
  const [citySlug, setCitySlug] = useState("");
  const [eventTypeSlug, setEventTypeSlug] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [readMinutes, setReadMinutes] = useState("5");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(article?.title ?? "");
      setSlug(article?.slug ?? "");
      setSubtitle(article?.subtitle ?? "");
      setExcerpt(article?.excerpt ?? "");
      setBody(article?.body ?? "");
      setHeroPath(article?.hero_path ?? null);
      setCategorySlug(article?.category_slug ?? "");
      setCitySlug(article?.city_slug ?? "");
      setEventTypeSlug(article?.event_type_slug ?? "");
      setAuthorName(article?.author_name ?? defaultAuthorName ?? "");
      setReadMinutes(String(article?.read_minutes ?? 5));
    }
  }, [open, article, defaultAuthorName]);

  async function uploadHero(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "3600" });
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setHeroPath(path);
  }

  async function save(publish?: boolean) {
    if (!title.trim() || !slug.trim() || !body.trim()) {
      toast.error("Title, slug, and body are required");
      return;
    }
    setSubmitting(true);
    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      subtitle: subtitle.trim() || null,
      excerpt: excerpt.trim() || null,
      body: body.trim(),
      hero_path: heroPath,
      category_slug: categorySlug.trim() || null,
      city_slug: citySlug.trim() || null,
      event_type_slug: eventTypeSlug.trim() || null,
      author_name: authorName.trim() || null,
      read_minutes: Math.max(1, Number.parseInt(readMinutes, 10) || 5),
      // Toggle publish only when explicitly requested.
      ...(publish === true ? { published_at: new Date().toISOString() } : {}),
      ...(publish === false ? { published_at: null } : {}),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error } = article
      ? await sb.from("editorial_articles").update(payload).eq("id", article.id)
      : await sb.from("editorial_articles").insert(payload);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      publish === true ? "Published" : publish === false ? "Unpublished" : "Saved",
    );
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {article ? "Edit article" : "New article"}
          </DialogTitle>
          <DialogDescription>
            Markdown body. Tags drive cross-linking from programmatic SEO
            pages — use the slug forms (e.g. "photographers", "austin-tx").
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="art-title">Title *</Label>
              <Input
                id="art-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="How to find a photographer in Austin"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art-slug">Slug *</Label>
              <Input
                id="art-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="finding-a-photographer-austin"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="art-sub">Subtitle</Label>
            <Input
              id="art-sub"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="A 5-minute deep dive"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="art-exc">Excerpt (used as og:description)</Label>
            <Textarea
              id="art-exc"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              placeholder="Short pitch — what the reader gets out of this."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Hero image</Label>
            {heroPath ? (
              <div className="relative aspect-[16/9] rounded-sm overflow-hidden bg-muted">
                <img
                  src={transformedImageUrl(BUCKET, heroPath, { width: 1200 })}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="absolute bottom-2 right-2 rounded-full"
                  onClick={() => setHeroPath(null)}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  if (e.target.files?.[0]) uploadHero(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="art-cat">Category slug</Label>
              <Input
                id="art-cat"
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                placeholder="photographers"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art-city">City slug</Label>
              <Input
                id="art-city"
                value={citySlug}
                onChange={(e) => setCitySlug(e.target.value)}
                placeholder="austin-tx"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art-evt">Event type slug</Label>
              <Input
                id="art-evt"
                value={eventTypeSlug}
                onChange={(e) => setEventTypeSlug(e.target.value)}
                placeholder="baby-shower"
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="art-author">Byline</Label>
              <Input
                id="art-author"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Vendora Editorial"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art-read">Read minutes</Label>
              <Input
                id="art-read"
                type="number"
                min={1}
                max={60}
                value={readMinutes}
                onChange={(e) => setReadMinutes(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="art-body">Body (Markdown) *</Label>
            <Textarea
              id="art-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              placeholder="## Section heading&#10;&#10;Lorem ipsum…"
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter className="pt-2 gap-2 sm:gap-2 flex-wrap">
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
            variant="outline"
            onClick={() => save()}
            disabled={submitting}
            className="rounded-full"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save draft
          </Button>
          {article?.published_at ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => save(false)}
              disabled={submitting}
              className="rounded-full"
            >
              Unpublish
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => save(true)}
              disabled={submitting}
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
