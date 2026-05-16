import { Instagram } from "lucide-react";

// Public Instagram / TikTok handle display on a vendor profile.
// Rather than embedding actual posts (CORS / API key issues), we
// link to the vendor's profile with a styled callout. Cheap, fast,
// no JS embeds blowing up the bundle.

interface Props {
  instagramHandle: string | null;
  tiktokHandle: string | null;
}

export function SocialEmbedCard({ instagramHandle, tiktokHandle }: Props) {
  if (!instagramHandle && !tiktokHandle) return null;
  const ig = instagramHandle?.replace(/^@/, "").trim();
  const tt = tiktokHandle?.replace(/^@/, "").trim();
  return (
    <div className="card-soft p-5">
      <p className="font-label text-muted-foreground mb-3">Latest on social</p>
      <div className="flex flex-wrap gap-3">
        {ig && (
          <a
            href={`https://instagram.com/${ig}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background hover:border-foreground/30 transition-colors text-sm"
          >
            <Instagram className="w-3.5 h-3.5 text-accent" />
            @{ig}
          </a>
        )}
        {tt && (
          <a
            href={`https://tiktok.com/@${tt}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background hover:border-foreground/30 transition-colors text-sm"
          >
            <svg
              className="w-3.5 h-3.5 text-accent"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M19.6 7.55a5.92 5.92 0 0 1-3.42-1.09 5.93 5.93 0 0 1-2.32-3.65L13.7 2h-3.42v13.16a2.5 2.5 0 1 1-2.5-2.5l.46.04V9.27l-.46-.03a5.93 5.93 0 1 0 5.93 5.93V8.85a9.36 9.36 0 0 0 5.91 2.07V7.5l-.02.05Z" />
            </svg>
            @{tt}
          </a>
        )}
      </div>
    </div>
  );
}
