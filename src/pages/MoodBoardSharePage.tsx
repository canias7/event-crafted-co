import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowRight, Link as LinkIcon, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Lightbox } from "@/components/shared/Lightbox";

interface SharedPin {
  id: string;
  image_url: string;
  source_url: string | null;
  caption: string | null;
  display_order: number;
}

interface SharedBoard {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  created_at: string;
  items: SharedPin[];
}

export default function MoodBoardSharePage() {
  const { token } = useParams();
  const [board, setBoard] = useState<SharedBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc("get_mood_board_by_token", { p_token: token })
      .then(({ data, error }: { data: SharedBoard | null; error: unknown }) => {
        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
        } else {
          setBoard(data);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (board) {
      document.title = `${board.name} — Vendora mood board`;
    }
    return () => {
      document.title = "Vendora — Premium Event Planning & Vendor Marketplace";
    };
  }, [board]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading board…</p>
      </div>
    );
  }

  if (notFound || !board) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNav />
        <div className="container mx-auto px-6 md:px-8 py-32 text-center max-w-md">
          <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
            <ImageIcon className="w-5 h-5 text-muted-foreground" />
          </div>
          <h1 className="font-display text-2xl mb-3">Board not found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This share link may have been removed or is incorrect.
          </p>
          <Link to="/">
            <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
              Back to Vendora
            </Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="border-b border-border">
        <div className="container mx-auto px-6 md:px-8 py-16 md:py-20 max-w-4xl">
          <p className="font-label text-accent tracking-[0.3em] mb-4">
            — A SHARED MOOD BOARD
          </p>
          <h1 className="font-display text-4xl md:text-5xl leading-[1.05] mb-6">
            {board.name}
          </h1>
          {board.description && (
            <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl">
              {board.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-6 tnum">
            {board.items.length} {board.items.length === 1 ? "pin" : "pins"}
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-6 md:px-8">
          {board.items.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
                <ImageIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl mb-2">No pins yet</h3>
              <p className="text-sm text-muted-foreground">
                The host hasn't added any inspiration to this board yet.
              </p>
            </div>
          ) : (
            <div className="columns-2 md:columns-3 lg:columns-4 gap-4 [column-fill:_balance]">
              {board.items.map((pin, idx) => (
                <div
                  key={pin.id}
                  className="relative group mb-4 break-inside-avoid rounded-sm overflow-hidden bg-muted"
                >
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    className="block w-full"
                    aria-label="Open pin"
                  >
                    <img
                      src={pin.image_url}
                      alt={pin.caption ?? "Pin"}
                      loading="lazy"
                      className="w-full h-auto block"
                    />
                  </button>
                  {pin.caption && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/85 to-transparent p-3">
                      <p className="text-background text-xs leading-snug">
                        {pin.caption}
                      </p>
                    </div>
                  )}
                  {pin.source_url && (
                    <a
                      href={pin.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-foreground/85 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                      aria-label="Open source"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-16 border-t border-border">
        <div className="container mx-auto px-6 md:px-8 text-center max-w-xl">
          <p className="font-label text-accent mb-4">Vendora</p>
          <h2 className="font-display text-3xl mb-4 leading-tight">
            Plan your event with vendors who get it
          </h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Browse verified vendors, send inquiries in minutes, and build mood
            boards just like this one to keep everyone aligned.
          </p>
          <Link to="/vendors">
            <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
              Browse vendors
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />

      <Lightbox
        images={board.items.map((pin) => ({
          src: pin.image_url,
          alt: pin.caption ?? "Pin",
          caption: pin.caption,
          href: pin.source_url,
        }))}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}
