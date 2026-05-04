import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, Search, Heart, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RecRow {
  id: string;
  recommended_id: string;
  note: string | null;
  display_order: number;
  recommended: {
    id: string;
    business_name: string;
    category: string;
    location: string | null;
  } | null;
}

interface VendorOption {
  id: string;
  business_name: string;
  category: string;
  location: string | null;
}

const recsTable = () => supabase.from("vendor_recommendations");

export function VendorRecommendationManager({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const [recs, setRecs] = useState<RecRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await recsTable()
      .select(
        "id, recommended_id, note, display_order, recommended:vendor_profiles!vendor_recommendations_recommended_id_fkey(id, business_name, category, location)",
      )
      .eq("recommender_id", vendorId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    setRecs((data as RecRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function deleteRec(id: string) {
    setDeletingId(id);
    const { error } = await recsTable().delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRecs((p) => p.filter((r) => r.id !== id));
    toast.success("Removed");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-label text-muted-foreground">
            Vendors you recommend
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Curate a short list of vendors you've worked with — surfaces on your
            public profile as "Vendors we love"
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add a vendor
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-24 rounded-sm bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : recs.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-6 text-center">
          <Heart className="w-6 h-6 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Hosts trust referrals more than ranked listings. Add 3–5 vendors
            you'd vouch for.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {recs.map((r) => (
            <div
              key={r.id}
              className="rounded-sm border border-border bg-card p-4 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="font-display text-base truncate">
                    {r.recommended?.business_name ?? "Vendor"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.recommended?.category}
                    {r.recommended?.location ? ` · ${r.recommended.location}` : ""}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={deletingId === r.id}
                    onClick={() => deleteRec(r.id)}
                    aria-label="Remove recommendation"
                  >
                    {deletingId === r.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    )}
                  </Button>
                )}
              </div>
              {r.note && (
                <p className="text-xs text-muted-foreground leading-relaxed mt-2 line-clamp-2">
                  {r.note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && pickerOpen && (
        <RecommendPicker
          recommenderId={vendorId}
          onClose={() => setPickerOpen(false)}
          onAdded={() => {
            setPickerOpen(false);
            load();
          }}
          excludeIds={new Set(recs.map((r) => r.recommended_id))}
          nextOrder={
            recs.reduce((m, r) => Math.max(m, r.display_order), -1) + 1
          }
        />
      )}
    </div>
  );
}

function RecommendPicker({
  recommenderId,
  onClose,
  onAdded,
  excludeIds,
  nextOrder,
}: {
  recommenderId: string;
  onClose: () => void;
  onAdded: () => void;
  excludeIds: Set<string>;
  nextOrder: number;
}) {
  const [search, setSearch] = useState("");
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<VendorOption | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("vendor_profiles")
      .select("id, business_name, category, location")
      .neq("id", recommenderId)
      .order("business_name", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        setVendors(
          ((data as VendorOption[] | null) ?? []).filter(
            (v) => !excludeIds.has(v.id),
          ),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recommenderId, excludeIds]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return vendors.slice(0, 30);
    return vendors
      .filter(
        (v) =>
          v.business_name.toLowerCase().includes(t) ||
          v.category.toLowerCase().includes(t) ||
          (v.location ?? "").toLowerCase().includes(t),
      )
      .slice(0, 30);
  }, [vendors, search]);

  async function add() {
    if (!picked) return;
    setSubmitting(true);
    const { error } = await recsTable().insert({
      recommender_id: recommenderId,
      recommended_id: picked.id,
      note: note.trim() || null,
      display_order: nextOrder,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Added ${picked.business_name}`);
    onAdded();
  }

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Recommend a vendor
          </DialogTitle>
          <DialogDescription>
            Pick a vendor to vouch for, optionally add a short note.
          </DialogDescription>
        </DialogHeader>
        {!picked ? (
          <div className="space-y-3 pt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, category, or city"
                className="h-10 pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
              {loading ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Loading vendors…
                </p>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No matches.
                </p>
              ) : (
                filtered.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setPicked(v)}
                    className="w-full text-left px-3 py-2 rounded-sm border border-border hover:border-foreground/30 hover:bg-secondary/40"
                  >
                    <p className="text-sm font-medium truncate">
                      {v.business_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {v.category}
                      {v.location ? ` · ${v.location}` : ""}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <div className="rounded-sm bg-secondary/40 p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {picked.business_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {picked.category}
                  {picked.location ? ` · ${picked.location}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setPicked(null)}
                aria-label="Pick a different vendor"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rec-note">Why you recommend them (optional)</Label>
              <Textarea
                id="rec-note"
                rows={3}
                placeholder="Worked with them on three weddings — always on time, beautiful eye for color."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        )}
        <DialogFooter className="pt-2 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={add}
            disabled={!picked || submitting}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Add recommendation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
