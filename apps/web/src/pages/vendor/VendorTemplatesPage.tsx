// Vendor — quick-reply template manager.
//
// Templates are tied to a vendor_profiles row (per-listing). Since a
// vendor account can own multiple listings, the page header lets the
// vendor switch which listing's templates they're editing. CRUD is
// inline — list of cards with a New / Edit dialog.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useCategoryNames } from "@/lib/categoryNames";
import {
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { vendorNavItems as navItems } from "@/data/navItems";

interface VendorOption {
  id: string;
  business_name: string | null;
  category: string | null;
}

interface Template {
  id: string;
  vendor_id: string;
  name: string;
  body: string;
  updated_at: string;
}

// "Use 3 starter templates" writes these into the vendor's own
// templates (starters.<id> in vendorTemplates.json), in the language the
// vendor is using; from then on they're the vendor's text to edit and
// send as written.
const STARTER_IDS = ["thanks", "proposal", "unavailable"] as const;

export default function VendorTemplatesPage() {
  const { t } = useTranslation("vendorTemplates");
  const categoryNames = useCategoryNames();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [vendorOpts, setVendorOpts] = useState<VendorOption[] | null>(null);
  const [activeVendorId, setActiveVendorId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);

  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Resolve listings (vendor_profiles) for the active user. Anyone
  // landing here without an approved listing gets bounced — RLS would
  // 403 every insert anyway.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase
      .from("vendor_profiles")
      .select("id, business_name, category")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        const opts = (data as VendorOption[]) ?? [];
        setVendorOpts(opts);
        if (opts.length === 0) {
          toast.info(i18n.t("toast.needListing", { ns: "vendorTemplates" }));
          navigate("/vendor/me");
          return;
        }
        setActiveVendorId(opts[0].id);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, navigate]);

  // Re-fetch templates whenever the active listing changes.
  useEffect(() => {
    if (!activeVendorId) return;
    let cancelled = false;
    setTemplates(null);
    supabase
      .from("vendor_message_templates")
      .select("id, vendor_id, name, body, updated_at")
      .eq("vendor_id", activeVendorId)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setTemplates((data as Template[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [activeVendorId]);

  const activeVendor = useMemo(
    () => vendorOpts?.find((v) => v.id === activeVendorId) ?? null,
    [vendorOpts, activeVendorId],
  );

  function openNew() {
    setEditing("new");
    setName("");
    setBody("");
  }

  function openEdit(t: Template) {
    setEditing(t);
    setName(t.name);
    setBody(t.body);
  }

  async function save() {
    if (!activeVendorId) return;
    const trimmedName = name.trim();
    const trimmedBody = body.trim();
    if (!trimmedName || !trimmedBody) {
      toast.error(t("toast.required"));
      return;
    }
    setSaving(true);
    if (editing === "new") {
      const { data, error } = await supabase
        .from("vendor_message_templates")
        .insert({
          vendor_id: activeVendorId,
          name: trimmedName,
          body: trimmedBody,
        })
        .select("id, vendor_id, name, body, updated_at")
        .single();
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setTemplates((prev) => [data as Template, ...(prev ?? [])]);
      toast.success(t("toast.saved"));
    } else if (editing) {
      const { data, error } = await supabase
        .from("vendor_message_templates")
        .update({ name: trimmedName, body: trimmedBody })
        .eq("id", editing.id)
        .select("id, vendor_id, name, body, updated_at")
        .single();
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setTemplates((prev) =>
        (prev ?? []).map((t) => (t.id === editing.id ? (data as Template) : t)),
      );
      toast.success(t("toast.updated"));
    }
    setEditing(null);
  }

  async function remove() {
    if (!confirmDel) return;
    setDeleting(true);
    const { error } = await supabase
      .from("vendor_message_templates")
      .delete()
      .eq("id", confirmDel.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTemplates((prev) => (prev ?? []).filter((t) => t.id !== confirmDel.id));
    setConfirmDel(null);
    toast.success(t("toast.deleted"));
  }

  async function seedStarters() {
    if (!activeVendorId) return;
    setSaving(true);
    const rows = STARTER_IDS.map((id) => ({
      vendor_id: activeVendorId,
      name: t(`starters.${id}.name`),
      body: t(`starters.${id}.body`),
    }));
    const { data, error } = await supabase
      .from("vendor_message_templates")
      .insert(rows)
      .select("id, vendor_id, name, body, updated_at");
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTemplates((prev) => [...(data as Template[]), ...(prev ?? [])]);
    toast.success(t("toast.starters"));
  }

  const multi = (vendorOpts?.length ?? 0) > 1;

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title={t("sidebarTitle")} backPath="/" />

      <main id="main-content" className="flex-1 pb-24 lg:pb-0">
        <div className="backdrop-blur-sm px-5 md:px-8 py-5 sticky top-0 z-40 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-editorial text-3xl">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <Button
            onClick={openNew}
            disabled={!activeVendorId}
            className="rounded-full shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {t("new")}
          </Button>
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-4">
          {multi && activeVendor ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="rounded-full font-normal"
                >
                  <span className="truncate max-w-[20ch]">
                    {activeVendor.business_name ?? t("listing")}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {vendorOpts?.map((v) => (
                  <DropdownMenuItem
                    key={v.id}
                    onClick={() => setActiveVendorId(v.id)}
                    className="cursor-pointer"
                  >
                    {v.business_name ?? t("untitledListing")}
                    {v.category ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {categoryNames.sub(v.category)}
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {templates === null ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background/50 p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-accent/10 text-accent inline-flex items-center justify-center mb-3">
                <FileText className="w-5 h-5" />
              </div>
              <h2 className="font-editorial text-2xl mb-1">
                {t("empty.title")}
              </h2>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                {t("empty.body")}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={openNew} className="rounded-full">
                  <Plus className="w-4 h-4 mr-1.5" />
                  {t("empty.writeFirst")}
                </Button>
                <Button
                  variant="outline"
                  onClick={seedStarters}
                  disabled={saving}
                  className="rounded-full"
                >
                  {t("empty.useStarters")}
                </Button>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {templates.map((tpl) => (
                <li
                  key={tpl.id}
                  className="rounded-2xl bg-background/60 border border-border p-4 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{tpl.name}</p>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
                      {tpl.body}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(tpl)}
                      aria-label={t("edit")}
                      className="rounded-full"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmDel(tpl)}
                      aria-label={t("delete")}
                      className="rounded-full text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <MobileNav items={navItems} />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-editorial text-2xl">
              {editing === "new" ? t("dialog.newTitle") : t("dialog.editTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("dialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t("dialog.name")}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("dialog.namePlaceholder")}
                maxLength={80}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t("dialog.body")}
              </label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("dialog.bodyPlaceholder")}
                rows={6}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              className="rounded-full"
              disabled={saving}
            >
              {t("dialog.cancel")}
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="rounded-full"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {t("dialog.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDel !== null}
        onOpenChange={(open) => !open && setConfirmDel(null)}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-editorial text-2xl">
              {t("confirmDelete.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDelete.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deleting} className="rounded-full">
              {t("confirmDelete.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={deleting}
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {t("confirmDelete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
