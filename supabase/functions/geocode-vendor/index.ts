// Geocode a vendor's location string to lat/lng using Nominatim (OSM's
// free geocoding service). Called from the frontend after a vendor
// updates their location field, and from a one-shot batch backfill.
//
// Nominatim usage policy:
//   - Max 1 req/sec per IP — we don't enforce here, callers should
//     space requests when batching
//   - Custom User-Agent required (set below)
//   - No bulk/automated use without permission — this is per-vendor on
//     save, well under their threshold
//
// Schema: { vendorId } → { ok, lat, lng } | { ok: false, error }
//
// Skips re-geocoding when the location string hasn't changed since the
// last successful geocode (geocoded_location column comparison).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://vendora.events";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "supabase admin not configured" }, 500);
  }

  let body: { vendorId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  const vendorId = body.vendorId;
  if (!vendorId) return json({ ok: false, error: "vendorId required" }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: vendor, error: fetchErr } = await admin
    .from("vendor_profiles")
    .select("id, location, latitude, longitude, geocoded_location")
    .eq("id", vendorId)
    .maybeSingle();
  if (fetchErr || !vendor) {
    return json({ ok: false, error: fetchErr?.message ?? "not found" }, 404);
  }

  const v = vendor as any;
  const loc = (v.location ?? "").trim();
  if (!loc) {
    return json({ ok: false, error: "no location set" }, 400);
  }
  if (
    v.latitude != null &&
    v.longitude != null &&
    (v.geocoded_location ?? "").trim().toLowerCase() === loc.toLowerCase()
  ) {
    return json({
      ok: true,
      lat: v.latitude,
      lng: v.longitude,
      cached: true,
    });
  }

  // Hit Nominatim. URL-encode the query, request JSON, limit to 1.
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", loc);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");

  // 10s timeout so a hung Nominatim doesn't make this function hang
  // until its global ceiling. Vendors retry on the next location edit.
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 10_000);
  let r: Response;
  try {
    r = await fetch(url.toString(), {
      signal: ac.signal,
      headers: {
        "User-Agent": `Vendora geocode-vendor / ${APP_URL}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    clearTimeout(timeout);
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return json(
      { ok: false, error: aborted ? "nominatim timeout" : String(e) },
      504,
    );
  }
  clearTimeout(timeout);
  if (!r.ok) {
    return json(
      { ok: false, error: `nominatim ${r.status}: ${await r.text()}` },
      502,
    );
  }
  const results = (await r.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(results) || results.length === 0) {
    return json({ ok: false, error: "no match", location: loc }, 404);
  }
  const lat = Number.parseFloat(results[0].lat);
  const lng = Number.parseFloat(results[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ ok: false, error: "bad coords" }, 502);
  }

  const { error: updErr } = await admin
    .from("vendor_profiles")
    .update({
      latitude: lat,
      longitude: lng,
      geocoded_at: new Date().toISOString(),
      geocoded_location: loc,
    })
    .eq("id", vendorId);
  if (updErr) {
    return json({ ok: false, error: updErr.message }, 500);
  }

  return json({ ok: true, lat, lng, cached: false });
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
