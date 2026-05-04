import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Globe,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlbumEditor } from "@/components/vendor/AlbumEditor";
import {
  BUCKET,
  albumsTable,
  photosTable,
  type Album,
} from "@/components/vendor/album-shared";

export function AlbumManager({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editorAlbum, setEditorAlbum] = useState<Album | null>(null);

  async function load() {
    setLoading(true);
    const { data: rows } = await albumsTable()
      .select(
        "id, title, description, share_token, cover_path, host_consent_given_at, published_at, download_enabled, inquiry_id, host_id, event_id, created_at",
      )
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });
    const list = (rows as Album[]) ?? [];

    // Best-effort photo counts so the manager grid shows useful sub-text.
    if (list.length > 0) {
      const ids = list.map((a) => a.id);
      const { data: counts } = await photosTable()
        .select("album_id")
        .in("album_id", ids);
      const tally: Record<string, number> = {};
      for (const r of (counts as Array<{ album_id: string }> | null) ?? []) {
        tally[r.album_id] = (tally[r.album_id] ?? 0) + 1;
      }
      for (const a of list) a.photo_count = tally[a.id] ?? 0;
    }

    setAlbums(list);
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function createAlbum() {
    setCreating(true);
    const { data, error } = await albumsTable()
      .insert({
        vendor_id: vendorId,
        title: "Untitled album",
      })
      .select(
        "id, title, description, share_token, cover_path, host_consent_given_at, published_at, download_enabled, inquiry_id, host_id, event_id, created_at",
      )
      .single();
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const newAlbum = { ...(data as Album), photo_count: 0 };
    setAlbums((p) => [newAlbum, ...p]);
    setEditorAlbum(newAlbum);
  }

  async function deleteAlbum(id: string) {
    if (!confirm("Delete this album and all its photos?")) return;
    const { error } = await albumsTable().delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAlbums((p) => p.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-label text-muted-foreground">Event albums</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-xl">
            Deliver high-resolution originals to your hosts via a single
            shareable link. Hosts see them on their event detail page;
            their guests can browse + download HD with the link. Counts
            as social proof on your profile.
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={createAlbum}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            New album
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground text-sm py-6">
          Loading…
        </div>
      ) : albums.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-10 text-center">
          <ImageIcon className="w-7 h-7 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium mb-1">No albums yet</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Create an album once an event wraps — it's the best way to
            keep hosts coming back to refer you.
          </p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {albums.map((a) => (
            <li
              key={a.id}
              className="rounded-sm border border-border bg-card overflow-hidden flex flex-col"
            >
              <div className="aspect-[16/10] bg-muted relative">
                {a.cover_path ? (
                  <CoverPreview path={a.cover_path} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground/40 text-xs">
                    No cover yet
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  {a.published_at && a.host_consent_given_at ? (
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
                  {a.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 tnum">
                  {a.photo_count ?? 0}{" "}
                  {(a.photo_count ?? 0) === 1 ? "photo" : "photos"}
                </p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditorAlbum(a)}
                      className="h-7 rounded-full text-xs"
                    >
                      Edit
                    </Button>
                  )}
                  {a.published_at && a.host_consent_given_at && (
                    <a
                      href={`/album/${a.share_token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View
                    </a>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAlbum(a.id)}
                      className="h-7 w-7 ml-auto text-muted-foreground hover:text-destructive"
                      aria-label="Delete album"
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

      {editorAlbum && (
        <AlbumEditor
          album={editorAlbum}
          vendorId={vendorId}
          onClose={() => setEditorAlbum(null)}
          onSaved={(updated) => {
            setAlbums((p) =>
              p.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
            );
            setEditorAlbum(updated);
          }}
        />
      )}
    </div>
  );
}

function CoverPreview({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (cancelled) return;
        setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!url) return null;
  return (
    <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
  );
}

