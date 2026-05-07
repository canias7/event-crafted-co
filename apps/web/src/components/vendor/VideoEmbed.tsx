// Lightweight video URL → embed renderer. Recognizes YouTube + Vimeo;
// falls back to a native <video> tag for direct .mp4 / .webm URLs.

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/;

export function VideoEmbed({ url, title }: { url: string; title?: string }) {
  const yt = url.match(YT_RE);
  if (yt) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${yt[1]}`}
        title={title ?? "Vendor intro video"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className="w-full h-full border-0"
      />
    );
  }
  const v = url.match(VIMEO_RE);
  if (v) {
    return (
      <iframe
        src={`https://player.vimeo.com/video/${v[1]}`}
        title={title ?? "Vendor intro video"}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className="w-full h-full border-0"
      />
    );
  }
  return (
    <video
      src={url}
      controls
      preload="metadata"
      className="w-full h-full"
    />
  );
}
