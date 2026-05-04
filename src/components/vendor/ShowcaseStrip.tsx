import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ShowcaseClip {
  id: string;
  video_path: string;
  caption: string | null;
}

const BUCKET = "vendor-showcase-clips";

function clipUrl(path: string) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Public-facing showcase reel strip. Each tile autoplays muted while in
// viewport (IntersectionObserver), one shared mute toggle controls audio
// for the active tile so visitors aren't pelted by 6 clips at once.
export function ShowcaseStrip({ vendorId }: { vendorId: string }) {
  const [clips, setClips] = useState<ShowcaseClip[]>([]);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    supabase
      .from("vendor_showcase_clips")
      .select("id, video_path, caption")
      .eq("vendor_id", vendorId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setClips((data as ShowcaseClip[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (clips.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-label text-accent mb-1">Showcase</p>
          <h2 className="font-display text-3xl">In motion</h2>
        </div>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="rounded-full border border-border bg-background hover:bg-secondary transition-colors px-3 py-1.5 text-xs flex items-center gap-1.5"
          aria-label={muted ? "Unmute clips" : "Mute clips"}
        >
          {muted ? (
            <>
              <VolumeX className="w-3.5 h-3.5" />
              Muted
            </>
          ) : (
            <>
              <Volume2 className="w-3.5 h-3.5" />
              Sound on
            </>
          )}
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-thin">
        {clips.map((c) => (
          <ClipTile key={c.id} clip={c} muted={muted} />
        ))}
      </div>
    </div>
  );
}

function ClipTile({
  clip,
  muted,
}: {
  clip: ShowcaseClip;
  muted: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inView) {
      el.play().catch(() => {
        // Autoplay can be denied (e.g., low power mode); leave the user
        // to tap the controls.
      });
    } else {
      el.pause();
    }
  }, [inView]);

  return (
    <div className="snap-start shrink-0 w-44 sm:w-52">
      <div className="relative aspect-[9/16] overflow-hidden rounded-sm bg-black">
        <video
          ref={ref}
          src={clipUrl(clip.video_path)}
          className="w-full h-full object-cover"
          muted={muted}
          playsInline
          loop
          preload="metadata"
        />
      </div>
      {clip.caption && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 px-0.5">
          {clip.caption}
        </p>
      )}
    </div>
  );
}
