import { useEffect, useRef, useState } from "react";
import { Store, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { VendorCardAttachment } from "@/lib/messageAttachments";

// Composer action: search approved vendors and drop one into the conversation
// as a tappable card. Built for the "host introduces one vendor to another"
// flow, but it's chat-agnostic — the caller owns how the card is sent.
//
// Sends a card, NOT a connection: the recipient still chooses whether to
// message the vendor from their profile. That keeps hosts from creating
// unrequested vendor-to-vendor threads and leaves the Pro-tier gate on
// find_or_create_partner_thread untouched.

interface VendorRow {
  id: string;
  business_name: string | null;
  category: string | null;
  location: string | null;
  logo_url: string | null;
}

const MIN_QUERY = 2;

export function ShareVendorButton({
  onShare,
  disabled,
}: {
  /** Send the card. Return false to keep the popover open on failure. */
  onShare: (card: VendorCardAttachment) => Promise<boolean> | boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VendorRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  // Drops responses for superseded queries so fast typing can't render
  // stale results over newer ones.
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setSearching(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    setSearching(true);
    const t = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("vendor_profiles")
        .select("id, business_name, category, location, logo_url")
        .eq("application_status", "approved")
        .ilike("business_name", `%${q}%`)
        .order("business_name", { ascending: true })
        .limit(10);
      if (reqId !== reqIdRef.current) return;
      setResults((data ?? []) as VendorRow[]);
      setSearching(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  async function pick(v: VendorRow) {
    if (sendingId) return;
    setSendingId(v.id);
    const ok = await onShare({
      kind: "vendor_card",
      vendor_id: v.id,
      business_name: v.business_name ?? "Vendor",
      category: v.category,
      location: v.location,
      logo_url: v.logo_url,
    });
    setSendingId(null);
    if (ok !== false) {
      setOpen(false);
      setQuery("");
      setResults([]);
      toast.success(`Shared ${v.business_name ?? "vendor"}`);
    }
  }

  const trimmed = query.trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Share a vendor profile"
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 text-muted-foreground disabled:opacity-50"
        >
          <Store className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="text-sm font-semibold">Share a vendor</p>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
          Send a vendor's profile into this conversation.
        </p>
        <div className="relative">
          <Search
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendors…"
            aria-label="Search vendors by business name"
            className="pl-9 rounded-full"
          />
        </div>
        <div className="mt-2 max-h-64 overflow-y-auto" aria-live="polite">
          {searching ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : trimmed.length < MIN_QUERY ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Type at least {MIN_QUERY} characters.
            </p>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No approved vendors match “{trimmed}”.
            </p>
          ) : (
            results.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => void pick(v)}
                disabled={sendingId !== null}
                className="w-full flex items-center gap-3 p-2 rounded-sm hover:bg-secondary/60 text-left disabled:opacity-50"
              >
                {v.logo_url ? (
                  <img
                    src={v.logo_url}
                    alt=""
                    loading="lazy"
                    className="w-8 h-8 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center flex-shrink-0">
                    <Store className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {v.business_name ?? "Vendor"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[v.category, v.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {sendingId === v.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                ) : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
