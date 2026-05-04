import { useEffect, useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";

// Surfaces "often booked with" / "recommended for you" rails wherever
// makes sense. Two modes:
//   - cobookedFor={vendorId}   → vendors paired with this vendor
//   - recommendedFor={hostId}  → vendors other hosts booked alongside
//                                this host's vendors
//
// Both call SECURITY DEFINER RPCs that enforce the visibility model
// inside Postgres — frontend just renders.

interface Item {
  vendor_id: string;
  business_name: string;
  category: string;
  location: string | null;
  cobookings?: number;
  is_curated?: boolean;
}

interface BaseProps {
  /** Section eyebrow + heading */
  eyebrow?: string;
  title?: string;
  /** Max items to fetch + render */
  limit?: number;
}

type Props =
  | (BaseProps & { cobookedFor: string; recommendedFor?: never })
  | (BaseProps & { cobookedFor?: never; recommendedFor: string });

export function CoBookedRail(props: Props) {
  const { eyebrow, title, limit = 6 } = props;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rpcName = "cobookedFor" in props && props.cobookedFor
        ? "get_cobooked_vendors"
        : "get_recommended_for_host";
      const args =
        "cobookedFor" in props && props.cobookedFor
          ? { p_vendor_id: props.cobookedFor, p_limit: limit }
          : { p_host_id: (props as { recommendedFor: string }).recommendedFor, p_limit: limit };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(rpcName, args);
      if (cancelled) return;
      if (error) {
        setItems([]);
      } else {
        setItems((data as Item[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    "cobookedFor" in props ? props.cobookedFor : undefined,
    "recommendedFor" in props ? props.recommendedFor : undefined,
    limit,
  ]);

  if (loading) return null;
  if (items.length === 0) return null;

  const heading = title ?? ("cobookedFor" in props ? "Often booked with" : "Recommended for you");
  const eyebrowLabel = eyebrow ?? "Vendora suggests";

  return (
    <section>
      <p className="font-label text-accent mb-3">{eyebrowLabel}</p>
      <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-display text-2xl md:text-3xl">{heading}</h2>
      </div>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((v) => (
          <li key={v.vendor_id}>
            <Link
              to={`/vendors/${v.vendor_id}`}
              className="group block rounded-sm border border-border bg-card p-4 hover:border-foreground/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-base leading-tight transition-colors group-hover:text-accent">
                    {v.business_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    {v.category}
                    {v.location && ` · ${v.location}`}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-1 group-hover:text-accent transition-colors" />
              </div>
              {(v.cobookings || v.is_curated) && (
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-3 inline-flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  {v.is_curated && v.cobookings && v.cobookings > 0
                    ? `Hand-picked · booked together ${v.cobookings}×`
                    : v.is_curated
                      ? "Hand-picked partner"
                      : `Booked together ${v.cobookings}×`}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
