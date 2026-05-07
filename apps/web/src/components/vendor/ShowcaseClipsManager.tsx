import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Trash2,
  Loader2,
  Film,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const BUCKET = "vendor-showcase-clips";
const MAX_BYTES = 30 * 1024 * 1024; // 30 MB
const MAX_CLIPS = 6;
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime"];

interface ShowcaseClip {
  id: string;
  video_path: string;
  caption: string | null;
  display_order: number;
  created_at: string;
}

const clipsTable = () => supabase.from("vendor_showcase_clips");

function clipUrl(path: string) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function ShowcaseClipsManager({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const [clips, setClips] = useState<ShowcaseClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await clipsTable()
      .select("id, video_path, caption, display_order, created_at")
      .eq("vendor_id", vendorId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(`Couldn't load clips: ${error.message}`);
      setClips([]);
    } else {
      setClips((data as ShowcaseClip[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function uploadFiles(fileList: FileList) {
    const remaining = MAX_CLIPS - clips.length;
    if (remaining <= 0) {
      toast.error(`Max ${MAX_CLIPS} showcase clips`);
      return;
    }
    const accepted = Array.from(fileList)
      .slice(0, remaining)
      .filter((f) => {
        if (!ACCEPTED.includes(f.type)) {
          toast.error(`${f.name}: only MP4, WEBM, or MOV`);
          return false;
        }
        if (f.size > MAX_BYTES) {
          toast.error(`${f.name}: max 30 MB`);
          return false;
        }
        return true;
      });
    if (accepted.length === 0) return;

    setUploading(true);
    const startOrder =
      clips.reduce((m, c) => Math.max(m, c.display_order), -1) + 1;
    let succeeded = 0;
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
      const filename = `${crypto.randomUUID()}.${ext}`;
      const path = `${vendorId}/${filename}`;

      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "3600" });
      if (upload.error) {
        toast.error(`${file.name}: ${upload.error.message}`);
        continue;
      }

      const insert = await clipsTable().insert({
        vendor_id: vendorId,
        video_path: path,
        display_order: startOrder + i,
      });
      if (insert.error) {
        await supabase.storage.from(BUCKET).remove([path]);
        toast.error(`${file.name}: ${insert.error.message}`);
        continue;
      }
      succeeded++;
    }

    setUploading(false);
    if (succeeded > 0) {
      toast.success(`${succeeded} clip${succeeded === 1 ? "" : "s"} uploaded`);
      load();
    }
  }

  async function deleteClip(c: ShowcaseClip) {
    setBusyId(c.id);
    await supabase.storage.from(BUCKET).remove([c.video_path]);
    const { error } = await clipsTable().delete().eq("id", c.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setClips((p) => p.filter((x) => x.id !== c.id));
  }

  async function move(c: ShowcaseClip, dir: -1 | 1) {
    const idx = clips.findIndex((x) => x.id === c.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= clips.length) return;
    const other = clips[swapIdx];
    setBusyId(c.id);
    const a = await clipsTable()
      .update({ display_order: other.display_order })
      .eq("id", c.id);
    const b = await clipsTable()
      .update({ display_order: c.display_order })
      .eq("id", other.id);
    setBusyId(null);
    if (a.error || b.error) {
      toast.error(a.error?.message ?? b.error?.message ?? "Reorder failed");
      return;
    }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-label text-muted-foreground">Showcase clips</p>
          <p className="text-xs text-muted-foreground mt-1">
            Short vertical videos (15-60s, max 30 MB) — first dance, the
            cake reveal, a venue at sunset. Hosts swipe through them on
            your profile.
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={uploading || clips.length >= MAX_CLIPS}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Add clip
              </>
            )}
          </Button>
        )}
        <input
          ref={fileInputRef}
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

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-[9/16] bg-muted rounded-sm animate-pulse"
            />
          ))}
        </div>
      ) : clips.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-10 text-center">
          <Film className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium mb-1">No clips yet</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            A 30-second highlight is worth more than a paragraph. Upload
            2-3 to start.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {clips.map((c, i) => (
            <div key={c.id} className="space-y-2">
              <div className="relative group aspect-[9/16] overflow-hidden rounded-sm bg-black">
                <video
                  src={clipUrl(c.video_path)}
                  className="w-full h-full object-cover"
                  preload="metadata"
                  muted
                  playsInline
                  controls
                />
                {canEdit && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => move(c, -1)}
                        disabled={busyId === c.id}
                        className="w-7 h-7 rounded-full bg-foreground/85 text-background flex items-center justify-center backdrop-blur-sm"
                        aria-label="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {i < clips.length - 1 && (
                      <button
                        type="button"
                        onClick={() => move(c, 1)}
                        disabled={busyId === c.id}
                        className="w-7 h-7 rounded-full bg-foreground/85 text-background flex items-center justify-center backdrop-blur-sm"
                        aria-label="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteClip(c)}
                      disabled={busyId === c.id}
                      className="w-7 h-7 rounded-full bg-foreground/85 text-background flex items-center justify-center backdrop-blur-sm"
                      aria-label="Delete clip"
                    >
                      {busyId === c.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
              {canEdit ? (
                <CaptionField clip={c} onSaved={load} />
              ) : (
                c.caption && (
                  <p className="text-xs text-muted-foreground px-1 line-clamp-2">
                    {c.caption}
                  </p>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CaptionField({
  clip,
  onSaved,
}: {
  clip: ShowcaseClip;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(clip.caption ?? "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(clip.caption ?? "");
    setDirty(false);
  }, [clip.caption]);

  async function save() {
    const next = value.trim() || null;
    if ((clip.caption ?? null) === next) {
      setDirty(false);
      return;
    }
    setSaving(true);
    const { error } = await clipsTable()
      .update({ caption: next })
      .eq("id", clip.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDirty(false);
    onSaved();
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        setDirty(true);
      }}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder="Caption (optional)"
      disabled={saving}
      className={`w-full text-xs px-2.5 py-1.5 rounded-sm bg-secondary/50 border ${
        dirty ? "border-accent/40" : "border-transparent"
      } focus:border-foreground/40 focus:outline-none transition-colors`}
    />
  );
}
