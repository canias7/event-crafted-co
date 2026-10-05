import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Loader2, Layers, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatCents } from "@/lib/format";

// Vendor-side bundle editor. Vendor creates a bundle, picks 1-N
// other vendors to include (free-text business names — we look up
// the vendor_id by exact name match), sets a combined price.
//
// Members add by vendor name lookup — keeps the form simple. Future
// improvement: typeahead with autocomplete from vendor_profiles.

interface BundleRow {
  id: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  is_active: boolean;
  members: Array<{
    vendor_id: string;
    role: string | null;
    display_order: number;
    vendor: { business_name: string } | null;
  }>;
}

export function VendorBundlesManager({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation("vendorTools");
  const [rows, setRows] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BundleRow | null>(null);

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_bundles")
      .select(
        "id, name, description, price_cents, is_active, members:vendor_bundle_members(vendor_id, role, display_order, vendor:vendor_profiles!vendor_bundle_members_vendor_id_fkey(business_name))",
      )
      .eq("primary_vendor_id", vendorId)
      .order("created_at", { ascending: true });
    setRows((data as BundleRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function deleteBundle(b: BundleRow) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_bundles")
      .delete()
      .eq("id", b.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("bundles.deleted"));
    load();
  }

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-label text-muted-foreground inline-flex items-center gap-1.5">
            <Layers className="w-3 h-3" />
            {t("bundles.title")}
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {t("bundles.intro")}
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
            className="rounded-full"
          >
            <Plus className="w-3 h-3 mr-1.5" />
            {t("bundles.newBundle")}
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-4">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-3">
          {t("bundles.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((b) => (
            <li
              key={b.id}
              className="card-soft p-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium">{b.name}</p>
                  {!b.is_active && (
                    <span className="text-[10px] uppercase text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                      {t("bundles.hidden")}
                    </span>
                  )}
                </div>
                {b.description && (
                  <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                    {b.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("bundles.vendorCount", { count: b.members.length })}
                  {b.price_cents != null
                    ? ` · ${formatCents(b.price_cents)}`
                    : ""}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditing(b);
                      setEditorOpen(true);
                    }}
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={t("bundles.deleteAria", { name: b.name })}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-3xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-editorial text-3xl">
                          {t("bundles.deleteTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm leading-relaxed">
                          {t("bundles.deleteBody", { name: b.name })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="gap-2 sm:gap-0">
                        <AlertDialogCancel className="rounded-full">
                          {t("common.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.preventDefault();
                            deleteBundle(b);
                          }}
                          className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t("bundles.delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <BundleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        bundle={editing}
        primaryVendorId={vendorId}
        onSaved={load}
      />
    </div>
  );
}

function BundleEditor({
  open,
  onOpenChange,
  bundle,
  primaryVendorId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: BundleRow | null;
  primaryVendorId: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation("vendorTools");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [memberNames, setMemberNames] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(bundle?.name ?? "");
      setDescription(bundle?.description ?? "");
      setPriceDollars(
        bundle?.price_cents != null
          ? String(Math.round(bundle.price_cents / 100))
          : "",
      );
      setIsActive(bundle?.is_active ?? true);
      setMemberNames(
        (bundle?.members ?? [])
          .map((m) => m.vendor?.business_name ?? "")
          .filter(Boolean)
          .join(", "),
      );
    }
  }, [open, bundle]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("bundles.nameRequired"));
      return;
    }
    setSubmitting(true);
    const cents = priceDollars
      ? Math.round(Number.parseFloat(priceDollars) * 100)
      : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    let bundleId = bundle?.id;
    const payload = {
      primary_vendor_id: primaryVendorId,
      name: name.trim(),
      description: description.trim() || null,
      price_cents: cents,
      is_active: isActive,
    };
    if (bundleId) {
      const { error } = await sb
        .from("vendor_bundles")
        .update(payload)
        .eq("id", bundleId);
      if (error) {
        setSubmitting(false);
        toast.error(error.message);
        return;
      }
    } else {
      const { data, error } = await sb
        .from("vendor_bundles")
        .insert(payload)
        .select("id")
        .single();
      if (error || !data) {
        setSubmitting(false);
        toast.error(error?.message ?? t("bundles.couldntSave"));
        return;
      }
      bundleId = (data as { id: string }).id;
    }

    // Replace members. Names are comma-separated. Look up by exact
    // business_name match — vendors must already exist in the
    // marketplace. We always include the primary vendor as member 0.
    const names = memberNames
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const { data: matched } = await sb
      .from("vendor_profiles")
      .select("id, business_name")
      .in("business_name", names);
    const matchedRows =
      (matched as Array<{ id: string; business_name: string }> | null) ?? [];

    await sb.from("vendor_bundle_members").delete().eq("bundle_id", bundleId);

    // Primary vendor as member 0, then partners in order they were
    // typed.
    const memberRows = [
      { bundle_id: bundleId!, vendor_id: primaryVendorId, display_order: 0 },
      ...names.map((n, i) => {
        const found = matchedRows.find(
          (r) => r.business_name.toLowerCase() === n.toLowerCase(),
        );
        return found
          ? {
              bundle_id: bundleId!,
              vendor_id: found.id,
              display_order: i + 1,
            }
          : null;
      }).filter(Boolean) as Array<{
        bundle_id: string;
        vendor_id: string;
        display_order: number;
      }>,
    ];
    if (memberRows.length > 0) {
      await sb.from("vendor_bundle_members").insert(memberRows);
    }

    setSubmitting(false);
    const missing = names.length - (memberRows.length - 1);
    if (missing > 0) {
      toast.warning(t("bundles.partialMatch", { count: missing }));
    } else {
      toast.success(t("common.saved"));
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {bundle ? t("bundles.editBundle") : t("bundles.newBundle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="b-name">{t("bundles.bundleName")}</Label>
            <Input
              id="b-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("bundles.namePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-desc">{t("bundles.description")}</Label>
            <Textarea
              id="b-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("bundles.descriptionPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-price">{t("bundles.price")}</Label>
            <Input
              id="b-price"
              type="number"
              min={0}
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              placeholder="6500"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-members">
              {t("bundles.partners")}
            </Label>
            <Input
              id="b-members"
              value={memberNames}
              onChange={(e) => setMemberNames(e.target.value)}
              placeholder="Hudson Valley Cinema, Bloom + Bough"
            />
            <p className="text-xs text-muted-foreground">
              {t("bundles.partnersHint")}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <div>
              <p className="text-sm font-medium">{t("bundles.active")}</p>
              <p className="text-xs text-muted-foreground">
                {t("bundles.activeHint")}
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("bundles.saveBundle")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
