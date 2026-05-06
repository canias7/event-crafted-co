import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Circle, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Compass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Small map showing the vendor's service coverage — the marker is
// their HQ, the circle is the radius they'll travel for events.
// Renders nothing if we don't have lat/lon (vendors who never
// supplied an address won't have geocoded coordinates).

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface CoverageRow {
  latitude: number | null;
  longitude: number | null;
  service_radius_miles: number | null;
  location: string | null;
}

const MILES_TO_METERS = 1609.34;

export function VendorServiceAreaMap({
  vendorId,
  category,
}: {
  vendorId: string;
  category: string;
}) {
  const [data, setData] = useState<CoverageRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row } = await (supabase as any)
        .from("vendor_profiles")
        .select("latitude, longitude, service_radius_miles, location")
        .eq("id", vendorId)
        .maybeSingle();
      if (cancelled) return;
      setData((row as CoverageRow | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (loading) return null;

  // Strict validation: lat/lon must be finite numbers in valid ranges
  // before we hand them to leaflet. The previous `!data?.latitude`
  // truthy-check let `0` through and crashed when the row had only
  // partial geocoder output (e.g. one of the two coords missing or
  // returned as a non-number by a stale schema). Rather than risk
  // leaflet throwing inside its renderer, bail out cleanly.
  const lat = data?.latitude;
  const lng = data?.longitude;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  const radiusMiles =
    typeof data.service_radius_miles === "number" &&
    Number.isFinite(data.service_radius_miles) &&
    data.service_radius_miles > 0
      ? data.service_radius_miles
      : 25;
  const radiusMeters = radiusMiles * MILES_TO_METERS;
  const center: [number, number] = [lat, lng];
  // Pick a zoom level that fits the radius circle nicely. Approximate.
  const zoom = radiusMiles > 100 ? 7 : radiusMiles > 50 ? 8 : radiusMiles > 25 ? 9 : 10;

  return (
    <div>
      <p className="font-label text-accent mb-3 inline-flex items-center gap-1.5">
        <Compass className="w-3 h-3" />
        Service area
      </p>
      <h2 className="font-display text-2xl mb-2">Where {category.toLowerCase()}s travel</h2>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        {data.location ? (
          <>
            Based in {data.location}. Travels up to {radiusMiles} miles for events.
          </>
        ) : (
          <>Travels up to {radiusMiles} miles for events.</>
        )}
      </p>
      <div
        className="h-64 rounded-sm overflow-hidden border border-border"
        // Leaflet needs a positioned container for tile rendering.
      >
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Circle
            center={center}
            radius={radiusMeters}
            pathOptions={{
              color: "hsl(var(--accent))",
              weight: 1.5,
              fillOpacity: 0.12,
            }}
          />
          <Marker position={center} icon={markerIcon} />
        </MapContainer>
      </div>
    </div>
  );
}
