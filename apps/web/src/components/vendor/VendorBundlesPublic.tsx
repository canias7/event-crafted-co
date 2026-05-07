import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/format";

// Public-facing vendor bundles section. Renders on VendorDetailPage
// when this vendor is the primary on any active bundle. Multi-vendor
// packages — photographer + videographer combos, venue + catering,
// etc. Differentiator vs Knot which doesn't expose this.

interface BundleMember {
  vendor_id: string;
  role: string | null;
  display_order: number;
  vendor: {
    id: string;
    business_name: string;
    category: string;
    slug: string | null;
  } | null;
}

interface Bundle {
  id: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  members: BundleMember[];
}

export function VendorBundlesPublic({ vendorId }: { vendorId: string }) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows } = await (supabase as any)
        .from("vendor_bundles")
        .select(
          "id, name, description, price_cents, members:vendor_bundle_members(vendor_id, role, display_order, vendor:vendor_profiles!vendor_bundle_members_vendor_id_fkey(id, business_name, category, slug))",
        )
        .eq("primary_vendor_id", vendorId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const bs = (rows as Bundle[] | null) ?? [];
      // Sort each bundle's members by display_order.
      for (const b of bs) {
        b.members.sort((a, c) => a.display_order - c.display_order);
      }
      setBundles(bs);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (loading || bundles.length === 0) return null;

  return (
    <div>
      <p className="font-label text-accent mb-4 inline-flex items-center gap-1.5">
        <Layers className="w-3 h-3" />
        Bundles
      </p>
      <h2 className="font-display text-3xl mb-6">Multi-vendor packages</h2>
      <div className="space-y-4">
        {bundles.map((b) => (
          <div
            key={b.id}
            className="rounded-sm border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
              <div>
                <h3 className="font-display text-xl">{b.name}</h3>
                {b.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                    {b.description}
                  </p>
                )}
              </div>
              {b.price_cents != null && (
                <p className="font-display text-2xl tnum">
                  {formatCents(b.price_cents)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {b.members.map((m) =>
                m.vendor ? (
                  <Link
                    key={m.vendor_id}
                    to={
                      m.vendor.slug
                        ? `/v/${m.vendor.slug}`
                        : `/vendors/${m.vendor.id}`
                    }
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background hover:border-foreground/30 transition-colors text-xs"
                  >
                    {m.vendor.business_name}
                    {m.role && (
                      <span className="text-muted-foreground">· {m.role}</span>
                    )}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
