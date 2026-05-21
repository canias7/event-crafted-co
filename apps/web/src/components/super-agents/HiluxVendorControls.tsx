// HILUX controls — vendor-only card on /vendor/super-agents that lets
// the vendor enable HILUX per listing. When enabled, the DB trigger on
// direct_messages calls the hilux-respond edge function, which writes
// a Claude-drafted reply back into the thread as the vendor.
//
// One row per listing the vendor owns. We don't surface a per-vendor
// "master toggle" because the listing is the unit that has bio +
// packages + FAQs — the things HILUX needs to answer well. Enabling
// HILUX on a listing without packages just means a thinner reply; we
// don't gate it, just nudge.

import { useCallback, useEffect, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface HiluxListingRow {
  id: string;
  business_name: string | null;
  category: string | null;
  application_status: string | null;
  hilux_enabled: boolean;
}

export function HiluxVendorControls() {
  const { user } = useAuth();
  const [listings, setListings] = useState<HiluxListingRow[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("vendor_profiles")
      .select("id, business_name, category, application_status, hilux_enabled")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[HiluxVendorControls] load failed", error);
      toast.error("Couldn't load your listings.");
      setListings([]);
      return;
    }
    setListings((data ?? []) as HiluxListingRow[]);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (row: HiluxListingRow, next: boolean) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from("vendor_profiles")
      .update({ hilux_enabled: next })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      console.error("[HiluxVendorControls] update failed", error);
      toast.error("Couldn't save the change.");
      return;
    }
    setListings((prev) =>
      prev
        ? prev.map((r) => (r.id === row.id ? { ...r, hilux_enabled: next } : r))
        : prev,
    );
    toast.success(
      next
        ? `HILUX is now answering on ${row.business_name ?? "this listing"}`
        : `HILUX paused on ${row.business_name ?? "this listing"}`,
    );
  };

  if (!user) return null;

  return (
    <div className="relative z-10 px-6 md:px-10 pt-24 md:pt-28">
      <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-7 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)]">
        <div className="flex items-start gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255, 138, 76, 0.15)" }}
          >
            <Bot className="w-5 h-5" style={{ color: "#ff8a4c" }} />
          </div>
          <div className="min-w-0">
            <p
              className="text-[11px] uppercase tracking-[0.2em] mb-1"
              style={{ color: "rgba(255, 138, 76, 0.85)" }}
            >
              HILUX 2.7 · Always On
            </p>
            <h3 className="font-editorial text-2xl md:text-3xl text-black leading-tight">
              Turn HILUX on for the listings you want it answering.
            </h3>
            <p className="text-sm text-black/60 mt-1.5">
              When a host sends a message, HILUX replies in your voice using
              your listing's bio, packages, and FAQs.
            </p>
          </div>
        </div>

        {listings === null ? (
          <div className="flex items-center gap-2 text-sm text-black/50 py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading your listings…
          </div>
        ) : listings.length === 0 ? (
          <p className="text-sm text-black/60 py-6">
            You don't have any listings yet. Create one in My Profile, then
            come back to flip HILUX on.
          </p>
        ) : (
          <div className="divide-y divide-black/10">
            {listings.map((row) => {
              const isSaving = savingId === row.id;
              const name = row.business_name ?? "Untitled listing";
              const category = row.category ?? "—";
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-black truncate">
                      {name}
                    </p>
                    <p className="text-xs text-black/55 truncate">
                      {category}
                      {row.application_status &&
                      row.application_status !== "approved"
                        ? ` · ${row.application_status}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black/40" />
                    ) : null}
                    <Switch
                      checked={row.hilux_enabled}
                      disabled={isSaving}
                      onCheckedChange={(v) => toggle(row, v)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
