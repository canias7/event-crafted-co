import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, ArrowRight, Star } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

// Default center: NYC (Vendora's seed market). The map auto-fits to
// loaded vendors after the first render.
const DEFAULT_CENTER: [number, number] = [40.7128, -74.006];
const DEFAULT_ZOOM = 11;

interface MapVendor {
  id: string;
  business_name: string;
  category: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  base_price_cents: number | null;
  responder_tier: "fast" | "standard" | null;
}

// Leaflet's default marker icon URLs are broken when bundled — point
// them at the CDN copies that ship with the leaflet package.
const markerIcon = L.icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitBoundsToVendors({ vendors }: { vendors: MapVendor[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = vendors
      .filter((v) => v.latitude != null && v.longitude != null)
      .map(
        (v) =>
          [v.latitude as number, v.longitude as number] as [number, number],
      );
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], 12);
    } else {
      map.fitBounds(L.latLngBounds(pts), { padding: [50, 50] });
    }
  }, [vendors, map]);
  return null;
}

export default function VendorMapPage() {
  const [vendors, setVendors] = useState<MapVendor[]>([]);
  const [loading, setLoading] = useState(true);

  useDocumentMeta({
    title: "Vendor map — Vendora",
    description:
      "Find vendors near you on the map. Photographers, florists, venues, caterers — pinned by location.",
  });

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("vendor_profiles")
      .select(
        "id, business_name, category, location, latitude, longitude, base_price_cents, responder_tier",
      )
      .order("verified_at", { ascending: false, nullsFirst: false })
      .then(({ data }: { data: MapVendor[] | null }) => {
        if (cancelled) return;
        setVendors(data ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pinned = useMemo(
    () => vendors.filter((v) => v.latitude != null && v.longitude != null),
    [vendors],
  );
  const unpinned = useMemo(
    () => vendors.filter((v) => v.latitude == null || v.longitude == null),
    [vendors],
  );

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="border-b border-border pt-32 pb-8">
        <div className="container mx-auto px-6 md:px-8 max-w-6xl">
          <p className="font-label text-accent tracking-[0.4em] mb-4">
            — VENDOR MAP
          </p>
          <h1 className="font-display text-4xl md:text-5xl leading-[1.05] mb-3">
            Find your team{" "}
            <span className="italic font-light text-accent">on the map.</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-2xl leading-relaxed">
            {pinned.length} {pinned.length === 1 ? "vendor" : "vendors"} pinned ·{" "}
            {unpinned.length} {unpinned.length === 1 ? "vendor still" : "vendors still"}{" "}
            being geocoded.
          </p>
        </div>
      </section>

      <section className="py-8 md:py-12">
        <div className="container mx-auto px-6 md:px-8 max-w-6xl">
          {loading ? (
            <Skeleton className="h-[60vh] rounded-sm" />
          ) : (
            <div className="grid lg:grid-cols-[1fr_280px] gap-6">
              <div className="rounded-sm overflow-hidden border border-border h-[60vh] min-h-[400px] bg-muted">
                <MapContainer
                  center={DEFAULT_CENTER}
                  zoom={DEFAULT_ZOOM}
                  scrollWheelZoom={true}
                  className="w-full h-full"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <FitBoundsToVendors vendors={pinned} />
                  {pinned.map((v) => (
                    <Marker
                      key={v.id}
                      position={[
                        v.latitude as number,
                        v.longitude as number,
                      ]}
                      icon={markerIcon}
                    >
                      <Popup>
                        <div className="min-w-[160px]">
                          <p className="font-display text-sm mb-0.5">
                            {v.business_name}
                          </p>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                            {v.category}
                            {v.location ? ` · ${v.location}` : ""}
                          </p>
                          {v.responder_tier === "fast" && (
                            <p className="text-[10px] text-accent mb-2 font-medium">
                              ⚡ Fast responder
                            </p>
                          )}
                          {v.base_price_cents != null && (
                            <p className="text-xs tnum mb-2">
                              From $
                              {Math.round(
                                v.base_price_cents / 100,
                              ).toLocaleString()}
                            </p>
                          )}
                          <Link
                            to={`/vendors/${v.id}`}
                            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                          >
                            View profile
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>

              <aside className="space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                  <p className="font-label text-muted-foreground mb-2">
                    Pinned ({pinned.length})
                  </p>
                  {pinned.length === 0 ? (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      No vendors have been geocoded yet. The map fills in as
                      vendors save their location field.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {pinned.map((v) => (
                        <li key={v.id}>
                          <Link
                            to={`/vendors/${v.id}`}
                            className="block px-3 py-2 rounded-sm hover:bg-secondary/60 group"
                          >
                            <p className="text-sm font-medium truncate group-hover:text-accent">
                              {v.business_name}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />
                              {v.location ?? "—"}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {unpinned.length > 0 && (
                  <div>
                    <p className="font-label text-muted-foreground mb-2">
                      Not on the map ({unpinned.length})
                    </p>
                    <ul className="space-y-1">
                      {unpinned.slice(0, 8).map((v) => (
                        <li key={v.id}>
                          <Link
                            to={`/vendors/${v.id}`}
                            className="block px-3 py-2 rounded-sm hover:bg-secondary/60 group"
                          >
                            <p className="text-sm truncate group-hover:text-accent">
                              {v.business_name}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {v.location ?? "No location set"}
                            </p>
                          </Link>
                        </li>
                      ))}
                      {unpinned.length > 8 && (
                        <li>
                          <Link
                            to="/vendors"
                            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-3 py-2"
                          >
                            +{unpinned.length - 8} more in the directory
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="pt-2">
                  <Link to="/vendors">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-full"
                    >
                      <Star className="w-3.5 h-3.5 mr-1.5" />
                      Open full directory
                    </Button>
                  </Link>
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
