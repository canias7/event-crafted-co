import { useEffect, useState } from "react";
import {
  Bookmark,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Proposal templates picker — drops into the proposal compose
// modal. Vendor picks a saved template; on apply we hydrate the
// title / line items / deposit / terms from it.

interface PendingLineItem {
  description: string;
  quantity: number;
  unit_price: string;
}

interface ProposalTemplate {
  id: string;
  name: string;
  title: string;
  line_items: PendingLineItem[];
  deposit_pct: number | null;
  terms: string | null;
  is_default: boolean;
  use_count: number;
}

export interface ProposalTemplateApplied {
  title: string;
  lineItems: PendingLineItem[];
  depositPct: number | null;
  terms: string;
}

export function ProposalTemplatePicker({
  vendorId,
  current,
  onApply,
}: {
  vendorId: string;
  current: ProposalTemplateApplied;
  onApply: (t: ProposalTemplateApplied) => void;
}) {
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [editing, setEditing] = useState<ProposalTemplate | null>(null);

  async function load() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("proposal_templates")
      .select(
        "id, name, title, line_items, deposit_pct, terms, is_default, use_count",
      )
      .eq("vendor_id", vendorId);
    setTemplates((data as ProposalTemplate[]) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    if (vendorId && !loaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, loaded]);

  async function applyTemplate(t: ProposalTemplate) {
    onApply({
      title: t.title,
      lineItems: t.line_items,
      depositPct: t.deposit_pct,
      terms: t.terms ?? "",
    });
    toast.success(`Applied "${t.name}"`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("proposal_templates")
      .update({ use_count: t.use_count + 1 })
      .eq("id", t.id);
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this template?")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("proposal_templates")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    load();
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full h-8"
            >
              <Bookmark className="w-3 h-3 mr-1.5" />
              Use template
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">
              Saved proposal templates
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {templates.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                No templates yet. Save your current draft to start.
              </p>
            ) : (
              templates.map((t) => (
                <div key={t.id} className="flex items-center group">
                  <DropdownMenuItem
                    onClick={() => applyTemplate(t)}
                    className="flex-1 flex-col items-start gap-0.5"
                  >
                    <span className="text-sm font-medium inline-flex items-center gap-1.5">
                      {t.is_default && <Check className="w-3 h-3 text-accent" />}
                      {t.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground line-clamp-1 w-full">
                      {t.title} · {t.line_items.length} item
                      {t.line_items.length === 1 ? "" : "s"}
                    </span>
                  </DropdownMenuItem>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(t);
                      setSaveOpen(true);
                    }}
                    className="p-2 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                    aria-label="Edit"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(t.id);
                    }}
                    className="p-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full h-8"
          onClick={() => {
            setEditing(null);
            setSaveOpen(true);
          }}
          disabled={!current.title.trim() && current.lineItems.length === 0}
        >
          <Plus className="w-3 h-3 mr-1.5" />
          Save as template
        </Button>
      </div>

      <SaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        vendorId={vendorId}
        editing={editing}
        defaults={current}
        onSaved={() => {
          load();
          setEditing(null);
        }}
      />
    </>
  );
}

function SaveDialog({
  open,
  onOpenChange,
  vendorId,
  editing,
  defaults,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  editing: ProposalTemplate | null;
  defaults: ProposalTemplateApplied;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");
  const [depositPct, setDepositPct] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const lineItems = editing?.line_items ?? defaults.lineItems;

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setTitle(editing?.title ?? defaults.title);
      setTerms(editing?.terms ?? defaults.terms);
      setDepositPct(
        editing?.deposit_pct != null
          ? String(editing.deposit_pct)
          : defaults.depositPct != null
            ? String(defaults.depositPct)
            : "",
      );
      setIsDefault(editing?.is_default ?? false);
    }
  }, [open, editing, defaults]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !title.trim()) {
      toast.error("Name and title required");
      return;
    }
    setSubmitting(true);
    const payload = {
      vendor_id: vendorId,
      name: name.trim(),
      title: title.trim(),
      line_items: lineItems,
      deposit_pct: depositPct
        ? Math.max(0, Math.min(100, Number.parseInt(depositPct, 10)))
        : null,
      terms: terms.trim() || null,
      is_default: isDefault,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const op = editing
      ? sb.from("proposal_templates").update(payload).eq("id", editing.id)
      : sb.from("proposal_templates").insert(payload);
    const { error } = await op;
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Updated" : "Saved");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl">
            {editing ? "Edit template" : "Save proposal template"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Reuse this proposal body next time. Line items + deposit %
            + terms get pre-filled — you just adjust quantities.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="pt-name">Template name</Label>
            <Input
              id="pt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Standard photo package"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-title">Proposal title</Label>
            <Input
              id="pt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Wedding photography proposal"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-deposit">Deposit (%)</Label>
            <Input
              id="pt-deposit"
              type="number"
              min={0}
              max={100}
              value={depositPct}
              onChange={(e) => setDepositPct(e.target.value)}
              placeholder="50"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-terms">Terms</Label>
            <Textarea
              id="pt-terms"
              rows={3}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Line items ({lineItems.length}) come from your current draft.
            Edit the draft first if you want to update them.
          </p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded"
            />
            Default template (auto-loads when opening proposal form)
          </label>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
