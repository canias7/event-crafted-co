// Last-minute availability — public banner on the vendor detail page,
// fed by Fill Your Calendar (Smart Scheduling). Only suggestions the
// vendor explicitly APPROVED are readable by anon (RLS enforces
// status = 'approved'), so nothing promotes without vendor sign-off.
// Renders nothing when there are no upcoming approved open dates.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PromoRow {
  open_dates: string[];
  message: string | null;
  created_at: string;
}

function fmt(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function VendorOpenDatesPublic({ vendorId }: { vendorId: string }) {
  const [dates, setDates] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_promo_suggestions")
        .select("open_dates, message, created_at")
        .eq("vendor_id", vendorId)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive || !data) return;
      const row = data as PromoRow;
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = (row.open_dates ?? []).filter((d) => d >= today).slice(0, 6);
      setDates(upcoming);
      setMessage(row.message ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [vendorId]);

  if (dates.length === 0) return null;

  return (
    <div className="card-soft p-5 sm:p-6 border border-accent/30 bg-accent/5">
      <p className="font-label text-accent mb-1">
        ✦ Last-minute availability
      </p>
      <p className="font-editorial text-2xl mb-3">
        This vendor has open dates coming up
      </p>
      {message && (
        <p className="text-sm text-foreground/75 leading-relaxed mb-3">{message}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {dates.map((d) => (
          <span
            key={d}
            className="inline-flex items-center rounded-full bg-background border border-accent/40 px-3 py-1 text-sm"
          >
            {fmt(d)}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Send an inquiry to lock one in before it's gone.
      </p>
    </div>
  );
}
