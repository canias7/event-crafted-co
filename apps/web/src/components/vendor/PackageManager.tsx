import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Edit2,
  X,
  Package,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface VendorPackage {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  includes: string[];
  display_order: number;
  is_active: boolean;
}

const packagesTable = () => supabase.from("vendor_packages");

interface Props {
  vendorId: string;
  canEdit: boolean;
}

export function PackageManager({ vendorId, canEdit }: Props) {
  const [packages, setPackages] = useState<VendorPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<VendorPackage | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Track which package is mid-toggle so a rapid double-click on the
  // visibility switch can't fire two competing UPDATEs.
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await packagesTable()
      .select("id, name, description, price_cents, includes, display_order, is_active")
      .eq("vendor_id", vendorId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    setPackages((data as VendorPackage[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function deletePackage(id: string) {
    setDeletingId(id);
    const { error } = await packagesTable().delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPackages((prev) => prev.filter((p) => p.id !== id));
    toast.success("Package deleted");
  }

  async function toggleActive(pkg: VendorPackage) {
    if (togglingId === pkg.id) return;
    setTogglingId(pkg.id);
    const { error } = await packagesTable()
      .update({ is_active: !pkg.is_active })
      .eq("id", pkg.id);
    setTogglingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPackages((prev) =>
      prev.map((p) =>
        p.id === pkg.id ? { ...p, is_active: !p.is_active } : p,
      ),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-label text-muted-foreground">Pricing packages</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tiers hosts can pick from when sending you an inquiry
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New package
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-32 rounded-sm bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-8 text-center">
          <Package className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium mb-1">No packages yet</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Adding 2–4 priced tiers helps hosts pick the right fit and
            converts inquiries faster than a single base price.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {packages.map((p) => (
            <div
              key={p.id}
              className={`rounded-sm border bg-card p-4 ${
                p.is_active ? "border-border" : "border-border/40 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-display text-base">{p.name}</p>
                  <p className="text-lg font-semibold tnum mt-0.5">
                    ${(p.price_cents / 100).toLocaleString()}
                  </p>
                </div>
                {!p.is_active && (
                  <Badge variant="outline" className="text-xs">
                    Hidden
                  </Badge>
                )}
              </div>
              {p.description && (
                <p className="text-xs text-muted-foreground leading-relaxed mb-2 line-clamp-3">
                  {p.description}
                </p>
              )}
              {p.includes.length > 0 && (
                <ul className="text-xs space-y-0.5 text-muted-foreground mb-3">
                  {p.includes.slice(0, 4).map((inc, i) => (
                    <li key={i} className="truncate">· {inc}</li>
                  ))}
                  {p.includes.length > 4 && (
                    <li className="text-muted-foreground/60">
                      +{p.includes.length - 4} more
                    </li>
                  )}
                </ul>
              )}
              {canEdit && (
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.is_active}
                      disabled={togglingId === p.id}
                      onCheckedChange={() => toggleActive(p)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {p.is_active ? "Visible" : "Hidden"}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditing(p);
                        setEditorOpen(true);
                      }}
                      aria-label="Edit package"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={deletingId === p.id}
                      onClick={() => deletePackage(p.id)}
                      aria-label="Delete package"
                    >
                      {deletingId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <PackageEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          vendorId={vendorId}
          editing={editing}
          nextOrder={
            packages.reduce((m, p) => Math.max(m, p.display_order), -1) + 1
          }
          onSuccess={load}
        />
      )}
    </div>
  );
}

function PackageEditor({
  open,
  onOpenChange,
  vendorId,
  editing,
  nextOrder,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  editing: VendorPackage | null;
  nextOrder: number;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [includesText, setIncludesText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setDescription(editing?.description ?? "");
      setPrice(
        editing ? Math.round(editing.price_cents / 100).toString() : "",
      );
      setIncludesText(editing ? editing.includes.join("\n") : "");
    }
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !price) {
      toast.error("Name and price are required");
      return;
    }
    const priceCents = Math.round(Number.parseFloat(price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      toast.error("Price must be a positive number");
      return;
    }
    const includes = includesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    setSubmitting(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price_cents: priceCents,
      includes,
    };
    const { error } = editing
      ? await packagesTable().update(payload).eq("id", editing.id)
      : await packagesTable().insert({
          vendor_id: vendorId,
          display_order: nextOrder,
          ...payload,
        });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Package updated" : "Package added");
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit package" : "New package"}
          </DialogTitle>
          <DialogDescription>
            Concrete tiers convert inquiries faster than "starting from $X".
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="pkg-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pkg-name"
              placeholder="e.g. Half-day coverage"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pkg-price">
              Price (USD) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pkg-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="50"
              placeholder="2500"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pkg-desc">Description</Label>
            <Textarea
              id="pkg-desc"
              rows={2}
              placeholder="Who this package is for and what makes it different."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pkg-includes">What's included</Label>
            <Textarea
              id="pkg-includes"
              rows={5}
              placeholder={"4 hours of coverage\n300 edited photos\nOnline gallery delivery\nPrint release"}
              value={includesText}
              onChange={(e) => setIncludesText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">One bullet per line.</p>
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editing ? "Save" : "Add package"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
