// Public-facing vendor social feed — surfaces vendor_posts (image
// grid) and vendor_buzz (short text updates) on the vendor detail
// page. Mirrors the host-side social section in
// apps/host-mobile/app/(host)/vendor/[id].tsx so visitors see the
// same content the mobile shows.
//
// Renders nothing if the vendor has neither posts nor buzz.

import { useEffect, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PostRow {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
}
interface BuzzRow {
  id: string;
  body: string;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export function VendorSocialFeed({ vendorId }: { vendorId: string }) {
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [buzz, setBuzz] = useState<BuzzRow[] | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    Promise.all([
      supabase
        .from("vendor_posts")
        .select("id, image_url, caption, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(9),
      supabase
        .from("vendor_buzz")
        .select("id, body, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(3),
    ]).then(([postsRes, buzzRes]) => {
      if (cancelled) return;
      setPosts((postsRes.data ?? []) as PostRow[]);
      setBuzz((buzzRes.data ?? []) as BuzzRow[]);
    });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (posts === null || buzz === null) {
    return (
      <div className="py-8 flex justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (posts.length === 0 && buzz.length === 0) return null;

  return (
    <div className="space-y-10">
      {posts.length > 0 ? (
        <div>
          <p className="font-label text-accent mb-4">Latest</p>
          <h2 className="font-display text-3xl mb-6">From their feed</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {posts.map((p) => (
              <div
                key={p.id}
                className="relative aspect-square overflow-hidden rounded-md bg-muted"
              >
                <img
                  src={p.image_url}
                  alt={p.caption ?? "Post"}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                {p.caption ? (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-2 text-[11px] text-white line-clamp-2">
                    {p.caption}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {buzz.length > 0 ? (
        <div>
          <p className="font-label text-accent mb-4">Buzz</p>
          <h2 className="font-display text-3xl mb-6 flex items-center gap-2">
            <MessageCircle className="h-7 w-7" />
            Recent updates
          </h2>
          <div className="space-y-3 max-w-2xl">
            {buzz.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {b.body}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {timeAgo(b.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
