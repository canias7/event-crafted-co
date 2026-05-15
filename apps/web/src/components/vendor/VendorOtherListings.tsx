// "More from this vendor" strip — every approved vendor_profiles row
// owned by the same user_id, excluding the one currently being viewed.
// Mirrors the OtherListings section in the mobile VendorProfileSheet.
//
// Renders nothing if there are no other listings.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface OtherListing {
  id: string;
  slug: string | null;
  business_name: string | null;
  category: string | null;
  location: string | null;
  logo_url: string | null;
}

export function VendorOtherListings({ vendorId }: { vendorId: string }) {
  const [items, setItems] = useState<OtherListing[] | null>(null);

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
        .select("id, slug, business_name, category, location, logo_url")
        .eq("user_id", ownerId)
        .eq("application_status", "approved")
        .neq("id", vendorId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setItems(((data as OtherListing[] | null) ?? []).slice(0, 8));
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (items === null || items.length === 0) return null;

  return (
    <div>
      <p className="font-label text-accent mb-4">More from this vendor</p>
      <h2 className="font-display text-3xl mb-6">Their other listings</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {items.map((l) => (
          <Link
            key={l.id}
            to={l.slug ? `/vendors/${l.slug}` : `/vendors/${l.id}`}
            className="group w-64 shrink-0 overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-md"
          >
            <div className="aspect-[4/3] bg-secondary/40 overflow-hidden flex items-center justify-center">
              {l.logo_url ? (
                <img
                  src={l.logo_url}
                  alt={l.business_name ?? "Listing"}
                  className="w-full h-full object-cover transition group-hover:scale-[1.02]"
                  loading="lazy"
                />
              ) : (
                <span className="font-serif italic text-4xl text-muted-foreground">
                  {(l.business_name ?? "V")[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div className="p-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground truncate">
                {l.category ?? "Vendor"}
              </p>
              <h3 className="mt-1 font-medium text-foreground truncate">
                {l.business_name ?? "Listing"}
              </h3>
              {l.location ? (
                <p className="text-xs text-muted-foreground truncate">
                  {l.location}
                </p>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
