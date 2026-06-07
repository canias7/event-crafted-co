// "More from this vendor" strip — every approved vendor_profiles row
// owned by the same user_id, excluding the one currently being viewed.
// Mirrors the OtherListings section in the mobile VendorProfileSheet.
//
// Renders nothing if there are no other listings.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { vendorImageUrl } from "@/lib/storage";

interface OtherListing {
  id: string;
  slug: string | null;
  business_name: string | null;
  category: string | null;
  location: string | null;
  logo_url: string | null;
  brand: { business_name: string | null } | null;
}

export function VendorOtherListings({ vendorId }: { vendorId: string }) {
  const [items, setItems] = useState<OtherListing[] | null>(null);
  // listing id → cover image (first portfolio photo). Falls back to the
  // logo, then a monogram, so cards always show something.
  const [covers, setCovers] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    (async () => {
      const { data: meta } = await supabase
        .from("vendor_profiles")
        .select("user_id")
        .eq("id", vendorId)
        .maybeSingle();
      const ownerId = (meta as { user_id?: string } | null)?.user_id;
      if (!ownerId) {
        if (!cancelled) setItems([]);
        return;
      }
      const { data } = await supabase
        .from("vendor_profiles")
        .select(
          "id, slug, business_name, category, location, logo_url, brand:vendor_brands!vendor_profiles_user_id_fkey(business_name)",
        )
        .eq("user_id", ownerId)
        .eq("application_status", "approved")
        .neq("id", vendorId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const list = ((data as OtherListing[] | null) ?? []).slice(0, 8);
      setItems(list);

      // Pull the first portfolio photo for each so the cards show real
      // covers instead of monograms.
      const ids = list.map((l) => l.id);
      if (ids.length > 0) {
        const { data: pics } = await supabase
          .from("vendor_portfolio_images")
          .select("vendor_id, storage_path, display_order, created_at")
          .in("vendor_id", ids)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const p of (pics ?? []) as Array<{
          vendor_id: string;
          storage_path: string | null;
        }>) {
          if (!map[p.vendor_id] && p.storage_path) {
            map[p.vendor_id] = vendorImageUrl(p.storage_path, { width: 600 });
          }
        }
        setCovers(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (items === null || items.length === 0) return null;

  const scrollByCards = (dir: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  };
  const showArrows = items.length > 2;

  return (
    <div>
      <p className="font-label text-accent mb-4">More from this vendor</p>
      <h2 className="font-editorial text-4xl mb-6">Their other listings</h2>
      <div className="relative">
        {showArrows && (
          <button
            type="button"
            onClick={() => scrollByCards(-1)}
            aria-label="Scroll to previous listings"
            className="absolute -left-3 top-[38%] -translate-y-1/2 z-10 hidden sm:flex w-9 h-9 items-center justify-center rounded-full bg-background border border-border shadow-md hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide scroll-smooth snap-x"
        >
          {items.map((l) => {
            const displayName =
              l.business_name?.trim() ||
              l.brand?.business_name?.trim() ||
              "Listing";
            const cover = covers[l.id] || l.logo_url;
            return (
              <Link
                key={l.id}
                to={l.slug ? `/vendors/${l.slug}` : `/vendors/${l.id}`}
                className="group w-64 shrink-0 snap-start overflow-hidden card-soft transition hover:shadow-md"
              >
                <div className="aspect-[4/3] bg-secondary/40 overflow-hidden flex items-center justify-center">
                  {cover ? (
                    <img
                      src={cover}
                      alt={displayName}
                      className="w-full h-full object-cover transition group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  ) : (
                    <span className="font-serif italic text-4xl text-muted-foreground">
                      {displayName[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground truncate">
                    {l.category ?? "Vendor"}
                  </p>
                  <h3 className="mt-1 font-medium text-foreground truncate">
                    {displayName}
                  </h3>
                  {l.location ? (
                    <p className="text-xs text-muted-foreground truncate">
                      {l.location}
                    </p>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>

        {showArrows && (
          <button
            type="button"
            onClick={() => scrollByCards(1)}
            aria-label="Scroll to more listings"
            className="absolute -right-3 top-[38%] -translate-y-1/2 z-10 hidden sm:flex w-9 h-9 items-center justify-center rounded-full bg-background border border-border shadow-md hover:bg-secondary transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
