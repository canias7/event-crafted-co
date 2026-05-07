import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface SavedVendorsApi {
  savedIds: Set<string>;
  isSaved: (vendorId: string) => boolean;
  /** Toggle save state. Real DB rows persist; non-real (sample data) toasts. */
  toggle: (vendorId: string, opts?: { isReal?: boolean }) => Promise<void>;
  loading: boolean;
}

const savedTable = () => supabase.from("saved_vendors");

export function useSavedVendors(): SavedVendorsApi {
  const { user } = useAuth();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSavedIds(new Set());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    savedTable()
      .select("vendor_id")
      .eq("host_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setSavedIds(new Set((data ?? []).map((r) => r.vendor_id)));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isSaved = useCallback(
    (vendorId: string) => savedIds.has(vendorId),
    [savedIds],
  );

  const toggle = useCallback<SavedVendorsApi["toggle"]>(
    async (vendorId, opts) => {
      if (!user) {
        toast.info("Sign in to save vendors");
        return;
      }
      if (opts?.isReal === false) {
        toast.info(
          "This vendor is a sample listing — saving will work once they're live.",
        );
        return;
      }

      const wasSaved = savedIds.has(vendorId);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(vendorId);
        else next.add(vendorId);
        return next;
      });

      const result = wasSaved
        ? await savedTable()
            .delete()
            .eq("host_id", user.id)
            .eq("vendor_id", vendorId)
        : await savedTable().insert({
            host_id: user.id,
            vendor_id: vendorId,
          });

      if (result.error) {
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(vendorId);
          else next.delete(vendorId);
          return next;
        });
        toast.error(result.error.message);
      }
    },
    [user, savedIds],
  );

  return { savedIds, isSaved, toggle, loading };
}
